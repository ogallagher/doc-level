import { StorySummary } from './storySummary.js'
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
 * @param {StorySummary} startStory 
 * @param {number} fetchStoriesMax 
 */
export async function autopilot(indexName, pageNumber, startStory, fetchStoriesMax) {
  throw new Error('autopilot not yet implemented')
}