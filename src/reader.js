/**
 * Read texts and provide analysis.
 */

import { zodResponseFormat } from 'openai/helpers/zod'
import path from 'path'
import { readFile, readdir } from 'node:fs/promises'
import * as HtmlParser from 'node-html-parser'
import { Maturity, TextProfile, Difficulty, MATURITY_TYPE_PROFANE } from './textProfile.js'
import { CustomMaturityTypes, ReadingDifficulty } from './messageSchema.js'
import { formatString } from './stringUtil.js'
import {
  READING_DIFFICULTY_REASONS_MAX as _difficultReasonsMax,
  READING_DIFFICULTY_WORDS_MIN as _difficultWordsMin,
  READING_DIFFICULTY_PHRASES_MIN as _difficultPhrasesMin
} from './config.js'
import { StoriesIndex } from './storiesIndex.js'
import { downloadWebpage, writeText } from './writer.js'

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
 * @typedef {import('./messageSchema.js').Story} Story
 */

let PROMPT_DIR = path.join(import.meta.dirname, 'resource/prompt')
// prompts for ai language model
export const PROMPT_CUSTOM_MATURITY_FILE = 'customMaturity.txt'
export const PROMPT_READING_DIFFICULTY_FILE = 'readingDifficulty.txt'
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
 * @param {number} storiesMax 
 * @param {string} storiesParentDir 
 * @returns {Promise<Map<number, Story[]>>} Paged list of stories.
 */
export function fetchStories(storiesIndex, storiesMax, storiesParentDir) {
  logger.info('fetch up to %s stories from %s and save to %s', storiesMax, storiesIndex, storiesParentDir)
  let pageNumber = storiesIndex.pageNumberMin
  let storiesCount = 0
  let storiesRemaining = () => {return storiesMax - storiesCount}
  /**
   * @type {Map<number, Story[]>}
   */
  let pagedStories = new Map()
  /**
   * @type {string}
   */
  let storiesPath
  let writeStoryPromises = []
  /**
   * @type {Promise[]}
   */
  let fetchStory = () => {
    if (storiesCount < storiesMax && pageNumber < storiesIndex.pageNumberMax) {
      storiesPath = path.join(storiesParentDir, storiesIndex.name, `page-${pageNumber}`)
      
      // download index webpage
      return downloadWebpage(
        storiesIndex.getPageUrl(pageNumber).toString(),
        path.join(storiesPath, 'index.html')
      )
      // load webpage
      .then((indexPagePath) => {
        return parseHtml(indexPagePath)
      })
      // extract story summaries
      .then((pageHtml) => {
        return storiesIndex.getStorySummaries(pageHtml)
      })
      .then(
        (storySummariesGenerator) => {
          let storySummaries = []
          /**
           * @type {Story}
           */
          let storySummary
          for (
            let i = 0; 
            i < storiesRemaining() && (storySummary = storySummariesGenerator.next().value); 
            i++
          ) {
            storySummaries.push(storySummary)
          }
          logger.info('fetched %s stories from page %s', storySummaries.length, pageNumber)
          
          // save story to memory and filesystem
          pagedStories.set(pageNumber, storySummaries)
          writeStoryPromises.push(
            writeText(
              JSON.stringify(storySummaries, undefined, 2),
              path.join(storiesPath, 'index.json')
            )
          )

          storiesCount += storySummaries.length
          pageNumber++

          // recursive call for next page
          return fetchStory()
        }
      )
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
 * Estimate readoing difficulty.
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

export function getPoliticalBias(ctx) {
  
}

export function getCategories(ctx) {
  
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
      return filePaths
    },
    (err) => {
      throw new Error(`failed to list files in ${dir}`, {
        cause: err
      })
    }
  )
}