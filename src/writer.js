import { 
  writeFile, 
  access as fsAccess, 
  constants as fsConstants,
  mkdir,
  open
} from 'fs/promises'
import { createWriteStream } from 'fs'
import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
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
  return fsAccess(path, fsConstants.F_OK)
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
  .catch((err) => {
    throw new Error(`failed to create dir ${path}`, {
      cause: err
    })
  })
}

/**
 * Download webpage content from url.
 * 
 * @param {URL} url 
 * @param {string} localPath 
 * @param {boolean} skipIfFileExists
 * @returns {Promise<string>} Path to downloaded file.
 */
export function downloadWebpage(url, localPath, skipIfFileExists=true) {
  return new Promise(function(res, rej) {
    fileExists(localPath)
    .then(
      (exists) => {
        if (exists) {
          if (skipIfFileExists) {
            logger.info('local-path=%s already exists for url=%s; skip download', localPath, url)
          }
          return false
        }
        else {
          logger.debug('local-path=%s does not yet exist for url=%s', localPath, url)
          return true
        }
      }
    )
    .then((doDownload) => {
      if (doDownload) {
        return axios.get(url, {
          // mimic headers used in a browser for more restricted endpoints
          headers: {
            'accept': '*/*',
            'accept-encoding': 'gzip,deflate,br',
            'cache-control': 'max-age=0',
            'connection': 'keep-alive',
            'host': url.hostname,
            'postman-token': uuidv4(),
            'set-ch-ua-platform': 'Unknown',
            'sec-fetch-mode': 'navigate',
            // chrome-windows
            'user-agent': [
              'Mozilla/5.0',
              '(Windows NT 10.0; WOW64)',
              'AppleWebKit/537.36',
              '(KHTML, like Gecko)',
              'Chrome/132.0.0.0',
              'Safari/537.36'
            ].join(' '),
          },
          responseType: 'stream'
        })
        .then(
          (response) => {
            logger.debug('http get %s statusText=%s', url, response.statusText)
            response.data.pipe(
              createWriteStream(localPath)
              .on('error', rej)
              .on('close', () => {
                res(localPath)
              })
            )
          },
          rej
        )
      }
      else {
        res(localPath)
      }
    })
  })
}

export async function fileExists(path) {
  return fsAccess(path, fsConstants.F_OK).then(
    () => true,
    () => false
  )
}
