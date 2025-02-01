import { 
  writeFile, 
  access as fsAccess, 
  constants as fsConstants,
  mkdir,
  appendFile,
  open
} from 'fs/promises'
import { createWriteStream } from 'fs'
import request from 'request'
/**
 * @typedef {import('pino').Logger} Logger
 * 
 * @typedef {import('fs/promises').FileHandle} FileHandle
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

/**
 * Write file content to local filesystem.
 * 
 * @param {string} text 
 * @param {string|FileHandle} path
 * @returns {Promise<undefined>}
 */
export function writeText(text, path) {
    return new Promise(function(res, rej) {
      writeFile(path, text, {encoding: 'utf-8'})
      .then(
        () => {
          logger.trace('write text len=%s to %o passed', text.length, path)
          res()
        },
        (err) => {
          logger.error('write text len=%s to %o failed'.replace, text.length, path)
          rej(err)
        }
      )
    })
}

/**
 * 
 * @param {string} path 
 * @returns {Promise<FileHandle>}
 */
export function openFile(path) {
  return open(path, 'w')
}

export function initDir(path) {
  return new Promise(function(res, rej) {
    fsAccess(path, fsConstants.F_OK)
    .then(
      () => {
        logger.debug('dir %s already exists', path)
      },
      () => {
        logger.info('create dir %s', path)
        return mkdir(path, {
          recursive: true
        })
      }
    )
    .then(
      res,
      (err) => {
        logger.error('failed to create dir %s', path)
        rej(err)
      }
    )
  })
}

/**
 * Download webpage content from url.
 * 
 * @param {URL} url 
 * @param {string} localPath 
 * @param {boolean} skipIfFileExists
 * @returns {string} Path to downloaded file.
 */
export function downloadWebpage(url, localPath, skipIfFileExists=true) {
  return new Promise(function(res, rej) {
    fsAccess(localPath, fsConstants.F_OK)
    .then(
      () => {
        if (skipIfFileExists) {
          logger.info('local-path=%s already exists for url=%s; skip download', localPath, url)
          return false
        }
        else {
          return true
        }
      },
      () => {
        logger.debug('local-path=%s does not yet exist for url=%s', localPath, url)
        return true
      }
    )
    .then((doDownload) => {
      if (doDownload) {
        request.get(url.toString())
        .pipe(
          createWriteStream(localPath)
          .on('error', rej)
          .on('close', () => {
            res(localPath)
          })
        )
      }
      else {
        res(localPath)
      }
    })
  })
}
