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
import { fileString } from './stringUtil.js'
import * as lib from './library.js'
import { StorySummary } from './storySummary.js'
import { IndexPage } from './indexPage.js'
import { flushCliLogStream } from './pinoCliLogTransport.js'

/**
 * @typedef {import('./storiesIndex.js').Story} Story
 *
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
 * @type {Library|undefined}
 */
let library

/**
 * 
 * @returns {Promise<undefined>}
 */
function init() {
  return Promise.all([
    tp.init(logger).then(addChildLogger),
    ms.init(logger).then(addChildLogger),
    writer.init(logger).then(addChildLogger),
    si.init(logger).then(addChildLogger),
    lib.init(logger).then(addChildLogger)
  ])
  // config
  .then(() => {
    return config.init(logger)
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
 * @returns {Promise<string>}
 */
function getArgSrc() {
  /**
   * @type {readline.Interface}
   */
  let rl
  return flushCliLogStream()
  .then(() => {
    rl = readline.createInterface({
      input: process.stdin,
      // output to stderr avoids interfering with pino logger default output to stdout
      output: process.stdout
    })
    
    return rl.question('[--help for available options]\n[opts]: ')
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
 * Generate story summary and load full text from local filesystem.
 * 
 * // TODO Also create a virtual {@link StoriesIndex index} and page to store the
 * generated {@link StorySummary}.
 * 
 * @param {string} localStoryPath 
 * 
 * @returns {Promise<{storyText: string[], storySummary: StorySummary}>}
 */
async function fetchLocalStory(localStoryPath) {
  await flushCliLogStream()

  // load full text
  /**
   * @type {Promise<string>}
   */
  let fullText = reader.loadText(localStoryPath)

  // prompt for story metadata
  /**
   * @type {readline.Interface}
   */
  let rl = readline.createInterface({
    input: process.stdin,
    // output to stderr avoids interfering with pino logger default output to stdout
    output: process.stdout
  })

  let id = path.basename(localStoryPath)
  let authorName 
  while (authorName === undefined) {
    authorName = await rl.question('[author-name]: ')
    if (authorName.trim().length === 0) {
      logger.error('author name is required')
      authorName = undefined
    }
  }
  let title
  while (title === undefined) {
    title = await rl.question('[title]: ')
    if (title.trim().length === 0) {
      logger.error('title is required')
      title = undefined
    }
  }
  let publishDate
  while (publishDate === undefined) {
    publishDate = await rl.question('[publish-date]: ')
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(publishDate)) {
        publishDate = new Date(publishDate.trim())
      }
      else {
        throw new Error('expected date format not found', {
          cause: publishDate
        })
      }
    }
    catch (err) {
      logger.error('unable to parse given date; must be YYYY-MM-DD format. %s', err)
      publishDate = undefined
    }
  }

  let viewCount = -1
  let url = `file://${localStoryPath}`
  let excerpts = []

  rl.close()

  const story = new StorySummary(
    id, authorName, title, new Date(publishDate), viewCount, url, excerpts
  )
  console.log(`load full text for ${story}`)

  return fullText.then((fullText) => {
    return {
      storyText: fullText.split(/\n/).filter((pgraph) => pgraph.trim().length > 0),
      storySummary: story
    }
  })
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
  logger.info('save profile to profilePath=%o', ctx.profile.filePath)
  await writer.writeText(
    JSON.stringify(ctx.profile, undefined, 2),
    ctx.profile.filePath
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

  if (args.help) {
    await config.argParser.getHelp()
    .then((prompt) => {
      console.log(prompt + '\n')
    })
  }

  // update logging
  logger.setLevel(args.logLevel)
  logger.debug('root logger.level=%s', logger.level)

  // update filesystem 
  await Promise.all([
    writer.initDir(args.storiesDir),
    writer.initDir(args.profilesDir)
  ])

  // fetch new story summaries
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

  // get available story index files
  const indexPages = (args.help ? undefined : await fetchStoryIndexPages(args.storiesDir))
  
  // show available local story lists if no story selected
  if (
    args.story === undefined 
    && args.localStoryFile === undefined
    && args.showLibrary === undefined 
    && !args.help
  ) {
    await showAvailableStories(indexPages)
  }
  
  if (args.showLibrary !== undefined) {
    logger.info('show library in format=%s', args.showLibrary)

    if (args.reload || library === undefined) {
      logger.info('load library from filesystem')

      library = await lib.getLibrary(
        // for each index
        [...indexPages.values()]
        .map((pages) => {
          // for each page number, return page objects
          return [...pages.values()]
        })
        .flat(),
        args.profilesDir
      )
    }
    else {
      logger.info('use existing library from memory')
    }
    
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
    console.log('view library at %s', renderPath)
  }

  /**
   * Story text as list of fragments.
   * @type {string[]|undefined}
   */
  let storyText
  /**
   * @type {StorySummary}
   */
  let storySummary

  // fetch story
  await new Promise(
    /**
     * @param {function ({storyText: string[], storySummary: StorySummary}|undefined)} res 
     */
    (res) => {
      if (args.story !== undefined) {
        // resolve index alias
        args.index = si.getStoriesIndex(args.index).name
    
        // fetch story if selected
        const indexPage = indexPages.get(args.index).get(args.page)
    
        logger.info('fetch index=%s page-%s=[%s] story=%s', args.index, args.page, indexPage.filePath, args.story)
        fetchStory(
          args.storiesDir, indexPage.filePath, args.index, args.page, args.story
        ).then(res)
        logger.debug('fetched storySummary=%o', storySummary)
      }
      else if (args.localStoryFile !== undefined) {
        // resolve virtual index
        args.index = 'local'

        fetchLocalStory(args.localStoryFile)
        .then((storyInfo) => {
          args.story = storyInfo.storySummary.id
          res(storyInfo)
        })
      }
      else {
        res()
      }
    }
  )
  .then((storyInfo) => {
    storyText = storyInfo?.storyText
    storySummary = storyInfo?.storySummary
  })

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
      console.log(`skip generate profile of story=${args.story} path=${excerptPath}`)
    }
  }

  // loop main
  getArgSrc().then(main)
}

// init
init()
// main
.then(
  () => {
    main()
  },
  (initErr) => {
    throw new Error(`error during initialization`, {
      cause: initErr
    })
  }
)

