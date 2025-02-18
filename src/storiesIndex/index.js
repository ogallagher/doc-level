import { StoriesIndex, storiesIndexes } from './storiesIndex.js'
import { LocalStoriesIndex } from './LocalStoriesIndex.js'
import { MunjangStoriesIndex } from './MunjangStoriesIndex.js'
import { PaisStoriesIndex } from './PaisStoriesIndex.js'
import { WashingtonPostStoriesIndex } from './WashingtonPostStoriesIndex.js'
import { NaverBlogStoriesIndex } from './NaverBlogStoriesIndex.js'
import { NuevoDiaStoriesIndex } from './NuevoDiaStoriesIndex.js'
import { ProjectGutenberg } from './ProjectGutenberg.js'
/**
 * @typedef {import('pino').Logger} Logger
 */

/**
 * @type {Logger}
 */
export let logger

/**
 * Init module logger, create stories indexes.
 * 
 * @param {Logger} parentLogger
 * @returns {Promise<undefined>}
 */
export function init(parentLogger) {
  return new Promise((res) => {
    logger = parentLogger.child(
      {
        name: 'stories-index'
      }
    )
    StoriesIndex.init(logger)
    LocalStoriesIndex.init(logger)
    MunjangStoriesIndex.init(logger)
    PaisStoriesIndex.init(logger)
    WashingtonPostStoriesIndex.init(logger)
    NaverBlogStoriesIndex.init(logger)
    NuevoDiaStoriesIndex.init(logger)
    ProjectGutenberg.init(logger)

    // create and register indexes
    if (storiesIndexes.size === 0) {
      new LocalStoriesIndex()

      new MunjangStoriesIndex()
      new PaisStoriesIndex('opinion/columnas')
      new WashingtonPostStoriesIndex('/opinions/columns')
      new NaverBlogStoriesIndex()
      new NuevoDiaStoriesIndex('/noticias')
      new ProjectGutenberg()
    }

    logger.debug('end init')
    res(logger)
  })
}

export function getStoryIndexNames() {
  return [...storiesIndexes.entries()]
  .map(([alias, index]) => (index.hide ? undefined : alias))
  .filter((n) => n !== undefined)
}

/**
 * @param {string} name 
 */
export function getStoriesIndex(name) {
  return storiesIndexes.get(name)
}
