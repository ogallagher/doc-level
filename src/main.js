import * as readline from 'node:readline/promises'
import path from 'path'
import * as lib from './library.js'
import * as config from './config.js'
import * as reader from './reader.js'
import * as tp from './textProfile.js'
import * as writer from './writer.js'
import * as progress from './progress.js'
import { getStoriesIndex } from './storiesIndex/index.js'
import { StoriesIndex } from './storiesIndex/storiesIndex.js'
import { LOCAL_INDEX_NAME } from './storiesIndex/LocalStoriesIndex.js'
import { StorySummary } from './storySummary.js'
import { fileString } from './stringUtil.js'
import { IndexPage } from './indexPage.js'
import { flushCliLogStream } from './pinoCliLogTransport.js'
import { autopilot } from './autopilot.js'
import { LibrarySearchEntry } from './librarySearchEntry.js'

/**
 * @typedef {import('pino').Logger} Logger
 * @typedef {import('./librarySearchEntry.js').BookReference} BookReference
 * @typedef {import('cli-progress').MultiBar} MultiBar
 * @typedef {import('cli-progress').SingleBar} SingleBar
 */

/**
 * @type {Logger}
 */
let logger

/**
 * Init module logger.
 * 
 * @param {Logger} parentLogger
 */
export function init(parentLogger) {
  return new Promise(function(res) {
    logger = parentLogger.child(
      {
        name: 'main'
      }
    )
    
    logger.debug('end init')
    res(logger)
  })
}

/**
 * @type {lib.Library|undefined}
 */
let library

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
 * @param {number|undefined} pagePrev Previous page number. `undefined` or `-infinity` means there was no
 * previous page, so next is same as first.
 * @param {string} index
 * 
 * @returns {Promise<number>} Page number, or `+/-infinity` if the requested page number is beyond
 * the bounds of the current stories index.
 */
export async function resolvePageVar(pageOpt, pagePrev, indexName) {
  if (pageOpt.startsWith(config.OPT_VAR_PREFIX)) {
    const pageVar = pageOpt.substring(config.OPT_VAR_PREFIX.length)
    const index = getStoriesIndex(indexName)

    if (pageVar === config.OPT_VAR_FIRST) {
      return index.pageNumberMin
    }
    else if (pageVar === config.OPT_VAR_NEXT) {
      if (pagePrev === Number.NEGATIVE_INFINITY || pagePrev === undefined) {
        logger.info('page %s without previous equals %s', config.OPT_VAR_NEXT, config.OPT_VAR_FIRST)
        return index.pageNumberMin
      }
      else if (pagePrev + 1 > index.pageNumberMax) {
        logger.info(
          'page number %s is beyond max %s of index %s', pagePrev + 1, index.pageNumberMax, indexName
        )
        return Number.POSITIVE_INFINITY
      }
      else if (pagePrev + 1 < index.pageNumberMin) {
        logger.info(
          'page number %s is below min %s of index %s', pagePrev + 1, index.pageNumberMin, indexName
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
    return parseInt(pageOpt)
  }
}

/**
 * @param {string} storyOpt 
 * @param {string|undefined} storyPrev Previous story id. If `undefined` or not present in the current 
 * page, assumed equivalent to story array index `-1`, the next being `0` for the first story in the 
 * current page.
 * @param {string} pagePath
 * 
 * @returns {Promise<{story: StorySummary|number, storyArrayIndex: number}>} The story if within the bounds of the page, or `+/-infinity` if
 * story array index is beyond the bounds of the current page.
 */
export async function resolveStoryVar(storyOpt, storyPrev, pagePath) {
  if (storyOpt.startsWith(config.OPT_VAR_PREFIX)) {
    const storyVar = storyOpt.substring(config.OPT_VAR_PREFIX.length)
    const stories = await reader.loadStories(pagePath)
    let storyArrayIndex

    if (storyVar === config.OPT_VAR_FIRST) {
      storyArrayIndex = 0
    }
    else if (storyVar === config.OPT_VAR_NEXT) {
      if (storyPrev === undefined) {
        storyArrayIndex = 0
      }
      else {
        storyArrayIndex = stories.findIndex((s) => s.id === storyPrev) + 1
      }
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
      return {story: Number.POSITIVE_INFINITY, storyArrayIndex}
    }
    else if (storyArrayIndex < 0) {
      return {story: Number.NEGATIVE_INFINITY, storyArrayIndex}
    }
    else {
      const story = stories[storyArrayIndex]
      logger.debug('story id var=%s resolved to %s', storyOpt, story.id)
      return {story, storyArrayIndex}
    }
  }
  else {
    // value of story option is not a variable
    return await reader.loadStory(pagePath, storyOpt)
  }
}

/**
 * 
 * @param {string} historyOpt 
 */
export async function resolveHistoryVar(historyOpt) {
  if (historyOpt.startsWith(config.OPT_VAR_PREFIX)) {
    const historyVar = historyOpt.substring(config.OPT_VAR_PREFIX.length)

    if (historyVar === config.OPT_VAR_LAST) {
      return Number.POSITIVE_INFINITY
    }
    else {
      throw new Error(`invalid history variable ${historyOpt}`)
    }
  }
  else {
    // value of history option is not a variable
    return parseInt(historyOpt)
  }
}

/**
 * @param {StoriesIndex} index 
 * @param {string} startPage
 * @param {string|undefined} startStory
 * @param {number} storiesMax 
 * @param {string} storiesDir 
 * @param {string|undefined} storyPrev
 * @param {MultiBar} parentPB
 * 
 * @returns {Promise<Map<number, StorySummary[]>>} Paged story summaries.
 */
async function fetchStorySummaries(index, startPage, startStory, storiesMax, storiesDir, storyPrev, parentPB) {
  // @next in this context refers to last+1 instead of previous+1
  // Math.max returns -infinity if no local pages exist
  const lastPageNumber = Math.max(
    ...(await reader.listStoryIndexPages(storiesDir, index.name)).get(index.name).keys()
  )
  const pageNumber = await resolvePageVar(startPage, lastPageNumber, index.name)

  let storyArrayIndex = 0
  if (startStory !== undefined) {
    let story
    ({ story, storyArrayIndex } = await resolveStoryVar(
      startStory, storyPrev, IndexPage.getPath(index.name, pageNumber, storiesDir)
    ))
    if (typeof story === 'number') {
      storyArrayIndex = 0
    }
  }

  // fetch stories from requested index
  const pagedStories = await reader.fetchStories(
    index, 
    pageNumber,
    storyArrayIndex,
    storiesMax, 
    storiesDir,
    parentPB
  )
  
  logger.info('fetched %s pages of stories from %s', pagedStories.size, index.name)
  return pagedStories
}

/**
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
        [...pages.entries()]
        .sort(([pnA], [pnB]) => pnA - pnB )
        .map(([pageNumber, indexPage]) => {
          // page file
          return `  [${pageNumber}] ${indexPage.filePath}`
        })
      )
      .join('\n') + '\n'
    })
    .join('\n')
  )
  console.log(browseStoriesPrompt)
}

/**
 * 
 * @param {string|undefined} lastNumberVar 
 * @param {number|undefined} count 
 * @param {string} historyDir 
 */
async function showLibarySearches(lastNumberVar, count, historyDir) {
  const lastNumber = await resolveHistoryVar(lastNumberVar)
  console.log(`Library search history: show latest ${count} until ${lastNumber}`)
  let searches = await reader.listLibrarySearchHistory(historyDir, lastNumber, count)

  new Array(...searches.entries())
  // sort time (number) descending
  .sort(([nA], [nB]) => nB - nA)
  // print entries to console
  .forEach(([number, search]) => {
    console.log(
      `[${number}] @${search.searchDate.toISOString()} x${search.resultBookRefs.length}\n`
      + `\t((${search.input}))\n`
      + `\t[${search.renderFilePath}]`
    )
  })
  
  return searches
}

/**
 * @param {StorySummary} story 
 * @param {string} storiesDir
 * @returns {Promise<IndexPage>}
 */
async function updateLocalIndexPage(story, storiesDir) {
  const index = getStoriesIndex(LOCAL_INDEX_NAME)
  const { page, stories } = await reader.getIndexPage(index.name, index.pageNumberMin, storiesDir)

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
  const storyIndex = getStoriesIndex(indexName)

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

    let textGenerator = getStoriesIndex(indexName).getStoryText(storyPage)

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
    return (await reader.loadText(excerptPath)).split('\n').filter((pgraph) => pgraph.length > 0)
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
 * @param {MultiBar|undefined} parentPB Progress context from parent.
 * @returns {Promise<reader.Context>}
 */
async function createProfile(storyText, textPath, replaceIfExists, parentPB) {
  const ctx = new reader.Context(storyText, new tp.TextProfile(), textPath)
  const profileSteps = ['maturity', 'difficulty', 'topics', 'ideologies', 'save']
  const pbProfile = (
    parentPB !== undefined 
    ? progress.addBar(parentPB, `create profile ${path.basename(ctx.profile.filePath)}`, profileSteps.length) 
    : undefined
  )

  // check whether local profile file already exists
  if (!replaceIfExists && await writer.fileExists(ctx.profile.filePath)) {
    logger.info('load existing local profile from path="%s"', ctx.profile.filePath)
    ctx.profile = new tp.TextProfile(await reader.loadProfile(ctx.profile.filePath))
    pbProfile?.update(profileSteps.length)
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
          pbProfile?.increment()
          res()
        })
      }),
      new Promise((res) => {
        logger.info('get difficulty of %s...', storyPrelude)

        reader.getDifficulty(ctx)
        .then((difficulty) => {
          ctx.profile.setDifficulty(difficulty)
          logger.info('profile.difficulty=%o', ctx.profile.difficulty)
          pbProfile?.increment()
          res()
        })
      }),
      new Promise((res) => {
        logger.info('get topics in %s...', storyPrelude)

        reader.getTopics(ctx)
        .then((topics) => {
          ctx.profile.setTopics(topics)
          logger.info('profile.topics=%o', ctx.profile.topics)
          pbProfile?.increment()
          res()
        })
      }),
      new Promise((res) => {
        logger.info('get ideologies in %s...', storyPrelude)

        reader.getIdeologies(ctx)
        .then((ideologies) => {
          ctx.profile.setIdeologies(ideologies)
          logger.info('profile.ideologies=%o', ctx.profile.ideologies)
          pbProfile?.increment()
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
    pbProfile?.increment()
  }

  return ctx
}

/**
 * @param {string} tagsDir 
 */
function saveCustomTags(tagsDir) {
  if (library !== undefined) {
    const saveTagsPath = path.join(tagsDir, `${lib.Library.tCustom.name}.json`)
    console.log(`save custom tags to ${saveTagsPath}`)
    let customTags = lib.getCustomTags()
    writer.writeText(
      '[' + customTags.map((t) => t.toString()).join(',') + ']', 
      saveTagsPath,
      true
    )
  }
}

/**
 * Looping program execution. End of each lap pauses for next set of arguments before
 * passing as input to the next.
 * 
 * @param {string|string[]|undefined} argSrc Source of user input arguments. Taken from `process.argv` if not 
 * defined.
 * @param {number|undefined} pagePrev Previous stories index page number.
 * @param {string|undefined} storyPrev Previous story id.
 * @param {boolean} cycle Whether loop execution, prompting for user input.
 * @param {MultiBar|undefined} parentPB Caller progress bars context. Should only be defined if `!cycle`, in which case
 * progress bars are not closed at the end of each cycle to enable user console input.
 * 
 * @returns {Promise<undefined|{
 *  fetchedPagedStories: Map<number, StorySummary[]>|undefined
 * }>} If looped, no return. Else, fetched stories.
 */
export async function main(argSrc, pagePrev, storyPrev, cycle=true, parentPB=undefined) {
  // runtime args
  const args = await config.loadArgs(argSrc)

  /**
   * @type {MultiBar|undefined} Progress bars context, used for prolonged operations.
   */
  let pb

  function consoleLog(message) {
    if (parentPB === undefined) {
      console.log(message)
    }
    else {
      progress.log(parentPB, message)
    }
  }

  // register process.exit listeners
  if (cycle) {
    process.removeAllListeners('exit')
    process.on('exit', () => {
      saveCustomTags(args.tagsDir)
    })
  }

  if (args.help) {
    await config.argParser.getHelp()
      .then((prompt) => {
        consoleLog(prompt + '\n')
      })
  }

  // update logging
  logger.setLevel(args.logLevel)
  logger.debug('root logger.level=%s', logger.level)

  // update filesystem 
  await Promise.all([
    writer.initDir(args.storiesDir),
    writer.initDir(args.profilesDir),
    writer.initDir(path.join(args.historyDir, config.SEARCHES_DIR)),
    writer.initDir(args.tagsDir)
  ])

  // fetch new story summaries
  /**
   * @type {Map<number, StorySummary[]>|undefined}
   */
  let fetchedPagedStories
  if (args.fetchStoriesIndex !== undefined && !args.autopilot) {
    pb = parentPB || progress.start()

    fetchedPagedStories = await fetchStorySummaries(
      getStoriesIndex(args.fetchStoriesIndex),
      args.page,
      args.story,
      args.fetchStoriesMax,
      args.storiesDir,
      storyPrev,
      pb
    )

    if (pb !== parentPB) {
      progress.stop(pb)
    }
  }
  else {
    logger.debug('skip story summaries fetch')
  }

  /**
   * All available index pages in local filesystem.
   * @type {Map<string, Map<number, IndexPage>>|undefined}
   */
  let indexPages

  // show available local index pages if no story selected
  if (
    // Don't show index pages if single or start story is defined. 
    // Latter case is normally only used by autopilot, so displaying index pages is redundant.
    args.story === undefined
    && args.localStoryFile === undefined
    && args.showLibrary === undefined
    && args.showHistory === undefined
    && args.customTag === undefined
    && !args.help
  ) {
    indexPages = await reader.listStoryIndexPages(args.storiesDir)
    await showAvailableStories(indexPages)
  }

  // show history
  /**
   * @type {BookReference[]|undefined}
   */
  let historyBooks = undefined
  if (args.showHistory !== undefined) {
    /**
     * @type {string}
     */
    let lastSearchNumber
    /**
     * @type {number}
     */
    let searchCount
    
    if (args.autopilot) {
      if (args.showHistory === '') {
        // default search number
        args.showHistory = `${config.OPT_VAR_PREFIX}${config.OPT_VAR_LAST}`
      }

      lastSearchNumber = args.showHistory
      searchCount = 1
      historyBooks = []
    }
    else {
      if (args.showHistory === '') {
        // default search count
        args.showHistory = 10
      }

      lastSearchNumber = `${config.OPT_VAR_PREFIX}${config.OPT_VAR_LAST}`
      searchCount = args.showHistory
    }

    let searches = await showLibarySearches(lastSearchNumber, searchCount, args.historyDir)

    if (historyBooks !== undefined) {
      // load book references from search history
      for (let search of searches.values()) {
        historyBooks.push(...search.resultBookRefs)
      }
    }
  }

  // load library and custom tags
  if (args.showLibrary !== undefined || args.customTag !== undefined) {
    if (args.reload || library === undefined) {
      logger.info('load library from filesystem')

      if (indexPages === undefined) {
        indexPages = await reader.listStoryIndexPages(args.storiesDir)
      }

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

      const tagsPath = path.join(args.tagsDir, `${lib.Library.tCustom.name}.json`)
      if (await writer.fileExists(tagsPath)) {
        await reader.loadText(tagsPath)
        .then((tagsJson) => {
          lib.loadCustomTags(library, tagsJson)
        })
      }
    }
    else {
      logger.info('use existing library from memory')
    }
  }

  // search library
  if (args.showLibrary !== undefined) {
    logger.info('show library in format=%s', args.showLibrary)

    // open library render file
    await writer.initDir(args.rendersDir)
    let renderFilename = fileString(
      'library'
      + (args.tag !== undefined ? `_t=${args.tag}` : '')
      + (args.query !== undefined ? `_q=${args.query}` : '')
      + (args.searchExpr !== undefined ? `_search-expr=${
          args.searchExpr.replaceAll(config.SEARCH_OP_EQ, '').replaceAll("'", '')
        }` : '')
      + (args.showLibrary === 'tag' ? `_tags.txt` : `.${args.showLibrary}`)
    )
    const renderPath = path.join(args.rendersDir, renderFilename)
    const renderFile = await writer.openFile(renderPath)

    try {
      let exportLibraryGen = lib.exportLibrary(library, args.showLibrary, args.tag, args.query, args.searchExpr, args.sort)
      /**
       * @type {string|BookReference[]|undefined}
       */
      let value
      
      for (
        let next = exportLibraryGen.next(); 
        (value = next.value) && !next.done; 
        next = exportLibraryGen.next()
      ) {
        await writer.writeText(value, renderFile)
      }

      if (value !== undefined) {
        // open new search history entry file
        const lastSearchEntry = (
          await reader.listLibrarySearchHistoryPaths(args.historyDir, Number.POSITIVE_INFINITY, 1)
        )[0]
        const searchEntry = new LibrarySearchEntry(
          new Date(), 
          lastSearchEntry !== undefined ? lastSearchEntry[0] + 1 : 0,
          [].concat(
            (args.tag !== undefined ? ['-t', `"${args.tag}"`] : []),
            (args.query !== undefined ? ['-q', `"${args.query}"`] : []),
            (args.searchExpr !== undefined ? ['-?', `"${args.searchExpr}"`]: []),
            (args.sort !== undefined ? ['->', args.sort] : []),
            ['-L', args.showLibrary]
          ).join(' '),
          renderPath,
          value,
          args.historyDir
        )

        logger.info('write library search entry to %s', searchEntry.filePath)
        await writer.writeText(JSON.stringify(searchEntry, searchEntry.getSerializable, 2), searchEntry.filePath)
        consoleLog(
          `added entry with ${searchEntry.resultBookRefs.length} book references `
          + `to library search history at ${searchEntry.filePath}`
        )
      }
    }
    catch (err) {
      logger.error('library export failed. %s %o', err, err)
    }

    renderFile.close()
    consoleLog(`view library at ${renderPath}`)
  }

  // custom tagging
  if (args.customTag !== undefined) {
    [...library.execTaggingExpression(args.customTag)]
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
  /**
   * @type {SingleBar|undefined}
   */
  let pbProcessStory

  // fetch story
  await (
    (async () => {
      if (args.story !== undefined && args.fetchStoriesIndex === undefined) {
        // resolve index alias
        args.index = getStoriesIndex(args.index).name

        // resolve page variable
        let pageNumber = await resolvePageVar(args.page, pagePrev, args.index)
        if (pageNumber === Number.POSITIVE_INFINITY || pageNumber === Number.NEGATIVE_INFINITY) {
          throw new Error(
            `page number ${args.page} is outside configured bounds for index ${args.index}`
          )
        }
        indexPage = new IndexPage(
          args.index,
          pageNumber,
          undefined,
          args.storiesDir
        )
        args.page = Number(indexPage.pageNumber).toString()

        // resolve story variable
        let { story, storyArrayIndex } = await resolveStoryVar(args.story, storyPrev, indexPage.filePath)
        if (story === Number.NEGATIVE_INFINITY) {
          throw new Error(`story array index ${args.story}=${storyArrayIndex} is less than 0`)
        }
        else if (story === Number.POSITIVE_INFINITY) {
          throw new Error(
            `story array index ${args.story}=${storyArrayIndex} is beyond the last story in page ${indexPage}; `
            + `try next page ${pageNumber + 1}`
          )
        }
        storySummary = story
        args.story = story.id

        if (args.autopilot) {
          // start fetching from selected story with autopilot
          consoleLog('launch autopilot')
          await autopilot(args, storyArrayIndex)
        }
        else {
          // fetch selected story
          consoleLog(`select index=${args.index} page=${args.page} story=${args.story}`)
          logger.info('fetch index=%s page-%s=[%s] story=%s', args.index, args.page, indexPage.filePath, args.story)

          const _excerptPath = getExcerptPath(args.profilesDir, args.index, args.story, story.authorName, story.title)
          if (await writer.fileExists(_excerptPath)) {
            logger.info('excerpt file already exists; skip full text')
            excerptPath = _excerptPath
          }
          else {
            try {
              storyText = await fetchStory(args.storiesDir, story, args.index, args.page)
            }
            catch (err) {
              logger.info('failed to fetch index %s story %s. %s', args.index, story, err)
              
              pb = parentPB || progress.start()
              progress.addBar(pb, `failed to fetch index=${args.index} page=${args.page} story=${args.story}`, 0)
              storySummary = undefined
            }
          }
        }
      }
      else if (args.localStoryFile !== undefined) {
        let storyInfo = await fetchLocalStory(args.localStoryFile, args.storiesDir)
        // select local story for subsequent operations
        args.index = storyInfo.indexPage.indexName
        args.page = storyInfo.indexPage.pageNumber
        args.story = storyInfo.storySummary.id

        storyText = storyInfo.storyText
        storySummary = storyInfo.storySummary
        indexPage = storyInfo.indexPage
      }
    })()
  )
  if (storySummary !== undefined && !args.autopilot) {
    logger.debug('fetched storySummary=%o', storySummary)
    pb = parentPB || progress.start()
    pbProcessStory = progress.addBar(pb, `process ${storySummary}`, ['reduce', 'profile'].length)
  }

  // use history books as input instead of single story
  if (historyBooks !== undefined) {
    if (args.autopilot) {
      consoleLog('launch autopilot for %s history books', historyBooks.length)
      await autopilot(args, undefined, historyBooks)
    }
    else {
      logger.error('no operation selected for %s loaded history books', historyBooks.length)
    }
  }

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
    // process-story.reduce
    pbProcessStory.increment()
  }
  else {
    logger.debug('story undefined; skip reduce')
  }

  // create story profile
  if (storyText !== undefined) {
    if (!args.skipProfile) {
      const readerContext = await createProfile(storyText.join('\n'), excerptPath, args.forceProfile, pb)
      consoleLog(`story-${args.story} profile at ${readerContext.profile.filePath}`)

      if (library !== undefined) {
        logger.info('add book profile for story %o to library', storySummary)
        library.addBook(new lib.LibraryBook(
          library, storySummary, indexPage, readerContext.profile
        ))
      }
    }
    else {
      consoleLog(`skip generate profile of story=${args.story} path="${excerptPath}"`)
    }

    // process-story.profile
    pbProcessStory.increment()
  }

  if (pb !== undefined && pb !== parentPB) {
    progress.stop(pb)
  }

  // loop main
  if (cycle) {
    logger.info('cycle main')
    await getArgSrc().then((argSrc) => {
      return main(argSrc, (isNaN(args.page) ? undefined : parseInt(args.page)), args.story)
    })
  }
  else {
    logger.info('end main without cycle')
    return {
      fetchedPagedStories
    }
  }
}
