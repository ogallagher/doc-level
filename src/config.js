/**
 * Load initial environment values.
 */

import * as dotenv from 'dotenv'
import OpenAI from 'openai'
import yargs from 'yargs'
import path from 'path'
import { hideBin } from 'yargs/helpers'
import { compileRegexp } from './stringUtil.js'
import { RelationalTagConnection } from 'relational_tags'
/**
 * @typedef {import('pino').Logger} Logger
 * @typedef {import('./storiesIndex/storiesIndex.js').StoriesIndex} StoriesIndex
 */

const ENV_KEY_OPENAI_API_KEY = 'OPENAI_API_KEY' 
const ENV_KEY_READING_DIFFICULTY_WORDS_MAX = 'READING_DIFFICULTY_WORDS_MAX'
const ENV_KEY_READING_DIFFICULTY_PHRASES_MAX = 'READING_DIFFICULTY_PHRASES_MAX'

/**
 * tag-tag connection type for parent to child.
 * @type {string}
 */
export const TYPE_TO_TAG_CHILD = RelationalTagConnection.TYPE_TO_TAG_CHILD
/**
 * tag-tag connection type for child to parent.
 * @type {string}
 */
export const TYPE_TO_TAG_PARENT = RelationalTagConnection.inverse_type(TYPE_TO_TAG_CHILD)

export const OPT_VAR_PREFIX = '@'
export const OPT_VAR_FIRST = 'first'
export const OPT_VAR_NEXT = 'next'
/**
 * Operator used for logical AND (set intersect) in a library search expression.
 */
export const SEARCH_OP_AND = '&&'
/**
 * Operator used for logical OR (set union) in a library search expression.
 */
export const SEARCH_OP_OR = '||'
/**
 * Operator used for combining/delimiting t and q terms in a library search expression.
 */
export const SEARCH_OP_COMPOSE = '^'
/**
 * Operator used for pairing t,q variables with do-match values in a library search expression.
 */
export const SEARCH_OP_EQ = '=='
/**
 * Operator used to group terms and control order of operations in a library search expression.
 */
export const SEARCH_OP_GROUP = '()'
/**
 * Variable representing a tag name in a library search expression.
 */
export const SEARCH_T = 't'
/**
 * Variable representing a tag pattern in a library search expression.
 */
export const SEARCH_Q = 'q'

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
export const SEARCH_TAGS_MAX = 500
export const SEARCH_TAG_BOOKS_MAX = 1000

/**
 * @type {Logger}
 */
let logger

export const argParser = (
  yargs()
  .option('fetch-stories-index', {
    alias: 'f',
    type: 'string',
    description: 'Fetch stories from a registered index/listing webpage.',
    // choices are unknown until indexes are initialized
    choices: undefined
  })
  .option('local-story-file', {
    alias: 'F',
    type: 'string',
    description: 'Load an isolated story from a local full text file path.'
  })
  .option('fetch-stories-max', {
    alias: 'm',
    type: 'number',
    description: 'Max number of stories to fetch.',
    default: 10
  })
  .option('story', {
    alias: 's',
    type: 'string',
    description: (
      'Identifier of a story to be loaded and profiled. '
      + `Accepts variable expressions ${OPT_VAR_PREFIX}${OPT_VAR_FIRST}, ${OPT_VAR_PREFIX}${OPT_VAR_NEXT}, ${OPT_VAR_PREFIX}<array-index>.`
    )
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
    type: 'string',
    description: (
      'Page number within stories index. If combined with -f, provides page from which to start fetch. '
      + `Accepts variable expressions ${OPT_VAR_PREFIX}${OPT_VAR_FIRST}, ${OPT_VAR_PREFIX}${OPT_VAR_NEXT}.`
    ),
    default: `${OPT_VAR_PREFIX}${OPT_VAR_FIRST}`
  })
  .option('story-length-max', {
    alias: 'n',
    type: 'number',
    description: 'Max character length of story text to include when generating its profile.',
    default: 3500
  })
  .option('force-profile', {
    alias: 'P',
    type: 'boolean',
    default: false,
    description: 'Even if a profile for the selected story exists, generate a new one to replace it.'
  })
  .option('skip-profile', {
    alias: '0',
    type: 'boolean',
    description: 'Even if a story is selected, do not generate a profile for it.'
  })
  .option('autopilot', {
    alias: 'a',
    type: 'boolean',
    default: false,
    description: (
      'Continue to cycle through stories and pages without pausing for input until '
      + '--fetch-stories-max/-m is reached. Combine with --index --page --story opts to specify from which story '
      + 'to begin. If provided, --fetch-stories-index is not used in favor of --index.'
    )
  })
  .option('show-library', {
    alias: 'L',
    type: 'string',
    description: (
      'Show library (fetched stories, profiles, indexes, etc). Combine with other opts to only '
      + 'show a subset of/search items. '
      + '[tag = Print flat list of all available tags for searching. Filters are not applied.] '
      + '[txt = Print flat list of books to a plain text file.] '
      + '[md = Render as a markdown file.] '
      + '[html = [pending] Render as a local webpage.]'
    ),
    choices: ['tag', 'txt', 'md', 'html']
  })
  .option('tag', {
    alias: 't',
    type: 'string',
    description: 'Exact tag name for searching library items.'
  })
  .option('query', {
    alias: 'q',
    type: 'string',
    description: (
      'Tag name pattern as a query string for searching library items. '
      + 'Surround the value with slashes like /\\w+e/ to search using a regular expression. Note that currently '
      + 'the regexp must match the whole tag name, not a substring. '
      + 'If combined with -t, -t is applied first, then -q is applied to child tags of -t.'
    )
  })
  .option('search-expr', {
    alias: '?',
    type: 'string',
    description: (
      'Library search expression with support for logical operators. '
      + 'See examples for how to use instead of single-term opts -t and -q.'
    )
  })
  .example(
    `-L txt -? "(t == 'tag1' ${SEARCH_OP_COMPOSE} q == '/.*query\d.+/') ${SEARCH_OP_AND} (t == 'tag2') ${SEARCH_OP_OR} t == 'tag3'"`,
    (
      'Search library for items with tags under tag1 that match regexp /.*query\d+/, and also have tag2, '
      + `or have tag3. Note "t == 'val' ${SEARCH_OP_COMPOSE} q == 'val'" corresponds to single-term opts "-t val -q val".`
    )
  )
  .option('sort', {
    alias: '>',
    type: 'string',
    choices: ['asc', 'desc'],
    description: 'Sort direction of search results. Default is not sorted.'
  })
  .example('-L txt -t years-of-education -> asc', 'Show profiled library texts with easiest first.')
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
      + 'Not usually necessary unless files were changed manually.'
    ),
    default: false
  })
  .option('log-level', {
    alias: 'l',
    type: 'string',
    description: '[pending; does not work yet] set log level',
    default: 'info',
    choices: ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']
  })
  .alias('v', 'version')
  .option('help', {
    alias: 'h',
    type: 'boolean',
    default: false
  })
  .alias('h', 'help')
  .help(false)
)

argParser.wrap(argParser.terminalWidth())

/**
 * @typedef {{
 *  logLevel: string,
 *  fetchStoriesIndex: string | undefined,
 *  fetchStoriesMax: number,
 *  storiesDir: string,
 *  profilesDir: string,
 *  index: string,
 *  page: string,
 *  story: string | undefined,
 *  localStoryFile: string | undefined,
 *  storyLengthMax: number,
 *  skipProfile: boolean,
 *  forceProfile: boolean,
 *  autopilot: boolean,
 *  showLibrary: string | undefined,
 *  rendersDir: string,
 *  reload: boolean,
 *  tag: string | undefined,
 *  query: string | RegExp | undefined,
 *  searchExpr: string | undefined,
 *  sort: string,
 *  help: boolean
 * }} Args
 */

/**
 * Load runtime arguments.
 * 
 * @param {string|string[]} argSrc Source of runtime arguments. Default is `process.argv`.
 * 
 * @returns {Promise<Args>}
 */
export function loadArgs(argSrc=hideBin(process.argv)) {
  return new Promise(function(res) {
    logger.debug('load runtime args')

    const argv = argParser.parse(argSrc)

    // query
    if (argv.query !== undefined) {
      const query_regexp = compileRegexp(argv.query)
      if (query_regexp !== undefined) {
        logger.debug('converted raw query %s to regexp %s', argv.query, query_regexp)
        argv.query = query_regexp
      }
      // else, leave as string
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
