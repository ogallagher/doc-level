/**
 * Read texts and provide analysis.
 */

import { zodResponseFormat } from 'openai/helpers/zod'
import path from 'path'
import { readFile, readdir } from 'node:fs/promises'
import * as HtmlParser from 'node-html-parser'
import { Maturity, TextProfile, Difficulty, Topic, MATURITY_TYPE_PROFANE, Ideology } from './textProfile.js'
import { CustomMaturityTypes, Ideologies, ReadingDifficulty, Topics } from './messageSchema.js'
import { formatString } from './stringUtil.js'
import {
  READING_DIFFICULTY_REASONS_MAX as _difficultReasonsMax,
  READING_DIFFICULTY_WORDS_MIN as _difficultWordsMin,
  READING_DIFFICULTY_PHRASES_MIN as _difficultPhrasesMin,
  TOPICS_MAX as _topicsMax,
  TOPIC_EXAMPLES_MAX as _topicExamplesMax,
  IDEOLOGIES_MAX as _ideologiesMax,
  IDEOLOGY_EXAMPLES_MAX as _ideologyExamplesMax
} from './config.js'
import { StoriesIndex } from './storiesIndex.js'
import { downloadWebpage, fileExists, initDir, writeText } from './writer.js'

/**
 * @typedef {import('pino').Logger} Logger
 * 
 * @typedef {import('openai').OpenAI} OpenAI
 */
/**
 * @typedef {import('./messageSchema.js').MessageSchema} MessageSchema
 * @typedef {import('./messageSchema.js').CustomMaturityTypesResponse} CustomMaturityTypesResponse
 * @typedef {import('./messageSchema.js').ReadingDifficultyResponse} ReadingDifficultyResponse
 * @typedef {import('./messageSchema.js').ExtractStoriesResponse} ExtractStoriesResponse
 * @typedef {import('./messageSchema.js').TopicsResponse} TopicsResponse
 * @typedef {import('./messageSchema.js').Story} Story
 * @typedef {import('./messageSchema.js').IdeologiesResponse} IdeologiesResponse
 */

let PROMPT_DIR = path.join(import.meta.dirname, 'resource/prompt')
// prompts for ai language model
export const PROMPT_CUSTOM_MATURITY_FILE = 'customMaturity.txt'
export const PROMPT_READING_DIFFICULTY_FILE = 'readingDifficulty.txt'
export const PROMPT_TOPICS_FILE = 'topics.txt'
export const PROMPT_IDEOLOGIES_FILE = 'ideologyPolitics.txt'
// prompts for human user
export const PROMPT_BROWSE_STORIES_FILE = 'browseStories.txt'

/**
 * @type {Logger}
 */
let logger
/**
 * AI language model interface.
 */ 
let _ai
/**
 * Language model identifier.
 * 
 * @type {string}
 */  
let _chatModel
/**
 * @type {string}
 */
let _maturityModel
/**
 * @type {number}
 */
let _difficultWordsMax
/**
 * @type {number}
 */
let _difficultPhrasesMax

/**
 * 
 * @param {Logger} parentLogger 
 * @param {OpenAI} ai 
 * @param {string} chatModel 
 * @param {string} maturityModel 
 * @param {number} difficultWordsMax 
 * @param {number} difficultPhrasesMax 
 * @returns {Promise<undefined>}
 */
export function init(parentLogger, ai, chatModel, maturityModel, difficultWordsMax, difficultPhrasesMax) {
  return new Promise(function(res, rej) {
    logger = parentLogger.child(
      {
        name: 'reader'
      }
    )
    
    _ai = ai
    _chatModel = chatModel
    _maturityModel = maturityModel
    _difficultWordsMax = difficultWordsMax
    _difficultPhrasesMax = difficultPhrasesMax
  
    logger.debug('end init')
    res()
  })
}

export class Context {
  /**
   * 
   * @param {string} text 
   * @param {TextProfile} profile 
   */
  constructor(text, profile, textPath) {
    /**
     * @type {string}
     */
    this.text = text
    /**
     * @type {TextProfile}
     */
    this.profile = profile
    /**
     * @type {string}
     */
    this.textPath = textPath
    /**
     * @type {string}
     */
    this.profilePath = `${textPath}.profile.json`
  }
}

/**
 * 
 * @param {string} instructions 
 * @param {string} request 
 * @param {MessageSchema} responseFormat 
 * @returns {Promise<*>}
 */
function getChatResponse(instructions, request, responseFormat) {
  return new Promise(function(res, rej) {
    logger.debug('call _ai.chat.completions')
    _ai.chat.completions.create({
      model: _chatModel,
      store: false,
      max_completion_tokens: null,
      n: 1,
      user: 'anonymous',
      response_format: zodResponseFormat(responseFormat, responseFormat.name),
      messages: [
        {
          // priority and contextual instructions
          role: 'developer',
          content: instructions
        },
        {
          // request
          role: 'user', 
          content: request
        }
      ]
    })
    .then(
      (completion) => {
        let response = completion.choices[0].message
        if(response.refusal) {
          logger.error('chat model refused to answer as requested')
          rej(filterAIError(completion.choices[0]))
        }
        else {
          try {
            res(JSON.parse(response.content))
          }
          catch (err) {
            logger.error('unable to parse chat response=%o', response)
            rej(err)
          }
        }
      },
      (err) => {
        rej(filterAIError(err))
      }
    )
  })
}

/**
 * Remove redundant properties from the ai API client error.
 * 
 * @param {*} err 
 * @returns Filtered error object.
 */
function filterAIError(err) {
  delete err.headers
  delete err.error
  return err
}

/**
 * 
 * @param {string} templatePath Path to prompt template relative to prompts dir.
 * @returns {Promise<string>}
 */
export function loadPrompt(templatePath, ...args) {
  return new Promise(function(res, rej) {
    readFile(path.join(PROMPT_DIR, templatePath), {encoding: 'utf-8'})
    .then(
      (data) => {
        let prompt = formatString(data, ...args)
        logger.debug('loaded prompt from %s length=%s', templatePath, prompt.length)
        res(prompt)
      },
      (err) => {
        logger.error('failed to load prompt from %s', templatePath)
        rej(err)
      }
    )
  })
}

/**
 * Fetch story summaries from an index/listing online.
 * 
 * @param {StoriesIndex} storiesIndex 
 * @param {number} storiesMax Max count of stories to fetch. Note the actual count of stories returned
 * will be rounded up to nearest whole page.
 * @param {string} storiesParentDir 
 * @returns {Promise<Map<number, Story[]>>} Paged list of stories.
 */
export function fetchStories(storiesIndex, storiesMax, storiesParentDir) {
  logger.info('fetch up to %s stories from %s and save to %s', storiesMax, storiesIndex, storiesParentDir)
  let pageNumber = storiesIndex.pageNumberMin
  let storiesCount = 0
  /**
   * @type {Map<number, Story[]>}
   */
  let pagedStories = new Map()
  /**
   * @type {string}
   */
  let storiesDir
  /**
   * @type {string}
   */
  let storiesIndexPath
  let writeStoryPromises = []
  /**
   * @type {Story[]}
   */
  let storySummaries
  /**
   * @type {Promise[]}
   */
  let fetchStory = async () => {
    if (storiesCount < storiesMax && pageNumber <= storiesIndex.pageNumberMax) {
      storiesDir = path.join(storiesParentDir, storiesIndex.name, `page-${pageNumber}`)
      await initDir(storiesDir)
      storiesIndexPath = path.join(storiesDir, 'index.json')

      storySummaries = []
      
      if (await fileExists(storiesIndexPath)) {
        // load count of stories from local page
        storySummaries = await loadText(storiesIndexPath).then(JSON.parse)
        logger.info(
          'local stories index=%s page=%s story-count=%s already exists; skip to next', 
          storiesIndex.name, pageNumber, storySummaries.length
        )
      }
      else {
        // download index webpage
        await downloadWebpage(
          storiesIndex.getPageUrl(pageNumber).toString(),
          path.join(storiesDir, storiesIndex.pageFilename),
          true,
          storiesIndex.pageRequestHeaders
        )
        // load webpage
        .then((indexPagePath) => {
          if (path.extname(storiesIndex.pageFilename) === '.json') {
            return loadText(indexPagePath)
            // Sometimes (Naver Blog) the result has some dirty characters at the beginning to be removed.
            .then((jsonStr) => {
              // from start of first object or array
              return jsonStr.substring(jsonStr.search(/[\{\[]/))
            })
            .then(JSON.parse)
          }
          else {
            return parseHtml(indexPagePath)
          }
        })
        // extract story summaries
        .then((indexPage) => {
          return storiesIndex.getStorySummaries(indexPage)
        })
        .then(
          /**
           * 
           * @param {Generator<Story>} storySummariesGenerator
           */
          (storySummariesGenerator) => {
            /**
             * @type {Story}
             */
            let storySummary
            while (storySummary = storySummariesGenerator.next().value) {
              storySummaries.push(storySummary)
            }
            logger.info('fetched %s stories from page %s', storySummaries.length, pageNumber)
            
            // save stories page to filesystem
            writeStoryPromises.push(
              writeText(
                JSON.stringify(storySummaries, undefined, 2),
                storiesIndexPath
              )
            )
          }
        )
      }

      pagedStories.set(pageNumber, storySummaries)

      storiesCount += storySummaries.length
      pageNumber++

      // recursive call for next page
      return fetchStory()
    }
    else {
      return Promise.all(writeStoryPromises)
    }
  }

  return fetchStory()
  .then(() => {
    return pagedStories
  })
}

/**
 * 
 * @param {string[]} paragraphs 
 * @param {number} lengthMax 
 * @returns {Promise<string[]>}
 */
export function reduceStory(paragraphs, lengthMax) {
  // minimum length of a paragraph
  const pgLenMin = 5

  return new Promise((res) => {
    if (lengthMax < pgLenMin || paragraphs.length < 1) {
      res([])
    }
    else if (paragraphs.length === 1) {
      if (paragraphs[0].length < pgLenMin) {
        res([])
      }
      else {
        res([paragraphs[0].substring(0, lengthMax)])
      }
    }
    else {
      let hi = 0
      let ti = paragraphs.length - 1
      let mi = (
        paragraphs.length > 2 
        ? Math.floor(paragraphs.length / 2)
        : undefined
      )
  
      let head = paragraphs[hi]
      let tail = paragraphs[ti]
      let mid = (mi !== undefined ? paragraphs[mi] : undefined)
  
      let pgLenSum = head.length + tail.length + (mid?.length || 0)
      if (
        pgLenSum >= lengthMax 
        || mid === undefined
      ) {
        // truncate ~3 samples and return
        let pgTrimAvg = (
          (pgLenSum - lengthMax) / (mid !== undefined ? 3 : 2)
        )
        res(
          [head, mid, tail]
          .filter((pg) => pg !== undefined)
          .map((pg) => pg.substring(0, pg.length - pgTrimAvg))
        )
      }
      else {
        let lenRem = Math.trunc((lengthMax - pgLenSum) / 2)
        
        // coallate additional samples
        Promise.all([
          reduceStory(paragraphs.slice(hi+1, mi), lenRem),
          reduceStory(paragraphs.slice(mi+1, ti), lenRem)
        ])
        .then(([torso, legs]) => {
          res(
            [ head, torso, mid, legs, tail ].flat()
            .filter((pg) => pg !== undefined)
          )
        })
      }
    }
  })
}

/**
 * Estimate maturity/offensiveness.
 * Since openai.moderations this does not account for curse words (offensive language not
 * directly targeted at anyone), we compensate with a separate chat prompt.
 * 
 * @param {Context} ctx
 * 
 * @returns {Promise<Maturity>}
 */
export function getMaturity(ctx) {  
  return Promise.all([
    // moderations
    new Promise(function(res, rej) {
      logger.debug('call _ai.moderations')
      _ai.moderations.create({
        model: _maturityModel,
        store: false,
        input: ctx.text
      })
      .then(
        (moderation) => {
          const result = moderation.results[0]

          let presents = [], absents = []
          Object.entries(result.categories).map(([category, isPresent]) => {
            (isPresent ? presents : absents).push(category)
          })
          res(new Maturity(
            result.flagged,
            presents,
            absents
          ))
        },
        (err) => {
          rej(filterAIError(err))
        }
      )
    }),
    // custom
    loadPrompt(PROMPT_CUSTOM_MATURITY_FILE, MATURITY_TYPE_PROFANE)
    .then(
      /**
       * @param {string} maturityPrompt 
       * @returns {CustomMaturityTypesResponse}
       */
      (maturityPrompt) => {
        return getChatResponse(
          maturityPrompt,
          ctx.text,
          CustomMaturityTypes
        )
      }
    )
    .then(
      (maturityResponse) => {
        let presents = [], absents = [], examples = []
        try {
          maturityResponse.maturityTypes.map(({ id, presence, examples: _examples }) => {
            (presence > 0.5 ? presents : absents).push(id)
            examples.concat(_examples)
          })
        
          return new Maturity(
            presents.length > 0,
            presents,
            absents,
            examples
          )
        }
        catch (err) {
          logger.error(
            'unable to parse maturityTypesResponse=%o', 
            maturityResponse
          )
          throw err
        }
      }
    )
  ])
  .then(
    ([m1, m2]) => {
      logger.info('maturity-moderations=%o', m1)
      logger.info('maturity-custom=%o', m2)
      m1.append(m2)
      return m1
    },
    (err) => {
      throw err
    }
  )
}

/**
 * Estimate reading difficulty.
 * 
 * @param {Context} ctx 
 * 
 * @returns {Promise<Difficulty>}
 */
export function getDifficulty(ctx) {
  return loadPrompt(
    PROMPT_READING_DIFFICULTY_FILE, 
    _difficultReasonsMax,
    _difficultWordsMin, _difficultWordsMax,
    _difficultPhrasesMin, _difficultPhrasesMax
  )
  .then(
    /**
     * 
     * @param {string} difficultyPrompt 
     * @returns {Promise<ReadingDifficultyResponse>}
     */
    (difficultyPrompt) => {
      return getChatResponse(
        difficultyPrompt,
        ctx.text,
        ReadingDifficulty
      )
    }
  )
  .then(
    (difficultyResponse) => {
      return new Difficulty(
        difficultyResponse.yearsOfEducation,
        difficultyResponse.readingLevelName,
        difficultyResponse.reasons,
        difficultyResponse.difficultWords,
        difficultyResponse.difficultPhrases
      )
    }
  )
}

export function getVocabularyNovelty(ctx) {
  
}

/**
 * 
 * @param {Context} ctx 
 * @returns {Promise<Ideology>}
 */
export function getIdeologies(ctx) {
  return loadPrompt(
    PROMPT_IDEOLOGIES_FILE,
    _ideologiesMax,
    _ideologyExamplesMax
  )
  .then(
    /**
     * 
     * @param {string} ideologiesPrompt 
     * @returns {Promise<IdeologiesResponse>}
     */
    (ideologiesPrompt) => {
      return getChatResponse(
        ideologiesPrompt,
        ctx.text,
        Ideologies
      )
    }
  )
  .then(
    (ideologiesResponse) => {
      return ideologiesResponse.ideologies.map((ideologyData) => {
        return new Ideology(
          ideologyData.id, 
          ideologyData.presence, 
          ideologyData.examples
        )
      })
    }
  )
}

/**
 * Identify topics/genres/categories.
 * 
 * @param {Context} ctx 
 * 
 * @returns {Promise<Topic[]>}
 */
export function getTopics(ctx) {
  return loadPrompt(
    PROMPT_TOPICS_FILE,
    _topicsMax,
    _topicExamplesMax
  )
  .then(
    /**
     * @param {string} topicsPrompt 
     * @returns {Promise<TopicsResponse>}
     */
    (topicsPrompt) => {
      return getChatResponse(
        topicsPrompt,
        ctx.text,
        Topics
      )
    }
  )
  .then((topicsResponse) => {
    return topicsResponse.topics.map((topicData) => {
      return new Topic(topicData.id, topicData.examples)
    })
  })
}

/**
 * 
 * @param {string} textPath 
 * @param {number|undefined} lenMax 
 * @returns {Promise<string>}
 */
export function loadText(textPath, lenMax) {
  return readFile(textPath, {encoding: 'utf-8'})
  .then(
    (text) => {
      text = text.substring(0, lenMax)
      logger.info('loaded text from %s length=%s', textPath, text.length)
      return text
    },
    (err) => {
      logger.error('failed to load text from %s', textPath)
      throw err
    }
  )
}

/**
 * Load and parse an HTML document or fragment.
 * 
 * @param {string} htmlPath 
 * @returns {Promise<HTMLElement>}
 */
export function parseHtml(htmlPath) {
  return loadText(htmlPath)
  .then(
    (htmlText) => {
      logger.debug('parse html from loaded string length=%s', htmlText.length)
      return HtmlParser.parse(htmlText, {
        comment: false,
        fixNestedATags: false,
        parseNoneClosedTags: false
      })
    },
    (err) => {
      throw new Error(`failed to load text from file=${htmlPath}`, {
        cause: err
      })
    }
  )
}

export function setPromptDir(promptDir) {
  PROMPT_DIR = promptDir
}

/**
 * 
 * @param {string} dir 
 * @param {RegExp} pattern 
 * @returns {Promise<string[]>}
 */
export function listFiles(dir, pattern) {
  return readdir(dir, {
    recursive: true,
    withFileTypes: true
  })
  .then(
    (fileEntries) => {
      const filePaths = []
      let filePath
      for (let fileEntry of fileEntries) {
        filePath = path.join(fileEntry.parentPath, fileEntry.name)
        if (fileEntry.isFile() && filePath.search(pattern) !== -1) {
          filePaths.push(filePath)
        }
      }

      // os lists alphabetically, js Array.push inverts order; here we invert again
      filePaths.reverse()
      return filePaths
    },
    (err) => {
      throw new Error(`failed to list files in ${dir}`, {
        cause: err
      })
    }
  )
}