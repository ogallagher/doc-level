import { writeFile } from 'fs/promises'
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
  return new Promise(function(res) {
    logger = parentLogger.child(
      {
        name: 'writer'
      }
    )
    
    logger.debug('end init')
    res()
  })
}

export function writeText(text, path) {
    return new Promise(function(res, rej) {
        writeFile(path, text, {encoding: 'utf-8'})
        .then(
          () => {
            logger.info('write text to %s passed', path)
            res()
          },
          (err) => {
            logger.error('write text to %s failed', path)
            rej(err)
          }
        )
    })
}
