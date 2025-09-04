/**
 * Read texts and provide analysis.
 */

import { zodResponseFormat } from 'openai/helpers/zod'
import { RateLimitError } from 'openai'
import path from 'path'
import { readFile, readdir, access as fsAccess, constants as fsConstants } from 'node:fs/promises'
import * as HtmlParser from 'node-html-parser'
import { Maturity, TextProfile, Difficulty, Topic, MATURITY_TYPE_PROFANE, Ideology } from './textProfile.js'
import { CustomMaturityTypes, Ideologies, ReadingDifficulty, Topics } from './messageSchema.js'
import { formatString, regexpEscape } from './stringUtil.js'
import {
  READING_DIFFICULTY_REASONS_MAX as _difficultReasonsMax,
  READING_DIFFICULTY_WORDS_MIN as _difficultWordsMin,
  READING_DIFFICULTY_PHRASES_MIN as _difficultPhrasesMin,
  TOPICS_MAX as _topicsMax,
  TOPIC_EXAMPLES_MAX as _topicExamplesMax,
  IDEOLOGIES_MAX as _ideologiesMax,
  IDEOLOGY_EXAMPLES_MAX as _ideologyExamplesMax,
  SEARCHES_DIR
} from './config.js'
import { StoriesIndex } from './storiesIndex/storiesIndex.js'
import { StorySummary } from './storySummary.js'
import { downloadWebpage, fileExists, initDir, writeText } from './writer.js'
import { IndexPage } from './indexPage.js'
import { LibrarySearchEntry } from './librarySearchEntry.js'
import { Library, LibraryBook } from './library.js'
import * as progress from './progress.js'

/**
 * @typedef {import('pino').Logger} Logger
 * @typedef {import('openai').OpenAI} OpenAI
 * @typedef {import('cli-progress').MultiBar} MultiBar
 */
/**
 * @typedef {import('./messageSchema.js').MessageSchema} MessageSchema
 * @typedef {import('./messageSchema.js').CustomMaturityTypesResponse} CustomMaturityTypesResponse
 * @typedef {import('./messageSchema.js').ReadingDifficultyResponse} ReadingDifficultyResponse
 * @typedef {import('./messageSchema.js').ExtractStoriesResponse} ExtractStoriesResponse
 * @typedef {import('./messageSchema.js').TopicsResponse} TopicsResponse
 * @typedef {import('./messageSchema.js').IdeologiesResponse} IdeologiesResponse
 * @typedef {import('./librarySearchEntry.js').BookReference} BookReference
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
 * @type {Date[]}
 */
let _retryStack = []

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
  return new Promise(function(res) {
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
    res(logger)
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
    profile.filePath = `${textPath}.profile.json`

    /**
     * @type {string}
     */
    this.textPath = textPath
  }
}

/**
 * Whether to retry the failed request to the language model API.
 * 
 * @param {Error} err 
 * 
 * @returns {false|{
 *  delayMillis: number
 *  onComplete: function
 * }}
 */
function canRetryModelRequest(err) {
  if (err instanceof RateLimitError) {
    if (err.code === 'rate_limit_exceeded') {
      logger.info('exceeded rate limit for language model API; throttle request and try again. %s', err.message)
      const delayScale = _retryStack.length + 1
      const delayMin = 1000 * delayScale
      const delayRange = 10000 * delayScale
      _retryStack.push(new Date())
      return {
        delayMillis: (Math.random() * delayRange) + delayMin,
        onComplete: () => _retryStack.pop()
      }
    }
  }

  return false
}

/**
 * 
 * @param {string} instructions 
 * @param {string} request 
 * @param {MessageSchema} responseFormat
 * @param {number} attemptsRemaining 
 * 
 * @returns {Promise<*>} Structured response from lang model API matching the given message schema.
 */
async function getChatResponse(instructions, request, responseFormat, attemptsRemaining=10) {
  logger.debug('call _ai.chat.completions')
  /**
   * @type {{
   *  choices: {
   *    message: {
   *      refusal: boolean
   *      content: string
   *    }
   *  }[]
   * }}
   */
  let completion
  try {
    completion = await _ai.chat.completions.create({
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
  }
  catch (err) {
    let retry = canRetryModelRequest(err)
    if (retry) {
      if (--attemptsRemaining > 0) {
        return await new Promise((res) => {
          setTimeout( 
            () => {
              getChatResponse(instructions, request, responseFormat, attemptsRemaining)
              .then((response) => {
                retry.onComplete()
                res(response)
              })
            },
            retry.delayMillis
          )
        })
      }
    }
    
    throw filterAIError(err)
  }

  let response = completion.choices[0].message
  if(response.refusal) {
    logger.error('chat model refused to answer as requested')
    throw filterAIError(completion.choices[0])
  }
  else {
    try {
      return JSON.parse(response.content)
    }
    catch (err) {
      logger.error('unable to parse chat response=%o', response)
      throw err
    }
  }
}

/**
 * @param {string} request 
 * @param {number} attemptsRemaining
 * 
 * @returns {Promise<Maturity>}
 */
async function getModerationResponse(request, attemptsRemaining=10) {
  logger.debug('call _ai.moderations')
  
  try {
    /**
     * @type {{
     *  results: {
     *    flagged: boolean
     *    categories: {[category:string]: boolean}
     *  }[]
     * }}
     */
    const moderation = await _ai.moderations.create({
      model: _maturityModel,
      store: false,
      input: request
    })

    const result = moderation.results[0]
    
    let presents = [], absents = []
    Object.entries(result.categories).map(([category, isPresent]) => {
      (isPresent ? presents : absents).push(category)
    })

    return new Maturity(
      result.flagged,
      presents,
      absents
    )
  }
  catch (err) {
    let retry = canRetryModelRequest(err)
    if (retry) {
      if (--attemptsRemaining > 0) {
        return await new Promise((res) => {
          setTimeout(
            () => {
              getModerationResponse(request, attemptsRemaining)
              .then((response) => {
                retry.onComplete()
                res(response)
              })
            },
            retry.delayMillis
          )
        })
      }
      else {
        logger.error('max retries exceeded for getModerationResponse; try again later %s', err)
      }
    }
    
    throw filterAIError(err)
  }
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
 * @param {StoriesIndex} storiesIndex Stories index from which to fetch.
 * @param {number|undefined} startPage First index page number.
 * @param {number|undefined} startStoryArrIdx First story array index. Affects from where to begin counting fetched
 * stories until `storiesMax`.
 * @param {number} storiesMax Max count of stories to fetch. Note the actual count of stories returned
 * will be rounded up to nearest whole page.
 * @param {string} storiesParentDir
 * @param {Library|undefined} indexLibrary Library of books that belong to `storiesIndex`.
 * @param {MultiBar} parentPB Caller progress bars context.
 * 
 * @returns {Promise<Map<number, StorySummary[]>>} Paged lists of stories, including pages that were
 * already in local filesystem.
 */
export function fetchStories(storiesIndex, startPage, startStoryArrIdx, storiesMax, storiesParentDir, indexLibrary, parentPB) {
  /**
   * Page number to which local stories are assigned.
   */
  let localPageNumber = startPage === undefined ? storiesIndex.pageNumberMin : startPage
  /**
   * Page number (can be dynamic) from which remote stories are fetched.
   */
  let remotePageNumber = localPageNumber
  logger.info(
    'fetch up to %s stories from %s as of page %s story @%s and save to %s', 
    storiesMax, storiesIndex, localPageNumber, startStoryArrIdx, storiesParentDir
  )
  const pbStories = (parentPB !== undefined ? progress.addBar(parentPB, `fetch stories from ${storiesIndex.name}`, storiesMax) : undefined)

  let storiesCount = 0
  /**
   * @type {Map<number, StorySummary[]>}
   */
  let pagedStories = new Map()
  let writeStoryPromises = []
  
  /**
   * @type {Promise[]}
   */
  let fetchStory = async () => {
    if (storiesCount < storiesMax && localPageNumber <= storiesIndex.pageNumberMax) {
      let parsedPageDir = path.join(storiesParentDir, storiesIndex.name, `page-${localPageNumber}`)
      let parsedPagePath = path.join(parsedPageDir, 'index.json')

      /**
       * @type {StorySummary[]}
       */
      let storySummaries = []
      let localPageExists = await fileExists(parsedPagePath)
      
      if (localPageExists) {
        // load count of stories from local page
        storySummaries = await loadText(parsedPagePath).then(JSON.parse)
        logger.info(
          'local stories index=%s page=%s story-count=%s already exists; skip to next', 
          storiesIndex.name, localPageNumber, storySummaries.length
        )
      }
      else {
        let rawPageDir = path.join(`data/temp/${storiesIndex.name}/page-${remotePageNumber}`)
        await initDir(rawPageDir)

        // download index webpage
        let rawPagePath = await downloadWebpage(
          storiesIndex.getPageUrl(remotePageNumber).toString(),
          path.join(rawPageDir, storiesIndex.pageFilename),
          true,
          storiesIndex.pageRequestHeaders
        )

        // load webpage
        /**
         * Parsed stories index page.
         * @type {any|HTMLElement}
         */
        let indexPage
        if (path.extname(storiesIndex.pageFilename) === '.json') {
          indexPage = await (
            loadText(rawPagePath)
            // Sometimes (Naver Blog) the result has some dirty characters at the beginning to be removed.
            .then((jsonStr) => {
              // from start of first object or array
              return jsonStr.substring(jsonStr.search(/[\{\[]/))
            })
            .then(JSON.parse)
          )
        }
        else {
          indexPage = await parseHtml(rawPagePath)
        }

        // extract story summaries
        for (let storySummary of storiesIndex.getStorySummaries(indexPage)) {
          if (
            storiesIndex.isPageDynamic && indexLibrary !== undefined 
            && indexLibrary.has(storiesIndex.name, storySummary.id)
          ) {
            logger.info(
              'library already has %s story %s as book %s; skip fetch', 
              storiesIndex.name, storySummary.id, indexLibrary.getBook(storiesIndex.name, storySummary.id)
            )
            break
          }

          storySummaries.push(storySummary)
          logger.info('fetched %s stories from page remote=%s local=%s', storySummaries.length, remotePageNumber, localPageNumber)
        }
      }

      // save new set of fetched stories to memory
      if (pagedStories.has(localPageNumber)) {
        storySummaries = pagedStories.get(localPageNumber).concat(storySummaries)
      }
      pagedStories.set(localPageNumber, storySummaries)

      if (startStoryArrIdx !== undefined) {
        // only count stories after array start index in first page
        storiesCount += storySummaries.length - startStoryArrIdx
        startStoryArrIdx = undefined
      }
      else {
        storiesCount += storySummaries.length
      }
      pbStories?.update(Math.min(storiesCount, pbStories?.getTotal()))

      remotePageNumber++
      if (localPageExists) {
        // do not attempt to add more stories to a page created in a previous run; consider complete
        localPageNumber++
      }
      else if (storySummaries.length >= storiesIndex.pageStoryCountExpected) {
        logger.info('finished fetching %s stories to local page %s', storySummaries.length, parsedPagePath)

        // save complete local stories page to filesystem
        writeStoryPromises.push(
          initDir(parsedPageDir)
          .then(() => writeText(JSON.stringify(storySummaries, undefined, 2), parsedPagePath))
        )

        localPageNumber++
      }

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
    getModerationResponse(ctx.text),
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
  // combine
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

/**
 * Load stories from a local index page.
 * 
 * @param {string} pagePath 
 * @returns {Promise<StorySummary[]>}
 */
export function loadStories(pagePath) {
  return loadText(pagePath).then(JSON.parse)
  .then((stories) => stories.map((s) => StorySummary.fromData(s)))
}

/**
 * Load a story from a local index page.
 * 
 * @returns {Promise<{story: StorySummary, storyArrayIndex: number}>}
 */
export async function loadStory(pagePath, storyId) {
  // load story summary from index page
  let storyArrayIndex = -1
  const stories = (await loadStories(pagePath)).filter((story, arrIdx) => {
    if (story.id === storyId) {
      storyArrayIndex = arrIdx
      return true
    }
    else {
      return false
    }
  })

  if (stories.length > 0) {
    if (stories.length > 1) {
      logger.warn('page %s has %s stories with id=%s; selecting arbitrary one', pagePath, stories.length, storyId)
    }
    return {
      story: stories[0],
      storyArrayIndex
    }
  }
  else {
    throw new Error(`unable to load story id=${storyId} from ${pagePath}`)
  }
}

/**
 * 
 * @param {string} storyId 
 * @param {string} indexName
 * @param {string} profilesDir
 * 
 * @returns {Promise<string>}
 */
export async function getProfilePath(storyId, indexName, profilesDir) {
  const profilePattern = new RegExp(regexpEscape(`story-${storyId}`) + '/.+profile.json$')
  logger.debug('story %s profile search pattern=%s', storyId, profilePattern)
  
  const indexProfilesDir = path.join(profilesDir, indexName)
  const storyPaths = await listFiles(indexProfilesDir, profilePattern)
  if (storyPaths.length !== 1) {
    throw new Error(`unable to find profile for story ${storyId} at ${indexProfilesDir}`, {
      cause: {
        candidatePaths: storyPaths
      }
    })
  }

  return storyPaths[0]
}

/**
 * 
 * @param {string} profilePath
 * 
 * @returns {Promise<TextProfile>}
 */
export function loadProfile(profilePath) {
  return loadText(profilePath)
  .then(JSON.parse)
  .then((profileData) => {
    let profile = new TextProfile(profileData)

    if (profile.filePath === undefined) {
      profile.filePath = profilePath
    }

    return profile
  })
}

/**
 * Load {@linkcode LibraryBook} from the given book reference.
 * 
 * @param {BookReference} bookRef 
 * @param {string} storiesDir
 * 
 * @returns {LibraryBook}
 */
export async function loadLibraryBook(bookRef, storiesDir) {
  // get page
  let page = new IndexPage(bookRef.indexName, bookRef.pageNumber, undefined, storiesDir)
  // load story from page file
  let {story, storyArrayIndex} = await loadStory(page.filePath, bookRef.storyId)
  logger.info('loaded story %s from %s[%s]', story, page, storyArrayIndex)

  /**
   * @type {TextProfile|undefined}
   */
  let profile
  if (bookRef.profilePath !== undefined) {
    profile = await loadProfile(bookRef.profilePath)
  }

  return new LibraryBook(undefined, story, page, profile)
}

/**
 * @param {string} storiesDir
 * @param {string|undefined} indexName
 * 
 * @returns {Promise<Map<string, Map<number, IndexPage>>>}
 */
export async function listStoryIndexPages(storiesDir, indexName) {
  /**
   * @type {Map<string, Map<number,IndexPage>>}
   */
  const indexPages = new Map()

  if (indexName !== undefined) {
    // ensure index stories dir exists
    await initDir(path.join(storiesDir, indexName))
  }

  await (
    listFiles(
      indexName === undefined 
      // list all index pages
      ? storiesDir 
      // list pages under single index
      : path.join(storiesDir, indexName), 
      /index.json$/
    )
    .then((indexPaths) => {
      logger.debug('parsing %s story index page paths', indexPaths.length)
      const pagePathRegExp = new RegExp(`${indexName === undefined ? '([^\/]+)/' : ''}page-(\\d+)`)

      indexPaths.forEach(
        /**
         * @param {string} indexPagePath 
         * @returns {IndexPage}
         */
        (indexPagePath) => {
          const pagePathParse = indexPagePath.match(pagePathRegExp)
          if (pagePathParse === null) {
            logger.error('unable to parse stories index page path="%s"', indexPagePath)
          }
          else {
            const indexPage = new IndexPage(
              indexName || pagePathParse[1],
              parseInt(pagePathParse[indexName === undefined ? 2 : 1]),
              indexPagePath
            )

            if (indexPages.has(indexPage.indexName)) {
              indexPages.get(indexPage.indexName).set(indexPage.pageNumber, indexPage)
            }
            else {
              indexPages.set(indexPage.indexName, new Map([
                [indexPage.pageNumber, indexPage]
              ]))
            }
          }
        }
      )
    })
  )

  return indexPages
}

/**
 * @param {string} historyDir 
 * @param {number} lastNumber
 * @param {number} count 
 * 
 * @returns {Promise<[number, string][]>} Numbered search entry file paths ordered number descending
 * (newest first).
 */
export async function listLibrarySearchHistoryPaths(historyDir, lastNumber, count) {
  return listFiles(path.join(historyDir, SEARCHES_DIR), LibrarySearchEntry.fileRegExp)
  // select requested search entry paths
  .then((searchPaths) => {
    logger.debug('parse %s available library search entry paths', searchPaths.length)
    let resultCount = 0

    return searchPaths.map((searchPath) => [LibrarySearchEntry.parseSearchNumber(searchPath), searchPath])
    // sort search number descending
    .sort(([nA], [nB]) => nB - nA)
    // limit by lastNumber and count
    .filter(([number]) => {
      if (number <= lastNumber && resultCount < count) {
        resultCount++
        return true
      }
      else {
        return false
      }
    })
  })
}

/**
 * @param {string} historyDir 
 * @param {number} lastNumber
 * @param {number} count 
 */
export async function listLibrarySearchHistory(historyDir, lastNumber, count=1) {
  /**
   * @type {Map<number, LibrarySearchEntry}
   */
  const searches = new Map()
  
  const numberedSearchPaths = await listLibrarySearchHistoryPaths(historyDir, lastNumber, count)

  logger.debug('load %s selected library search entries', numberedSearchPaths.length)
  let p = []
  for (let [searchNumber, searchPath] of numberedSearchPaths) {
    p.push(
      loadText(searchPath)
      .then(JSON.parse)
      .then((searchEntry) => {
        searches.set(searchNumber, LibrarySearchEntry.fromData(searchEntry, historyDir))
      })
    )
  }

  await Promise.all(p)
  return searches
}

/**
 * Load an existing index page, or create a new one.
 * 
 * @param {string} indexName 
 * @param {number} pageNumber 
 * @param {string} storiesDir 
 * @returns {Promise<{page: IndexPage, stories: StorySummary[]}>}
 */
export async function getIndexPage(indexName, pageNumber, storiesDir) {
  const page = new IndexPage(
    indexName, 
    pageNumber, 
    undefined,
    storiesDir
  )
  /**
   * @type {StorySummary[]}
   */
  let stories = []

  try {
    await fsAccess(page.filePath, fsConstants.F_OK)
    logger.debug('found existing page %o', page)

    stories = await loadStories(page.filePath)
  }
  catch {
    logger.info('create new page %o', page)
  }

  return { page, stories }
}