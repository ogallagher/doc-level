/**
 * Load initial environment values.
 */

import * as dotenv from 'dotenv'
import OpenAI from 'openai'
import yargs from 'yargs/yargs'
import path from 'path'
import { hideBin } from 'yargs/helpers'
import { StoriesIndex } from './storiesIndex.js'
import { initDir } from './writer.js'
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

/**
 * Load runtime arguments.
 * 
 * @param {Map<string, StoriesIndex>} storyIndexes
 * 
 * @returns {Promise<{
 *  logLevel: string,
 *  fetchStories: string | undefined,
 *  storiesDir: string
 * }>}
 */
function loadArgs(storyIndexes) {
  return new Promise(function(res) {
    logger.debug('load runtime args')

    const argv = yargs(hideBin(process.argv))
    .option('log-level', {
      alias: 'l',
      type: 'string',
      description: 'set log level',
      default: 'info',
      choices: ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']
    })
    .option('fetch-stories', {
      alias: 'f',
      type: 'string',
      description: 'Fetch stories from a registered index webpage.',
      choices: storyIndexes
    })
    .option('stories-dir', {
      alias: 'd',
      type: 'string',
      description: 'local filesystem directory where story texts are saved',
      default: path.join('data', 'stories')
    })
    .alias('v', 'version')
    .alias('h', 'help')
    .parse()
  
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
 * Init module logger, init filesystem, load env and runtime args, connect OpenAI api client.
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
 *  logLevel: string,
 *  storiesIndex: string | undefined,
 *  storiesDir: string
 * }>}
 */
export function init(parentLogger, storyIndexes) {
  logger = parentLogger.child(
    {
      name: 'config'
    }
  )

  return Promise.all([
    loadEnv(),
    loadArgs(storyIndexes)
  ])
  .then(([resEnv, resArgs]) => {
    return new Promise((res) => {
      // init filesystem
      initDir(resArgs.storiesDir)
      
      res({
        ai: resEnv.ai,
        chatModel: resEnv.chatModel,
        maturityModel: resEnv.maturityModel,
        readingDifficultyWordsMax: resEnv.readingDifficultyWordsMax,
        readingDifficultyPhrasesMax: resEnv.readingDifficultyPhrasesMax,
        logLevel: resArgs.logLevel,
        storiesIndex: resArgs.fetchStories,
        storiesDir: resArgs.storiesDir
      })
    })
  }) 
}
