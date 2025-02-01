/**
 * doc-level entrypoint.
 */

/*
TODO edit readingDifficulty.txt to specify native language reader difficulty; it seems to overestimate.

TODO reader.fetchStories did not match stories in current webpage; the stories are fully invented.
  I tried to use downloaded copy of the page instead, but that raw input is much too large so far.
  TODO parse downloaded index as list of story summaries. https://www.npmjs.com/package/node-html-parser

  TODO download each story full text.
  
  TODO convert each text to configurable list of excerpts and pass into reader for analysis.
*/

import * as config from './config.js'
import * as reader from './reader.js'
import * as tp from './textProfile.js'
import * as ms from './messageSchema.js'
import * as writer from './writer.js'
import * as si from './storiesIndex.js'
import pino from 'pino'
import * as readline from 'node:readline/promises'
import yargs from 'yargs/yargs'

/**
 * @type {pino.Logger}
 */
const logger = pino(
  {
    name: 'doc-level',
    level: 'debug'
  }
)

// init
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
// fetch story summaries
.then(({indexName, storiesDir}) => {
  if (indexName !== undefined) {
    // fetch stories from requested index
    const storiesIndex = si.getStoriesIndex(indexName)
    return reader.fetchStories(storiesIndex, 3, storiesDir)
    .then((pagedStories) => {
      logger.info('fetched %s pages of stories from %s', pagedStories.size, storiesIndex)
      return storiesDir
    })
  }
  else {
    logger.info('skip stories fetch')
    return storiesDir
  }
})
// inform available local story lists
.then(
  (storiesDir) => {
    return reader.listFiles(storiesDir, /index.json$/)
    .then((storyIndexPaths) => {
      logger.debug('loaded %s story index paths', storyIndexPaths.length)
      return reader.loadPrompt(
        reader.PROMPT_BROWSE_STORIES_FILE, 
        storyIndexPaths.map((storyIndexPath, idx) => {
          return `- [${idx}] ${storyIndexPath}`
        }).join('\n')
      )
    })
    .then((browseStoriesPrompt) => {
      console.log(browseStoriesPrompt)
    })
  }
)
// loop select and analyze stories
.then(
  () => {
    const rl = readline.createInterface({
      input: process.stdin,
      // output to stderr avoids interfering with pino logger default output to stdout
      output: process.stderr
    })

    // TODO loop story selection prompt
    // TODO use yargs usage and help 
    return rl.question('story to analyze: ').then((res) => {
      rl.close()
      
      return yargs(res)
      .hide('version')
      .alias('h', 'help')
      .option('page', {
        alias: 'p',
        type: 'string',
        description: 'stories listing page number',
        default: '0'
      })
      .option('story', {
        alias: 's',
        type: 'string',
        description: 'story id'
      })
      .parse()
    })
  }
)
.then(
  (pageStoryRes) => {
    logger.info('page=%s story=%s', pageStoryRes.page, pageStoryRes.story)

    throw new Error('stop')
    // load story text
    let path = 'data/이야기_1번.txt'
    return reader.loadText(path, 100)
    .then((text) => {return { text, path }})
  }
)
// analyze stories
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

