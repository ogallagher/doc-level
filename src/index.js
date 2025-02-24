/**
 * doc-level entrypoint.
 */

import pino from 'pino'
import path from 'path'
import { init as configInit, argParser } from './config.js'
import { init as progressInit } from './progress.js'
import { init as readerInit } from './reader.js'
import { init as textProfileInit } from './textProfile.js'
import { init as messageSchemaInit } from './messageSchema.js'
import { init as writerInit } from './writer.js'
import { init as storiesIndexInit, getStoryIndexNames } from './storiesIndex/index.js'
import { init as libraryInit } from './library.js'
import { init as mainInit, main } from './main.js'
import { init as autopilotInit } from './autopilot.js'
/**
 * @typedef {{
 *  destination: string,
 *  mkdir: boolean,
 *  append: boolean,
 *  colorize: boolean,
 *  sync: boolean
 * }} TransportOptions
 * 
 * @typedef {import('pino').Logger} Logger
*/

/**
 * @type {Set<Logger>}
 */
const childLoggers = new Set()
/**
 * @param {Logger} childLogger 
 */
function addChildLogger(childLogger) {
  childLoggers.add(childLogger)
}

/**
 * @type {pino.Logger & {
 *  setLevel: Function(string)
 * }}
 */
const logger = pino(
  {
    name: 'doc-level',
    level: 'debug'
  },
  pino.transport({
    /**
     * @type {{
     *  target: string|WritableStream,
     *  level: string,
     *  options: TransportOptions
     * }[]}
     */
    targets: [
      // to file
      {
        target: 'pino-pretty',
        level: 'debug',
        options: {
          destination: 'logs/doc-level_cli.log',
          mkdir: true,
          append: true,
          colorize: false
        }
      },
      // to process.stdout
      {
        target: path.join(import.meta.dirname, './pinoCliLogTransport.js'),
        level: 'error'
      }
    ]
  })
)

/**
 * @param {string} level 
 */
logger.setLevel = function(level) {
  // cascade level change to children
  for (let childLogger of childLoggers.values()) {
    childLogger.level = level
  }
}

/**
 * 
 * @returns {Promise<undefined>}
 */
function init() {
  return Promise.all([
    progressInit(logger).then(addChildLogger),
    textProfileInit(logger).then(addChildLogger),
    messageSchemaInit(logger).then(addChildLogger),
    writerInit(logger).then(addChildLogger),
    storiesIndexInit(logger).then(addChildLogger),
    libraryInit(logger).then(addChildLogger),
    mainInit(logger).then(addChildLogger),
    autopilotInit(logger).then(addChildLogger)
  ])
  // config
  .then(() => {
    return configInit(logger)
    // init modules dependent on config
    .then(
      ({ 
        logger: childLogger, ai, chatModel, maturityModel, 
        readingDifficultyWordsMax,
        readingDifficultyPhrasesMax
      }) => {
        addChildLogger(childLogger)
        logger.info(
          'config.init passed. ai.baseUrl=%s chatModel=%s maturityModel=%s', 
          ai.baseURL, 
          chatModel,
          maturityModel
        )
        
        const indexNames = getStoryIndexNames()
        argParser.choices('fetch-stories-index', indexNames)
        argParser.choices('index', indexNames)
        argParser.default('index', indexNames[0])

        return readerInit(
          logger, ai, chatModel, maturityModel, readingDifficultyWordsMax, readingDifficultyPhrasesMax
        )
      }
    )
  })
}

if (path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  // init
  init()
  // main
  .then(
    async () => {
      try {
        await main()
      }
      catch (err) {
        // this catch is not working for all cases of readling.question abort
        if (err.code !== 'ABORT_ERR') {
          throw err
        }
        else {
          // readline.question prompt was aborted; normal program exit.
          process.exit()
        }
      }
    },
    (initErr) => {
      throw new Error(`error during initialization`, {
        cause: initErr
      })
    }
  )
}
