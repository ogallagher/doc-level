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
 * @type {lib.Library|undefined}
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

/**
 * @param {string} pageOpt 
 * @param {number} pagePrev 
 * @param {string} index
 * 
 * @returns {Promise<number>} Page numbre, or `+/-infinity` if the requested page number is beyond
 * the bounds of the current stories index.
 */
export async function resolvePageVar(pageOpt, pagePrev, indexName) {
  if (pageOpt.startsWith(config.OPT_VAR_PREFIX)) {
    const pageVar = pageOpt.substring(config.OPT_VAR_PREFIX.length)
    const index = si.getStoriesIndex(indexName)

    if (pageVar === config.OPT_VAR_FIRST) {
      return index.pageNumberMin
    }
    else if (pageVar === config.OPT_VAR_NEXT) {
      if (pagePrev+1 > index.pageNumberMax) {
        logger.info(
          'page number %s is beyond max %s of index %s', pagePrev+1, index.pageNumberMax, indexName
        )
        return Number.POSITIVE_INFINITY
      }
      else if (pagePrev+1 < index.pageNumberMin) {
        logger.info(
          'page number %s is below min %s of index %s', pagePrev+1, index.pageNumberMin, indexName
        )
        return Number.NEGATIVE_INFINITY
      }
      else {
        return pagePrev + 1
      }
    }
    else if (!isNaN(pageVar)) {
      logger.warn(
        'specifying page number %s as variable expression @<page-number> is not as efficient as literal <page-number>',
        pageVar
      )
      return parseInt(pageVar)
    }
    else {
      throw new Error(`invalid page variable ${pageOpt}`)
    }
  }
  else {
    // value of page option is not a variable
    return parseInt(pageVar)
  }
}

/**
 * @param {string} storyOpt 
 * @param {number} storyPrev 
 * @param {string} pagePath
 * 
 * @returns {Promise<StorySummary|number>} The story if within the bounds of the page, or `+/-infinity` if
 * story array index is beyond the bounds of the current page.
 */
export async function resolveStoryVar(storyOpt, storyPrev, pagePath) {
  if (storyOpt.startsWith(config.OPT_VAR_PREFIX)) {
    const storyVar = storyOpt.substring(config.OPT_VAR_PREFIX.length)
    const stories = await reader.loadStories(pagePath)
    let storyArrayIndex

    if (storyVar === config.OPT_VAR_FIRST) {
      return stories[0]
    }
    else if (storyVar === config.OPT_VAR_NEXT) {
      storyArrayIndex = storyPrev + 1
    }
    else if (!isNaN(storyVar)) {
      storyArrayIndex = parseInt(storyVar)
    }
    else {
      throw new Error(`invalid story variable ${storyOpt}`)
    }

    if (storyArrayIndex >= stories.length) {
      logger.info(
        'story array index %s is beyond length=%s of page %s', storyArrayIndex, stories.length, pagePath
      )
      return Number.POSITIVE_INFINITY
    }
    else if (storyArrayIndex < 0) {
      return Number.NEGATIVE_INFINITY
    }
    else {
      const story = stories[storyArrayIndex]
      logger.debug('story id var=%s resolved to %s', storyOpt, story.id)
      return story
    }
  }
  else {
    // value of story option is not a variable
    return storyOpt
  }
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
      logger.debug('parsing %s story index page paths', indexPages.size)
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
 * @param {StorySummary} story 
 * @param {string} storiesDir
 * @returns {Promise<IndexPage>}
 */
async function updateLocalIndexPage(story, storiesDir) {
  const index = si.getStoriesIndex(si.LocalStoriesIndex.indexName)
  const {page, stories} = await reader.getIndexPage(index.name, index.pageNumberMin, storiesDir)

  // delete existing story with same id
  for (let [storyListIndex, pageStory] of stories.entries()) {
    if (pageStory.id === story.id) {
      console.log(`found and replaced existing story ${pageStory.id}`)
      stories.splice(storyListIndex, 1)
    }
  }

  stories.push(story)

  await writer.initDir(path.dirname(page.filePath))
  await writer.writeText(JSON.stringify(stories, undefined, 2), page.filePath)
  return page
}

/**
 * Generate story summary and load full text from local filesystem.
 * 
 * Also updates a virtual {@link StoriesIndex index} and page to store the
 * generated {@link StorySummary}.
 * 
 * @param {string} localStoryPath 
 * @param {string} storiesDir
 * 
 * @returns {Promise<{
 *  storyText: string[], 
 *  storySummary: StorySummary,
 *  indexPage: IndexPage
 * }>}
 */
async function fetchLocalStory(localStoryPath, storiesDir) {
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
    const defaultAuthorName = 'anonymous'

    authorName = await rl.question(`[author-name] [default=${defaultAuthorName}]: `)
    if (authorName.trim().length === 0) {
      logger.debug('use default author name')
      authorName = defaultAuthorName
    }
  }
  let title
  while (title === undefined) {
    const defaultTitle = path.basename(localStoryPath).replace(/\.\w+$/, '')

    title = await rl.question(`[title] [default=${defaultTitle}]: `)
    if (title.trim().length === 0) {
      logger.debug('use default title')
      title = defaultTitle
    }
  }
  let publishDate
  while (publishDate === undefined) {
    publishDate = await rl.question('[publish-date] [default=today]: ')
    try {
      if (publishDate.trim().length === 0) {
        logger.debug('use default publish-date')
        publishDate = new Date()
      }
      else if (/^\d{4}-\d{2}-\d{2}$/.test(publishDate)) {
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

  let [indexPage, storyText] = await Promise.all([
    // update local index page
    updateLocalIndexPage(story, storiesDir),

    // convert full text to list of fragments
    fullText.then((fullText) => fullText.split(/\n/).filter((pgraph) => pgraph.trim().length > 0))
  ])

  return {
    storySummary: story,
    storyText,
    indexPage
  }
}

/**
 * Fetch story summary and full text as list of fragments.
 * 
 * @param {string} storiesDir
 * @param {StorySummary} story
 * @param {number} indexPage
 * @param {string} indexName
 *  
 * @returns {Promise<string[]>}
 */
async function fetchStory(storiesDir, story, indexName, indexPage) {
  const storyIndex = si.getStoriesIndex(indexName)

  // check for existing local files to skip ahead
  const tempDir = path.join(`data/temp/${indexName}/page-${indexPage}/story-${story.id}`)
  const webpageFile = `${fileString(story.authorName)}_${fileString(story.title)}${storyIndex.storyFileExt}`
  const storyFullTextPath = path.join(
    storiesDir, indexName, `story-${story.id}`, 
    `${fileString(story.authorName)}_${fileString(story.title)}.txt`
  )

  let fullTextFileExists = await writer.fileExists(storyFullTextPath)
  /**
   * @type {string[]}
   */
  let storyText = []

  if (!fullTextFileExists) {
    // download full story webpage to temp file
    await writer.initDir(tempDir)
    const storyWebpagePath = await writer.downloadWebpage(
      new URL(story.url), 
      path.join(tempDir, webpageFile),
      true
    )

    // convert story webpage to full text
    const storyPage = (
      storyIndex.storyFileExt === '.html'
      ? (await reader.parseHtml(storyWebpagePath))
      : (await reader.loadText(storyWebpagePath))
    )
    
    await writer.initDir(path.dirname(storyFullTextPath))

    let textGenerator = si.getStoriesIndex(indexName).getStoryText(storyPage)
  
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
    
    logger.info('saved story=%s paragraph-count=%s to %s', story.id, storyText.length, storyFullTextPath)
  }
  else {
    logger.info('local full text exists at "%s"; load from local instead of download', storyFullTextPath)
    storyText = await reader.loadText(storyFullTextPath)
    .then((rawText) => rawText.split(/[\n\r]{2,}/))
    
    logger.info('loaded story=%s paragraph-count=%s from %s', story.id, storyText.length, storyFullTextPath)
  }

  
  return storyText
}

function getExcerptPath(profilesDir, indexName, storyId, authorName, storyTitle) {
  return path.join(
    profilesDir, indexName, `story-${storyId}`, 
    `${fileString(authorName)}_${fileString(storyTitle)}_excerpt.txt`
  )
}

/**
 * Reduce story text to excerpt string and save to local file.
 * 
 * Method does not wait for the excerpt file to be created before return, since it's only for
 * user reference.
 * 
 * If the local excerpt file already exists, it is loaded instead.
 * 
 * @param {string[]} storyText 
 * @param {number} storyLengthMax 
 * @param {string} excerptPath 
 * @returns {Promise<string[]>} Story excerpt as list of fragments.
 */
async function reduceStory(storyText, storyLengthMax, excerptPath) {
  if (await writer.fileExists(excerptPath)) {
    logger.info('load excerpt from existing local file path="%s"', excerptPath)
    return (await reader.loadText(excerptPath)).split('\n')
  }
  else {
    const excerpt = await reader.reduceStory(storyText, storyLengthMax)
    logger.info('reduced story len=%s to excerpt len=%s', storyText.length, excerpt.length)

    // save reduced excerpt to local file
    writer.writeText(excerpt.join('\n'), excerptPath)
    .then(() => {
      logger.info('saved story excerpt to path="%s"', excerptPath)
    })

    return excerpt
  }
  
}

/**
 * Create story profile and save to local file.
 * 
 * @param {string} storyText 
 * @param {string} textPath 
 * @param {boolean} replaceIfExists
 * @returns {Promise<reader.Context>}
 */
async function createProfile(storyText, textPath, replaceIfExists) {
  const ctx = new reader.Context(storyText, new tp.TextProfile(), textPath)

  // check whether local profile file already exists
  if (!replaceIfExists && await writer.fileExists(ctx.profile.filePath)) {
    logger.info('load existing local profile from path="%s"', ctx.profile.filePath)
    ctx.profile = new tp.TextProfile(await reader.loadProfile(ctx.profile.filePath))
  }
  else {
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
    logger.info('save profile to profilePath="%o"', ctx.profile.filePath)
    await writer.writeText(
      JSON.stringify(ctx.profile, ctx.profile.getSerializable, 2),
      ctx.profile.filePath
    )
    logger.info('saved profile')
  }

  return ctx
}

/**
 * Looping program execution.
 * 
 * @param {string|undefined} argSrc
 * @param {number} pagePrev Previous stories index page number.
 * @param {number} storyPrev Previous story array index.
 * 
 * @returns {Promise<string>}
 */
async function main(argSrc, pagePrev=-1, storyPrev=-1) {
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
   * @type {StorySummary|undefined}
   */
  let storySummary
  /**
   * @type {IndexPage|undefined}
   */
  let indexPage
  /**
   * Remains `undefined` until we confirm whether the excerpt file exists or we will create it.
   * 
   * @type {string|undefined}
   */
  let excerptPath

  // fetch story
  await new Promise(
    /**
     * @param {function ({
     *  storyText: string[], 
     *  storySummary: StorySummary
     * }|undefined)} res
     */
    async (res) => {
      if (args.story !== undefined) {
        // resolve index alias
        args.index = si.getStoriesIndex(args.index).name

        // resolve page variable
        let pageNumber = await resolvePageVar(args.page, pagePrev, args.index)
        if (pageNumber === Number.POSITIVE_INFINITY || pageNumber === Number.NEGATIVE_INFINITY) {
          throw new Error(
            `page number %${pageNumber} is outside configured bounds for index ${args.index}`
          )
        }
        indexPage = indexPages.get(args.index).get(pageNumber)
        args.page = Number(indexPage.pageNumber).toString()

        // resolve story variable
        let storySummary = resolveStoryVar(args.story, storyPrev)
        args.story = storySummary.id
        
        console.log(`select index=${args.index} page=${args.page} story=${args.story}`)
    
        // fetch story if selected
        storySummary = await reader.loadStory(indexPage.filePath, args.story)
        logger.info('fetch index=%s page-%s=[%s] story=%s', args.index, args.page, indexPage.filePath, args.story)

        const _excerptPath = getExcerptPath(args.profilesDir, args.index, args.story, storySummary.authorName, storySummary.title)
        if (await writer.fileExists(_excerptPath)) {
          logger.info('excerpt file already exists; skip full text')
          excerptPath = _excerptPath
          res({storySummary})
        }
        else {
          res({
            storySummary,
            storyText: await fetchStory(args.storiesDir, storySummary, args.index, args.page)
          })
        }
      }
      else if (args.localStoryFile !== undefined) {
        let storyInfo = await fetchLocalStory(args.localStoryFile, args.storiesDir)
        // select local story for subsequent operations
        args.index = storyInfo.indexPage.indexName
        args.page = storyInfo.indexPage.pageNumber
        args.story = storyInfo.storySummary.id
        
        indexPage = storyInfo.indexPage

        res(storyInfo)
      }
      else {
        res()
      }
    }
  )
  .then((storyInfo) => {
    storyText = storyInfo?.storyText
    storySummary = storyInfo?.storySummary

    if (storySummary !== undefined) {
      logger.debug('fetched storySummary=%o', storySummary)
    }
  })

  // add unprofiled story to library if exists
  if (library !== undefined && storySummary !== undefined) {
    logger.info('add book for story %o to library', storySummary)
    library.addBook(new lib.LibraryBook(library, storySummary, indexPage, undefined))
  }

  // reduce story
  if (storyText !== undefined || excerptPath !== undefined) {
    if (excerptPath === undefined) {
      excerptPath = getExcerptPath(
        args.profilesDir, args.index, args.story, storySummary.authorName, storySummary.title
      )
      await writer.initDir(path.dirname(excerptPath))
    }
    
    storyText = await reduceStory(storyText, args.storyLengthMax, excerptPath)
  }
  else {
    logger.debug('story undefined; skip reduce')
  }
  
  // create story profile
  if (storyText !== undefined) {
    if (!args.skipProfile) {
      const readerContext = await createProfile(storyText.join('\n'), excerptPath, args.forceProfile)
      console.log(`story-${args.story} profile at ${readerContext.profile.filePath}`)

      if (library !== undefined) {
        logger.info('add book profile for story %o to library', storySummary)
        library.addBook(new lib.LibraryBook(
          library, storySummary, indexPage, readerContext.profile
        ))
      }
    }
    else {
      console.log(`skip generate profile of story=${args.story} path="${excerptPath}"`)
    }
  }

  // loop main
  await getArgSrc().then(main)
}

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

