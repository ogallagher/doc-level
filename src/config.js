/**
 * Load initial environment values.
 */

import * as dotenv from 'dotenv'
import OpenAI from 'openai'
import yargs from 'yargs/yargs'
import path from 'path'
import { hideBin } from 'yargs/helpers'
import { StoriesIndex } from './storiesIndex.js'
/**
 * @typedef {import('pino').Logger} Logger
 */

const ENV_KEY_OPENAI_API_KEY = 'OPENAI_API_KEY' 
const ENV_KEY_READING_DIFFICULTY_WORDS_MAX = 'READING_DIFFICULTY_WORDS_MAX'
const ENV_KEY_READING_DIFFICULTY_PHRASES_MAX = 'READING_DIFFICULTY_PHRASES_MAX'

const OpenAIChatModel = {
  GPT_4: 'gpt-4o',
  GPT_4_MINI: 'gpt-4o-mini'
}
const OpenAIModerationModel = {
  TEXT_LATEST: 'text-moderation-latest'
}

export const READING_DIFFICULTY_REASONS_MAX = 10
export const READING_DIFFICULTY_WORDS_MIN = 10
export const READING_DIFFICULTY_WORDS_MAX = 30
export const READING_DIFFICULTY_PHRASES_MIN = 3
export const READING_DIFFICULTY_PHRASES_MAX = 10

/**
 * @type {Logger}
 */
let logger

export const argParser = yargs()
.option('log-level', {
  alias: 'l',
  type: 'string',
  description: 'set log level',
  default: 'info',
  choices: ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']
})
.option('fetch-stories-index', {
  alias: 'f',
  type: 'string',
  description: 'Fetch stories from a registered index/listing webpage.',
  // choices are unknown until indexes are initialized
  choices: undefined
})
.option('fetch-stories-max', {
  alias: 'm',
  type: 'number',
  description: 'Max number of stories to fetch.',
  default: 10
})
.option('stories-dir', {
  alias: 'd',
  type: 'string',
  description: 'Local filesystem directory where story lists and texts are saved.',
  default: path.join('data', 'stories')
})
.option('profiles-dir', {
  alias: 'D',
  type: 'string',
  description: 'Local directory where story profiles are saved.',
  default: path.join('data', 'profiles')
})
.option('page', {
  alias: 'p',
  type: 'number',
  description: 'Stories listing page number.',
  default: 1
})
.option('story', {
  alias: 's',
  type: 'string',
  description: 'Story id.'
})
.option('story-length-max', {
  alias: 'n',
  type: 'number',
  description: 'Max character length of story text to include when generating its profile.',
  default: 2000
})
.alias('v', 'version')
.alias('h', 'help')

/**
 * Load runtime arguments.
 * 
 * @param {Map<string, StoriesIndex>} storyIndexes
 * @param {string|string[]} argSrc Source of runtime arguments. Default is `process.argv`.
 * 
 * @returns {Promise<{
 *  logLevel: string,
 *  fetchStoriesIndex: string | undefined,
 *  fetchStoriesMax: number,
 *  storiesDir: string,
 *  profilesDir: string,
 *  page: number,
 *  story: string | undefined,
 *  storyLengthMax: number
 * }>}
 */
export function loadArgs(storyIndexes, argSrc=hideBin(process.argv)) {
  return new Promise(function(res) {
    logger.debug('load runtime args')

    const argv = argParser
    .choices('fetch-stories-index', storyIndexes)
    .parse(argSrc)
  
    logger.info('loaded runtime args')
    res(argv)
  })
}

/**
 * Load env vars and AI API clients.
 * 
 * @returns {Promise<{
 *  ai: OpenAI, 
 *  chatModel: string, 
 *  maturityModel: string,
 *  readingDifficultyWordsMax: number,
 *  readingDifficultyPhrasesMax: number
 * }>}
 */
function loadEnv() {
  return new Promise(function(res, rej) {
    logger.debug('load env vars from .env')
    dotenv.config()
  
    // confirm env vars loaded
    const openaiApiKey = process.env[ENV_KEY_OPENAI_API_KEY]
    const readingDifficultyWordsMax = process.env[ENV_KEY_READING_DIFFICULTY_WORDS_MAX] || READING_DIFFICULTY_WORDS_MAX
    const readingDifficultyPhrasesMax = process.env[ENV_KEY_READING_DIFFICULTY_PHRASES_MAX] || READING_DIFFICULTY_PHRASES_MAX
    if (openaiApiKey == undefined) {
      rej(`missing env var ${ENV_KEY_OPENAI_API_KEY}`)
    }
    else {
      logger.info('loaded env vars')
      const openai = new OpenAI()
      logger.debug(
        'chat-models=%o moderation-models=%o', 
        OpenAIChatModel,
        OpenAIModerationModel
      )
      res({
        ai: openai, 
        chatModel: OpenAIChatModel.GPT_4_MINI, 
        maturityModel: OpenAIModerationModel.TEXT_LATEST,
        readingDifficultyWordsMax,
        readingDifficultyPhrasesMax
      })
    }
  })
}

/**
 * Init module logger, init filesystem, load env args, connect OpenAI api client.
 * 
 * @param {Logger} parentLogger 
 * @param {Map<string, StoriesIndex>} storyIndexes
 * 
 * @returns {Promise<{
 *  ai: OpenAI,
 *  chatModel: string,
 *  maturityModel: string,
 *  readingDifficultyWordsMax: number,
 *  readingDifficultyPhrasesMax: number
 * }>}
 */
export function init(parentLogger) {
  logger = parentLogger.child(
    {
      name: 'config'
    }
  )

  return Promise.all([
    loadEnv()
  ])
  .then(([resEnv]) => {
    return new Promise((res) => {
      res({
        ai: resEnv.ai,
        chatModel: resEnv.chatModel,
        maturityModel: resEnv.maturityModel,
        readingDifficultyWordsMax: resEnv.readingDifficultyWordsMax,
        readingDifficultyPhrasesMax: resEnv.readingDifficultyPhrasesMax
      })
    })
  }) 
}
