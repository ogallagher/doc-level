/**
 * doc-level entrypoint.
 */

import { RelationalTag } from 'relational_tags'
import * as config from './config.js'
import * as reader from './reader.js'
import * as tp from './textProfile.js'
import * as ms from './messageSchema.js'
import * as writer from './writer.js'
import * as si from './storiesIndex.js'
import pino from 'pino'
import * as readline from 'node:readline/promises'
import path from 'path'
import { fileString } from './stringUtil.js'
import * as lib from './library.js'
import { StorySummary } from './storySummary.js'
import { IndexPage } from './indexPage.js'

/**
 * @typedef {import('./storiesIndex.js').Story} Story
 */

/**
 * @type {pino.Logger}
 */
const logger = pino(
  {
    name: 'doc-level',
    level: 'info'
  }
)

/**
 * 
 * @returns {Promise<undefined>}
 */
function init() {
  return new Promise((res) => {
    // TODO relational-tags log level update is not working
    RelationalTag.logger.level = 'error'
    res()
  })
  .then(Promise.all([
    tp.init(logger),
    ms.init(logger),
    writer.init(logger),
    si.init(logger),
    lib.init(logger)
  ]))
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
        
        const indexNames = si.getStoryIndexNames()
        config.argParser.choices('fetch-stories-index', indexNames)
        config.argParser.choices('index', indexNames)
        config.argParser.default('index', indexNames[0])

        return reader
        .init(logger, ai, chatModel, maturityModel, readingDifficultyWordsMax, readingDifficultyPhrasesMax)
      }
    )
  })
}

/**
 * 
 * @param {boolean} showHelp 
 * @returns 
 */
function getArgSrc(showHelp) {
  /**
   * @type {readline.Interface}
   */
  let rl
  return (
    showHelp ? config.argParser.getHelp() : Promise.resolve('')
  )
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

function fetchStorySummaries(storiesIndex, storiesMax, storiesDir) {
  // fetch stories from requested index
  return reader.fetchStories(storiesIndex, storiesMax, storiesDir)
  .then((pagedStories) => {
    logger.info('fetched %s pages of stories from %s', pagedStories.size, storiesIndex)
  })
}

/**
 * @param {string} storiesDir
 * @returns {Promise<Map<string, Map<number, IndexPage>>>}
 */
async function fetchStoryIndexPages(storiesDir) {
  /**
   * @type {Map<string, Map<number,IndexPage>>}
   */
  const indexPages = new Map()

  await (
    reader.listFiles(storiesDir, /index.json$/)
    .then((indexPaths) => {
      logger.debug('parsing %s story index page paths', indexPages.length)
      const pagePathRegExp = /\/([^\/]+)\/page-(\d+)/
      
      indexPaths.forEach(
        /**
         * @param {string} indexPagePath 
         * @returns {IndexPage}
         */
        (indexPagePath) => {
          const pagePathParse = indexPagePath.match(pagePathRegExp)
          if (pagePathParse === null) {
            logger.error('unable to parse stories index page path %s', indexPagePath)
          }
          else {
            const indexPage = new IndexPage(
              pagePathParse[1],
              parseInt(pagePathParse[2]),
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
 * 
 * @param {Map<string, Map<number, IndexPage>>} indexPages 
 * @returns {Promise<void>}
 */
async function showAvailableStories(indexPages) {
  const browseStoriesPrompt = await reader.loadPrompt(
    reader.PROMPT_BROWSE_STORIES_FILE,
    [...indexPages.entries()].map(([index, pages]) => {
      // index section
      return [`[${index}]`]
      .concat(
        [...pages.entries()].map(([page, sip]) => {
          // page file
          return `  [${page}] ${sip.filePath}`
        })
      )
      .join('\n') + '\n'
    })
    .join('\n')
  )
  console.log(browseStoriesPrompt)
}

/**
 * Fetch story summary and full text as list of fragments.
 * 
 * @param {string} storiesDir
 * @param {string[]} storyIndexPaths
 * @param {number} storyIndexPage
 * @param {string} storyIndexName
 * @param {string} storyId
 *  
 * @returns {Promise<{storyText: string[], storySummary: StorySummary}>}
 */
async function fetchStory(storiesDir, storyIndexPath, storyIndexName, storyIndexPage, storyId) {
  // load story summary from index page
  const storySummary = await (
    reader.loadText(storyIndexPath)
    .then((indexJson) => {
      /**
       * @type {Story[]}
       */
      const stories = JSON.parse(indexJson).filter((story) => story.id === storyId)

      if (stories.length === 1) {
        return stories[0]
      }
      else {
        throw new Error(`unable to load story id=${storyId} from ${storyIndexPath}`)
      }
    })
  )

  const storyIndex = si.getStoriesIndex(storyIndexName)

  // download full story webpage to temp file
  const tempDir = path.join(`data/temp/${storyIndexName}/page-${storyIndexPage}/story-${storyId}`)
  await writer.initDir(tempDir)
  const storyWebpagePath = await writer.downloadWebpage(
    new URL(storySummary.url), 
    path.join(
      tempDir, 
      `${fileString(storySummary.authorName)}_${fileString(storySummary.title)}${storyIndex.storyFileExt}`
    ),
    true
  )

  // convert story webpage to full text
  const storyPage = (
    storyIndex.storyFileExt === '.html'
    ? (await reader.parseHtml(storyWebpagePath))
    : (await reader.loadText(storyWebpagePath))
  )
  const storyFullTextPath = path.join(
    storiesDir, storyIndexName, `story-${storyId}`, 
    `${fileString(storySummary.authorName)}_${fileString(storySummary.title)}.txt`
  )
  await writer.initDir(path.dirname(storyFullTextPath))

  let textGenerator = si.getStoriesIndex(storyIndexName).getStoryText(storyPage)
  /**
   * @type {string[]}
   */
  let storyText = []
  /**
   * @type {string}
   */
  let textFragment
  let storyFile = await writer.openFile(storyFullTextPath)
  while (textFragment = textGenerator.next().value) {
    // create local reference so that next iteration can fetch while file is open
    storyText.push(textFragment)
    await writer.writeText(textFragment + '\n\n', storyFile)
  }
  storyFile.close()
  
  logger.info('saved story=%s paragraph-count=%s to %s', storyId, storyText.length, storyFullTextPath)
  return { storyText, storySummary }
}

/**
 * Reduce story text to excerpt string and save to local file.
 * 
 * Method does not wait for the excerpt file to be created before return, since it's only for
 * user reference.
 * 
 * @param {string[]} storyText 
 * @param {number} storyLengthMax 
 * @param {string} excerptPath 
 * @returns {Promise<string[]>} Story excerpt as list of fragments.
 */
async function reduceStory(storyText, storyLengthMax, excerptPath) {
  const excerpt = await reader.reduceStory(storyText, storyLengthMax)
  logger.info('reduced story len=%s to excerpt len=%s', storyText.length, excerpt.length)

  // save reduced excerpt to local file
  writer.writeText(excerpt.join('\n'), excerptPath)
  .then(() => {
    logger.info('saved story excerpt to path=%s', excerptPath)
  })

  return excerpt
}

/**
 * Create story profile and save to local file.
 * 
 * @param {string} storyText 
 * @param {string} textPath 
 * @returns {Promise<reader.Context>}
 */
async function createProfile(storyText, textPath) {
  const ctx = new reader.Context(storyText, new tp.TextProfile(), textPath)

  let storyPrelude = storyText.substring(0, 20)

  await Promise.all([
    new Promise((res) => {
      logger.info('get maturity of %s...', storyPrelude)

      reader.getMaturity(ctx)
      .then((maturity) => {
        ctx.profile.setMaturity(maturity)
        logger.info('profile.maturity=%o', ctx.profile.maturity)
        res()
      })
    }),
    new Promise((res) => {
      logger.info('get difficulty of %s...', storyPrelude)

      reader.getDifficulty(ctx)
      .then((difficulty) => {
        ctx.profile.setDifficulty(difficulty)
        logger.info('profile.difficulty=%o', ctx.profile.difficulty)
        res()
      })
    }),
    new Promise((res) => {
      logger.info('get topics in %s...', storyPrelude)

      reader.getTopics(ctx)
      .then((topics) => {
        ctx.profile.setTopics(topics)
        logger.info('profile.topics=%o', ctx.profile.topics)
        res()
      })
    }),
    new Promise((res) => {
      logger.info('get ideologies in %s...', storyPrelude)

      reader.getIdeologies(ctx)
      .then((ideologies) => {
        ctx.profile.setIdeologies(ideologies)
        logger.info('profile.ideologies=%o', ctx.profile.ideologies)
        res()
      })
    })
  ])

  logger.info('created profile for given textPath=%o', ctx.textPath)

  // save profile
  logger.info('save profile to profilePath=%o', ctx.profilePath)
  await writer.writeText(
    JSON.stringify(ctx.profile, undefined, 2),
    ctx.profilePath
  )
  logger.info('saved profile')

  return ctx
}

/**
 * Looping program execution.
 * 
 * @param {string|undefined} argSrc
 * 
 * @returns {Promise<string>}
 */
async function main(argSrc) {
  // runtime args
  const args = await config.loadArgs(argSrc)

  // update logging
  // TODO update of root logger level is not affecting child loggers
  logger.level = args.logLevel
  logger.debug('root logger.level=%s', logger.level)

  // update filesystem, fetch new story summaries
  await Promise.all([
    writer.initDir(args.storiesDir)
    .then(async () => {
      if (args.fetchStoriesIndex !== undefined) {
        await fetchStorySummaries(
          si.getStoriesIndex(args.fetchStoriesIndex),
          args.fetchStoriesMax,
          args.storiesDir
        )
      }
      else {
        logger.debug('skip story summaries fetch')
      }
    }),

    writer.initDir(args.profilesDir)
  ])

  // get available story index files
  const indexPages = await fetchStoryIndexPages(args.storiesDir)

  /**
   * Story text as list of fragments.
   * @type {string[]|undefined}
   */
  let storyText
  /**
   * @type {StorySummary}
   */
  let storySummary
  
  if (args.story === undefined && args.showLibrary === undefined) {
    // show available local story lists if no story selected
    await showAvailableStories(indexPages)
  }
  else if (args.showLibrary !== undefined) {
    logger.info('show library in format=%s', args.showLibrary)

    const library = await lib.getLibrary(
      // for each index
      [...indexPages.values()]
      .map((pages) => {
        // for each page number, return page objects
        return [...pages.values()]
      })
      .flat(),
      args.profilesDir
    )
    
    // open library render file
    await writer.initDir(args.rendersDir)
    let renderFilename = fileString(
      'library'
      + (args.tag !== undefined ? `_t=${args.tag}` : '')
      + (args.query !== undefined ? `_q=${args.query}` : '')
      + (args.showLibrary === 'tag' ? `_tags.txt` : `.${args.showLibrary}`)
    )
    const renderPath = path.join(args.rendersDir, renderFilename)
    const renderFile = await writer.openFile(renderPath)

    try {
      for (let chunk of lib.exportLibrary(library, args.showLibrary, args.tag, args.query, args.sort)) {
        writer.writeText(chunk, renderFile)
      }
    }
    catch (err) {
      logger.error('library export failed. %s %o', err, err)
    }
    
    renderFile.close()
    logger.info('view library at %s', renderPath)
  }

  if (args.story !== undefined) {
    // resolve index alias
    args.index = si.getStoriesIndex(args.index).name

    // fetch story if selected
    const indexPage = indexPages.get(args.index).get(args.page)

    logger.info('fetch index=%s page-%s=[%s] story=%s', args.index, args.page, indexPage.filePath, args.story)
    await fetchStory(
      args.storiesDir, indexPage.filePath, args.index, args.page, args.story
    ).then((storyInfo) => {
      storyText = storyInfo.storyText
      storySummary = storyInfo.storySummary
    })
    logger.debug('fetched storySummary=%o', storySummary)
  }

  // reduce story
  /**
   * @type {string|undefined}
   */
  let excerptPath
  if (storyText !== undefined) {
    excerptPath = path.join(
      args.profilesDir, args.index, `story-${args.story}`, 
      `${fileString(storySummary.authorName)}_${fileString(storySummary.title)}_excerpt.txt`
    )
    await writer.initDir(path.dirname(excerptPath))
    storyText = await reduceStory(storyText, args.storyLengthMax, excerptPath)
  }
  else {
    logger.debug('story undefined; skip reduce')
  }
  
  // create story profile
  if (storyText !== undefined) {
    if (!args.skipProfile) {
      await createProfile(storyText.join('\n'), excerptPath)
    }
    else {
      logger.info('skip generate profile of story=%s path=%s', args.story, excerptPath)
    }
  }

  // loop main
  getArgSrc(true).then(main)
}

// init
init()
// main
.then(
  main,
  (initErr) => {
    throw new Error(`error during initialization`, {
      cause: initErr
    })
  }
)

