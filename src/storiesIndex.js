/**
 * @typedef {import('pino').Logger} Logger
 */

/**
 * @type {Logger}
 */
let logger

/**
 * Registered `StoriesIndex` instances.
 * @type {Map<string, StoriesIndex>}
 */
const storiesIndexes = new Map()

/**
 * Init module logger, create stories indexes.
 * 
 * @param {Logger} parentLogger
 * @returns {Promise<Map<string, StoriesIndex>>}
 */
export function init(parentLogger) {
  return new Promise(function(res) {
    logger = parentLogger.child(
      {
        name: 'stories-index'
      }
    )

    // create and register indexes
    new MunjangStoriesIndex()
    
    logger.debug('end init')
    res(Array.from(storiesIndexes.keys()))
  })
}

/**
 * @param {string} name 
 */
export function getStoriesIndex(name) {
    return storiesIndexes.get(name)
}

export class StoriesIndex {
    /**
     * 
     * @param {string} urlTemplate 
     * @param {string[]} name 
     * @param {number} pageNumberMin 
     * @param {number} pageNumberMax 
     */
    constructor(urlTemplate, names, pageNumberMin=0, pageNumberMax=50) {
        /**
         * @type {URL}
         */
        this.urlTemplate = new URL(urlTemplate)
        /**
         * @type {string}
         */
        this.name = names[0]
        /**
         * @type {number}
         */
        this.pageNumberMin = pageNumberMin
        /**
         * @type {number}
         */
        this.pageNumberMax = pageNumberMax

        names.map((alias) => {
            storiesIndexes.set(alias, this)
        })
    }

    assertPageNumberIsValid(pageNumber) {
        if (pageNumber < this.pageNumberMin || pageNumber > this.pageNumberMax) {
            throw new ReferenceError(
                `pageNumber=${pageNumber} is out of bounds [${this.pageNumberMin}, ${this.pageNumberMax}] `
                + `for ${this}`
            )
        }
    }

    /**
     * Return the compiled url to the given page of listed stories within the index.
     * 
     * @param {number} pageNumber 
     * @throws {ReferenceError} `pageNumber` is not valid.
     * @returns {URL}
     */
    getPageUrl(pageNumber) {
        this.assertPageNumberIsValid(pageNumber)
        let err = new Error('abstract method must be implemented by subclass', {
            cause: 'abstract method'
        })
        throw err
    }

    toString() {
        return `StoriesIndex[${this.name}=${this.urlTemplate.hostname}]`
    }
}

export class MunjangStoriesIndex extends StoriesIndex {
    constructor() {
        super(
            'https://munjang.or.kr/board.es?mid=a20103000000&bid=0003&act=list&ord=RECENT&nPage=1',
            ['문장웹진', 'munjang-webzine'],
            1,
            70
        )
    }
  
    getPageUrl(pageNumber) {
        this.assertPageNumberIsValid(pageNumber)
        let url = new URL(this.urlTemplate)
        url.searchParams.set('nPage', pageNumber)
        return url
    }
  }
