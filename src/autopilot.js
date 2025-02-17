import { StorySummary } from './storySummary.js'
import { getStoriesIndex } from './storiesIndex.js'
import { IndexPage } from './indexPage.js'
import { main } from './main.js'
import { listStoryIndexPages, loadStories } from './reader.js'
/**
 * @typedef {import('pino').Logger} Logger
 * @typedef {import('./config.js').Args} Args
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
 * @param {number} storyArrayIndex
 */
export async function autopilot(args, storyArrayIndex) {
  logger.info('begin autopilot at index=%s page=s story=@%s', args.index, args.page, storyArrayIndex)

  const constArgs = getConstantArgs(args)

  // fetch pages of story summaries
  await main(
    [
      '--fetch-stories-index', args.index,
      '--fetch-stories-max', args.fetchStoriesMax,
      '--page', args.page
    ].concat(constArgs),
    undefined, undefined, false
  )
  console.log(`fetched pages of ${args.fetchStoriesMax} story summaries`)

  /**
   * @type {Map<number, IndexPage>}
   */
  const indexPages = (await listStoryIndexPages(args.storiesDir, args.index)).get(args.index)

  // remove pages before 

  /**
   * List of promises to load and profile stories.
   * @type {Promise[]}
   */
  const pageProcessors = []
  let storyProcessorCount = 0
  for (let [pn, ip] of indexPages.entries()) {
    // determine list of stories to process for each page
    let stories = await loadStories(ip.filePath)
    // determine count of new stories
    if (storyProcessorCount + stories.length > args.fetchStoriesMax) {
      stories = stories.slice(0, args.fetchStoriesMax - storyProcessorCount)
    }
    logger.info('process %s stories from page %o', stories.length, ip)
    storyProcessorCount += stories.length

    let p = []
    for (let story of stories) {
      p.push(main(
        [
          '--index', args.index, 
          '--page', pn, 
          '--story', story.id
        ].concat(constArgs),
        undefined, undefined, false
      ))
    }
    pageProcessors.push(Promise.all(p))

    if (storyProcessorCount >= args.fetchStoriesMax) {
      break
    }
  }
  console.log(`queued ${storyProcessorCount} story processors across ${pageProcessors.length} page processors`)

  await Promise.all(pageProcessors)
  console.log('end autopilot')
}