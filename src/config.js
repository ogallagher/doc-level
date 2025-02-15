/**
 * Load initial environment values.
 */

import * as dotenv from 'dotenv'
import OpenAI from 'openai'
import yargs from 'yargs'
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
export const TOPICS_MAX = 6
export const TOPIC_EXAMPLES_MAX = 10
export const IDEOLOGIES_MAX = 6
export const IDEOLOGY_EXAMPLES_MAX = 10
export const SEARCH_TAGS_MAX = 10
export const SEARCH_TAG_BOOKS_MAX = 50

/**
 * @type {Logger}
 */
let logger

export const argParser = yargs()
.option('log-level', {
  alias: 'l',
  type: 'string',
  description: '[pending; does not work yet] set log level',
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
.option('index', {
  alias: 'i',
  type: 'string',
  description: 'Stories index/listing name.',
  // choices are unknown until indexes are initialized
  choices: undefined
})
.option('page', {
  alias: 'p',
  type: 'number',
  description: 'Page number within stories index.',
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
  default: 3500
})
.option('skip-profile', {
  alias: '0',
  type: 'boolean',
  description: 'Even if a story is selected, do not generate a profile for it.'
})
.option('show-library', {
  alias: 'L',
  type: 'string',
  description: (
    'Show library (fetched stories, profiles, indexes, etc). Combine with other opts to only '
    + 'show a subset of items.\n'
    + '- tag = Print flat list of all available tags for searching. Filters are not applied.\n'
    + '- txt = Print flat list of books to a plain text file.\n'
    + '- md = [pending] Render as a markdown file.\n'
    + '- html = [pending] Render as a local webpage.'
  ),
  choices: ['tag', 'txt', 'md', 'html']
})
.option('tag', {
  alias: 't',
  type: 'string',
  description: 'Tag name for limiting library items.'
})
.option('query', {
  alias: 'q',
  type: 'string',
  description: (
    'Query string for limiting library items by tag pattern. '
    + 'Surround with slashes like /\\w+e/ to search using a regular expression. Note that currently '
    + 'the regexp must match the whole tag name, not a substring.'
  )
})
.option('sort', {
  alias: '>',
  type: 'string',
  choices: ['asc', 'desc'],
  default: 'asc',
  description: (
    'Sort direction of search results. \n'
    + 'Ex. "-t years-of-education -> asc" will sort easiest texts first.'
  )
})
.option('renders-dir', {
  alias: 'e',
  type: 'string',
  description: 'Local directory where library renderings/exports are saved.',
  default: path.join('data', 'renders')
})
.option('reload', {
  alias: 'r',
  type: 'boolean',
  description: (
    'Whether to reload library objects from the filesystem. '
    + 'Default of false will not fetch recently updated/deleted items.'
  ),
  default: false
})
.alias('v', 'version')
.option('help', {
  alias: 'h',
  type: 'boolean',
  default: false
})
.alias('h', 'help')
.help(false)

argParser.wrap(argParser.terminalWidth())

/**
 * Load runtime arguments.
 * 
 * @param {string|string[]} argSrc Source of runtime arguments. Default is `process.argv`.
 * 
 * @returns {Promise<{
 *  logLevel: string,
 *  fetchStoriesIndex: string | undefined,
 *  fetchStoriesMax: number,
 *  storiesDir: string,
 *  profilesDir: string,
 *  index: string,
 *  page: number,
 *  story: string | undefined,
 *  storyLengthMax: number,
 *  skipProfile: boolean,
 *  showLibrary: string | undefined,
 *  rendersDir: string,
 *  reload: boolean,
 *  tag: string | undefined,
 *  query: string | RegExp | undefined,
 *  sort: string,
 *  help: boolean
 * }>}
 */
export function loadArgs(argSrc=hideBin(process.argv)) {
  return new Promise(function(res) {
    logger.debug('load runtime args')

    const argv = argParser.parse(argSrc)

    // query
    if (argv.query !== undefined && argv.query.startsWith('/') && argv.query.endsWith('/')) {
      const query_regexp = new RegExp(argv.query.substring(1, argv.query.length-1))
      logger.debug('converted raw query %s to regexp %s', argv.query, query_regexp)
      argv.query = query_regexp
    }
  
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
  return new Promise((res) => {
    logger.debug('load env vars from .env')
    dotenv.config()
  
    // confirm env vars loaded
    const openaiApiKey = process.env[ENV_KEY_OPENAI_API_KEY]
    const readingDifficultyWordsMax = process.env[ENV_KEY_READING_DIFFICULTY_WORDS_MAX] || READING_DIFFICULTY_WORDS_MAX
    const readingDifficultyPhrasesMax = process.env[ENV_KEY_READING_DIFFICULTY_PHRASES_MAX] || READING_DIFFICULTY_PHRASES_MAX
    if (openaiApiKey == undefined) {
      throw new Error(`missing env var ${ENV_KEY_OPENAI_API_KEY}`)
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
 *  logger: Logger,
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

  return loadEnv()
  .then((resEnv) => {
    logger.debug('end init')
    return {
      logger,
      ai: resEnv.ai,
      chatModel: resEnv.chatModel,
      maturityModel: resEnv.maturityModel,
      readingDifficultyWordsMax: resEnv.readingDifficultyWordsMax,
      readingDifficultyPhrasesMax: resEnv.readingDifficultyPhrasesMax
    }
  }) 
}
