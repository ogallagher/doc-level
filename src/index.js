/**
 * doc-level entrypoint.
 * 
 * TODO edit readingDifficulty.txt to specify native language reader difficulty; it seems to overestimate.
 * TODO accept url to stories list to visit each and download full text
 * TODO convert each text to excerpt of configurable length and pass into reader
 */ 

import * as config from './config.js'
import * as reader from './reader.js'
import * as tp from './textProfile.js'
import * as ms from './messageSchema.js'
import * as writer from './writer.js'
import pino from 'pino'

/**
 * @type {pino.Logger}
 */
const logger = pino(
  {
    name: 'doc-level',
    level: 'debug'
  }
)

Promise.all([
  tp.init(logger),
  ms.init(logger),
  writer.init(logger)
])
.then(() => {
  return config.init(logger)
})
.then(
  ({ 
    ai, chatModel, maturityModel, 
    readingDifficultyWordsMax,
    readingDifficultyPhrasesMax,
    logLevel 
  }) => {
    logger.level = logLevel

    logger.info(
      'config.init passed. ai.baseUrl=%s chatModel=%s maturityModel=%s', 
      ai.baseURL, 
      chatModel,
      maturityModel
    )
  
    return reader.init(logger, ai, chatModel, maturityModel, readingDifficultyWordsMax, readingDifficultyPhrasesMax)
  }
)
.then(
  () => {
    logger.info('reader.init passed')
    let path = 'data/이야기_1번.txt'
    return reader.loadText(path, 100)
    .then((text) => {return { text, path }})
  }
)
.then(({ text, path }) => {
  logger.info('text load from %s passed of length=%s', path, text.length)
  let ctx = new reader.Context(text, new tp.TextProfile(), path)

  return Promise.all([
    new Promise(function(res) {
      logger.info('get maturity of %s...', text.substring(0, 20))

      reader.getMaturity(ctx)
      .then((maturity) => {
        ctx.profile.setMaturity(maturity)
        logger.info('profile.maturity=%o', ctx.profile.maturity)
        res()
      })
    }),
    new Promise(function(res) {
      logger.info('get difficulty of %s...', text.substring(0, 20))

      reader.getDifficulty(ctx)
      .then((difficulty) => {
        ctx.profile.setDifficulty(difficulty)
        logger.info('profile.difficulty=%o', ctx.profile.difficulty)
        res()
      })
    })
  ])
  .then(() => {
    return ctx
  })
})
.then(
  (ctx) => {
    logger.info('created profile for given textPath=%o', ctx.textPath)
    logger.info('save profile to profilePath=%o', ctx.profilePath)
    return writer.writeText(
      JSON.stringify(ctx.profile, undefined, 2),
      ctx.profilePath
    )
  }
)
.then(
  () => {
    logger.info('saved profile')
  },
  (err) => {
    logger.error(err)
  }
)

