import { StorySummary } from './storySummary.js'
import { getStoriesIndex } from './storiesIndex.js'
import { IndexPage } from './indexPage.js'
import { main } from './main.js'
import { listStoryIndexPages, loadStories } from './reader.js'
import { OPT_VAR_PREFIX } from './config.js'
/**
 * @typedef {import('pino').Logger} Logger
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
 * Implementation of `--autopilot` option to call `main` multiple times for processing multiple
 * stories in sequence without pausing for user input.
 * 
 * @param {string} indexName 
 * @param {number} pageNumber
 * @param {number} storyArrayIndex 
 * @param {number} fetchStoriesMax 
 * @param {string} storiesDir
 * @param {boolean} forceProfile 
 */
export async function autopilot(
  indexName, pageNumber, storyArrayIndex, fetchStoriesMax, storiesDir, forceProfile
) {
  logger.info('begin autopilot at index=%s page=s story=@%s', indexName, pageNumber, storyArrayIndex)

  // fetch pages of story summaries
  await main(
    [
      '--fetch-stories-index', indexName,
      '--fetch-stories-max', fetchStoriesMax
    ],
    undefined, undefined, false
  )
  console.log(`fetched pages of ${fetchStoriesMax} story summaries`)

  /**
   * @type {Map<number, IndexPage>}
   */
  const indexPages = (await listStoryIndexPages(storiesDir, indexName)).get(indexName)

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
    if (storyProcessorCount + stories.length > fetchStoriesMax) {
      stories = stories.slice(0, fetchStoriesMax - storyProcessorCount)
    }
    logger.info('process %s stories from page %o', stories.length, ip)
    storyProcessorCount += stories.length

    let p = []
    for (let story of stories) {
      p.push(main(
        [
          '--index', indexName, 
          '--page', pn, 
          '--story', story.id
        ].concat(
          forceProfile ? ['--force-profile'] : []
        ),
        undefined, undefined, false
      ))
    }
    pageProcessors.push(Promise.all(p))

    if (storyProcessorCount >= fetchStoriesMax) {
      break
    }
  }
  console.log(`queued ${storyProcessorCount} story processors across ${pageProcessors.length} page processors`)

  await Promise.all(pageProcessors)
  console.log('end autopilot')
}