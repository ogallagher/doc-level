/**
 * doc-level entrypoint.
 */

import * as config from './config.js'
import * as reader from './reader.js'
import * as tp from './textProfile.js'
import * as ms from './messageSchema.js'
import * as writer from './writer.js'
import * as si from './storiesIndex.js'
import pino from 'pino'
import * as readline from 'node:readline/promises'
import path from 'path'
import { regexpEscape, fileString } from './stringUtil.js'
/**
 * @typedef {import('./storiesIndex.js').Story} Story
 */

/**
 * @type {pino.Logger}
 */
const logger = pino(
  {
    name: 'doc-level',
    level: 'debug'
  }
)

/**
 * 
 * @returns {Promise<undefined>}
 */
function init() {
  return Promise.all([
    tp.init(logger),
    ms.init(logger),
    writer.init(logger),
    si.init(logger)
  ])
  // config
  .then(() => {
    return config.init(logger)
    // init modules dependent on config
    .then(
      ({ 
        ai, chatModel, maturityModel, 
        readingDifficultyWordsMax,
        readingDifficultyPhrasesMax
      }) => {
        logger.info(
          'config.init passed. ai.baseUrl=%s chatModel=%s maturityModel=%s', 
          ai.baseURL, 
          chatModel,
          maturityModel
        )

        config.argParser.choices('fetch-stories-index', si.getStoryIndexNames())

        return reader
        .init(logger, ai, chatModel, maturityModel, readingDifficultyWordsMax, readingDifficultyPhrasesMax)
      }
    )
  })
}

function getArgSrc() {
  /**
   * @type {readline.Interface}
   */
  let rl
  return config.argParser.getHelp()
  .then((prompt) => {
    rl = readline.createInterface({
      input: process.stdin,
      // output to stderr avoids interfering with pino logger default output to stdout
      output: process.stderr
    })
    
    return rl.question(`${prompt}\n\n[opts]: `)
  })
  .then((argSrc) => {
    rl.close()
    return argSrc
  })
}

/**
 * Looping program execution.
 * 
 * @param {string|undefined} argSrc
 * 
 * @returns {Promise<string>}
 */
function main(argSrc) {
  // runtime args
  return config.loadArgs(argSrc)
  // update logging and filesystem
  .then((args) => {
    // TODO update of root logger level is not affecting child loggers
    logger.level = args.logLevel
    logger.debug('root logger.level=%s', logger.level)

    return Promise.all([
      writer.initDir(args.storiesDir),
      writer.initDir(args.profilesDir)
    ])
    .then(() => args)
  })
  // fetch story summaries
  .then((args) => {
    /**
     * @type {Promise<undefined>}
     */
    let pFetch
    if (args.fetchStoriesIndex !== undefined) {
      // fetch stories from requested index
      const storiesIndex = si.getStoriesIndex(args.fetchStoriesIndex)

      pFetch = reader.fetchStories(storiesIndex, args.fetchStoriesMax, args.storiesDir)
      .then((pagedStories) => {
        logger.info('fetched %s pages of stories from %s', pagedStories.size, storiesIndex)
      })
    }
    else {
      logger.debug('skip stories fetch')
      pFetch = Promise.resolve()
    }

    return pFetch.then(() => args)
  })
  // get available story index files
  .then((args) => {
    return reader.listFiles(args.storiesDir, /index.json$/)
    .then((storyIndexPaths) => {
      logger.debug('loaded %s story index paths', storyIndexPaths.length)
      return { args, storyIndexPaths }
    })
  })
  // show available local story lists if no story selected,
  // or fetch story
  .then(({ args, storyIndexPaths }) => {
    /**
     * @type {string[]|undefined}
     */
    let storyText
    /**
     * @type {string|undefined}
     */
    let storyIndexName
    /**
     * @type {Story|undefined}
     */
    let storySummary

    if (args.story === undefined) {
      return reader.loadPrompt(
        reader.PROMPT_BROWSE_STORIES_FILE, 
        storyIndexPaths.map((storyIndexPath, idx) => {
          return `- [${idx + 1}] ${storyIndexPath}`
        }).join('\n')
      )
      .then((browseStoriesPrompt) => {
        console.log(browseStoriesPrompt)
        return { args, story: storyText, storyIndexName, storySummary }
      })
    }
    else {
      logger.info('page=%s story=%s', args.page, args.story)

      const storyIndexPath = storyIndexPaths[args.page - 1]
      // name of index to which this page belongs
      const siNameMatch = storyIndexPath.match(
        new RegExp(`^${regexpEscape(args.storiesDir)}/?(.+)/page`)
      )
      if (siNameMatch === null || siNameMatch.length < 1) {
        throw new Error(`failed to parse stories index name from ${storyIndexPath}`, {
          cause: siNameMatch
        })
      }
      storyIndexName = siNameMatch[1]
      logger.info('story=%s index=%s', args.story, storyIndexName)

      // load requested story summary
      return reader.loadText(storyIndexPath)
      .then((indexJson) => {
        /**
         * @type {Story[]}
         */
        const stories = JSON.parse(indexJson).filter((story) => story.id === args.story)

        if (stories.length === 1) {
          storySummary = stories[0]
        }
        else {
          logger.error('unable to load story id=%s from %s', args.story, storyIndexPath)
          throw new Error(`unable to load story id=${args.story} from ${storyIndexPath}`)
        }
      })
      // download full page to temp file
      .then(() => {
        const tempDir = path.join(`data/temp/${storyIndexName}/page-${args.page}/story-${args.story}`)
        return writer.initDir(tempDir)
        .then(() => {
          return writer.downloadWebpage(
            new URL(storySummary.url), 
            path.join(tempDir, `${fileString(storySummary.authorName)}_${fileString(storySummary.title)}.html`),
            true
          )
        })
      })
      // convert story webpage to full text
      .then(reader.parseHtml)
      .then((storyPage) => {
        /**
         * @type {si.StoriesIndex}
         */
        const storiesIndex = si.getStoriesIndex(storyIndexName)
        let textGenerator = storiesIndex.getStoryText(storyPage)
        /**
         * @type {string}
         */
        let textFragment
        const storyPath = path.join(
          args.storiesDir, storyIndexName, `story-${args.story}`, 
          `${fileString(storySummary.authorName)}_${fileString(storySummary.title)}.txt`
        )
        return writer.initDir(path.dirname(storyPath))
        .then(async () => {
          storyText = []
          let storyFile = await writer.openFile(storyPath)
          while (textFragment = textGenerator.next().value) {
            // create local reference so that next iteration can fetch while file is open
            storyText.push(textFragment)
            await writer.writeText(textFragment + '\n\n', storyFile)
          }

          storyFile.close()
        })
        .then(() => {
          logger.info('saved story=%s paragraph-count=%s to %s', args.story, storyText.length, storyPath)
          return { args, story: storyText, storyIndexName, storySummary }
        })
      })
    }
  })
  // reduce story
  .then(({ args, story, storyIndexName, storySummary }) => {
    if (story !== undefined) {
      return reader.reduceStory(story, args.storyLengthMax)
      .then((excerpt) => {
        logger.info('reduced story len=%s to excerpt len=%s', story.length, excerpt.length)
        // save reduced excerpt to local file
        const excerptFile = path.join(
          args.profilesDir, storyIndexName, `story-${args.story}`, 
          `${fileString(storySummary.authorName)}_${fileString(storySummary.title)}_excerpt.txt`
        )
        return writer.initDir(path.dirname(excerptFile))
        .then(() => {
          return writer.writeText(excerpt.join('\n'), excerptFile)
        })
        .then(() => {
          logger.info('saved story=%s excerpt to path=%s', args.story, excerptFile)
          return {args, text: excerpt.join('\n'), textPath: excerptFile}
        })
      })
    }
    else {
      logger.debug('story undefined; skip reduce')
      return {args, text: undefined, textPath: undefined}
    }
  })
  // create story profile
  .then(({ args, text, textPath }) => {
    if (text !== undefined) {
      if (!args.skipProfile) {
        let ctx = new reader.Context(text, new tp.TextProfile(), textPath)

        return Promise.all([
          new Promise(function(res) {
            logger.info('get maturity of %s:%s...', args.story, text.substring(0, 20))

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
          }),
          new Promise((res) => {
            logger.info('get topics in %s:%s...', args.story, text.substring(0, 20))

            return reader.getTopics(ctx)
            .then((topics) => {
              ctx.profile.setTopics(topics)
              logger.info('profile.topics=%o', ctx.profile.topics)
              res()
            })
          })
        ])
        .then(() => {
          return ctx
        })
      }
      else {
        logger.info('skip generate profile of story=%s path=%s', args.story, textPath)
      }
    }
  })
  // save profile
  .then(
    (ctx) => {
      if (ctx !== undefined) {
        logger.info('created profile for given textPath=%o', ctx.textPath)
        logger.info('save profile to profilePath=%o', ctx.profilePath)
        return writer.writeText(
          JSON.stringify(ctx.profile, undefined, 2),
          ctx.profilePath
        )
        .then(() => {
          logger.info('saved profile')
        })
      }
    }
  )
  // fetch next argSrc
  .then(getArgSrc)
  // loop main
  .then(main)
}

// init
init()
// main
.then(main)

