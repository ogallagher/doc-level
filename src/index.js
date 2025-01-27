/**
 * doc-level entrypoint.
 * 
 * TODO edit readingDifficulty.txt to specify native language reader difficulty; it seems to overestimate.
 * TODO investigate why reader.fetchStories did not match stories in current webpage. 
 *  Archived page?
 *  Too much creativity?
 *  I tried to use downloaded copy of the page instead, but that raw input is much too large.
 * TODO accept url to stories list to visit each and download full text
 * TODO convert each text to excerpt of configurable length and pass into reader
 */ 

import * as config from './config.js'
import * as reader from './reader.js'
import * as tp from './textProfile.js'
import * as ms from './messageSchema.js'
import * as writer from './writer.js'
import * as si from './storiesIndex.js'
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
  writer.init(logger),
  si.init(logger)
])
.then(([, , , siIndexes]) => {
  logger.info('story indexes = %o', siIndexes)
  return config.init(logger, siIndexes)
})
.then(
  ({ 
    ai, chatModel, maturityModel, 
    readingDifficultyWordsMax,
    readingDifficultyPhrasesMax,
    logLevel, 
    storiesIndex, storiesDir
  }) => {
    logger.level = logLevel

    logger.info(
      'config.init passed. ai.baseUrl=%s chatModel=%s maturityModel=%s', 
      ai.baseURL, 
      chatModel,
      maturityModel
    )
  
    return reader
    .init(logger, ai, chatModel, maturityModel, readingDifficultyWordsMax, readingDifficultyPhrasesMax)
    .then(() => {
      return {indexName: storiesIndex, storiesDir}
    })
  }
)
.then(({indexName, storiesDir}) => {
  let p
  if (indexName !== undefined) {
    // fetch stories from requested index
    const storiesIndex = si.getStoriesIndex(indexName)
    p = reader.fetchStories(storiesIndex, 3, storiesDir)
    .then((pagedStories) => {
      logger.info('fetched %s pages of stories from %s', pagedStories.size, storiesIndex)
      pagedStories.forEach((stories, page) => {
        console.log(`page[${page}] = ${JSON.stringify(stories, undefined, 2)}`)
      })
    })
  }
  else {
    logger.debug('skip stories fetch')
    p = Promise.resolve()
  }

  // TODO resolve path to stories
  return p.then(() => {
    throw new Error('stop')
  })
})
.then(
  () => {
    // load story text
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

