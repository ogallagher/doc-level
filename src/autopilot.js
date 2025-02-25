import { StorySummary } from './storySummary.js'
import { main } from './main.js'
import * as progress from './progress.js'
import { OPT_VAR_PREFIX } from './config.js'
/**
 * @typedef {import('pino').Logger} Logger
 * @typedef {import('./config.js').Args} Args
 * @typedef {import('./librarySearchEntry.js').BookReference} BookReference
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
  return new Promise(function (res) {
    logger = parentLogger.child(
      {
        name: 'autopilot'
      }
    )

    logger.debug('end init')
    res(logger)
  })
}

/**
 * 
 * @param {Args} args 
 * @returns {string[]}
 */
function getConstantArgs(args) {
  return [
    // filesystem locations
    '--stories-dir', args.storiesDir,
    '--profiles-dir', args.profilesDir,
    '--renders-dir', args.rendersDir,

    // profile config
    '--story-length-max', args.storyLengthMax
  ]
  .concat(args.skipProfile ? ['--skip-profile'] : [])
  .concat(args.forceProfile ? ['--force-profile'] : [])
}

/**
 * Implementation of `--autopilot` option to call `main` multiple times for processing multiple
 * stories in sequence without pausing for user input.
 * 
 * @param {Args} args
 * @param {number|undefined} storyArrayIndex
 * @param {BookReference[]} books
 */
export async function autopilot(args, storyArrayIndex, books=[]) {
  if (storyArrayIndex !== undefined) {
    logger.info('begin autopilot at index=%s page=s story=@%s', args.index, args.page, storyArrayIndex)
  }
  else {
    logger.info('begin autopilot for %s books', books.length)
  }

  const constArgs = getConstantArgs(args)

  /**
   * List of promises to load and profile stories.
   * @type {Promise[]}
   */
  const storyProcessors = []

  const pb = progress.start()

  // derive list of book references from start story if list not provided
  if (storyArrayIndex !== undefined) {
    // fetch pages of story summaries
    /**
     * @type {Map<number, StorySummary[]>}
     */
    const pagedStories = (
      await main(
        [
          '--fetch-stories-index', args.index,
          '--fetch-stories-max', args.fetchStoriesMax,
          '--page', args.page,
          '--story', `${OPT_VAR_PREFIX}${storyArrayIndex}` 
        ].concat(constArgs),
        undefined, undefined, 
        false, pb
      )
    ).fetchedPagedStories
    progress.log(pb, `fetched pages of ${args.fetchStoriesMax} story summaries`)

    const firstPageNumber = Math.min(...pagedStories.keys())
    // skip stories before first requested
    pagedStories.set(firstPageNumber, pagedStories.get(firstPageNumber).slice(storyArrayIndex))

    for (let [pageNumber, pageStories] of pagedStories.entries()) {
      // determine count of new stories
      if (books.length + pageStories.length > args.fetchStoriesMax) {
        pageStories = pageStories.slice(0, args.fetchStoriesMax - books.length)
      }
      logger.info('process %s stories from page %o', pageStories.length, pageNumber)
      books = books.concat(pageStories.map((story) => {
        return {
          indexName: args.index,
          pageNumber: pageNumber,
          storyId: story.id
        }
      }))

      if (books.length >= args.fetchStoriesMax) {
        break
      }
    }
  }
  else {
    // apply limit to books list
    books = books.slice(0, args.fetchStoriesMax)
  }

  const pbBooks = progress.addBar(pb, 'process stories', books.length)
  for (let bookRef of books) {
    storyProcessors.push(
      main(
        [
          '--index', bookRef.indexName, 
          '--page', bookRef.pageNumber, 
          '--story', bookRef.storyId
        ].concat(constArgs),
        undefined, undefined, 
        false, pb
      )
      .then(() => {
        pbBooks.increment()
      })
    )
  }

  progress.log(pb, `queued ${storyProcessors.length} story processors`)

  await Promise.all(storyProcessors)
  progress.stop(pb)
  console.log('end autopilot')
}