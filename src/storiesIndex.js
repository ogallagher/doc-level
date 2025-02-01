import * as path from 'path'
/**
 * @typedef {import('pino').Logger} Logger
 * 
 * @typedef {import('./messageSchema.js').Story} Story
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

    /**
     * Parse a list of story summaries from the stories index page content.
     * 
     * @param {HTMLElement} indexPage Parsed page. Note this will actually be a subset of the `HTMLElement`
     * interface depending on the chosen html parser implementation and it being read-only.
     * @returns {Generator<Story>}
     */
    *getStorySummaries(indexPage) {
        throw new Error('abstract method must be implemented by subclass', {
            cause: 'abstract method'
        })
    }

    toString() {
        return `StoriesIndex[${this.name}=${this.urlTemplate.hostname}]`
    }
}

export class MunjangStoriesIndex extends StoriesIndex {
    static selectorStories = (
        '#contents .board.container > .board_list .list_ul .list_li'
    )
    static selectorStoryUrl = 'a.item[href^="/board.es"][href*="list_no="]'
    static selectorExcerpt = '.txt p.desc'
    static selectorTitleAuthor = '.txt .title'
    static selectorMeta = '.txt .etc_info'
    static selectorMetaDate = '.date span'
    static selectorMetaViews = '.hit span'

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

    /**
     * @param {HTMLElement} indexPage 
     * @returns {Generator<Story>}
     */
    *getStorySummaries(indexPage) {
        logger.debug('isolate list of stories at selector=%s', MunjangStoriesIndex.selectorStories)

        const storiesEl = indexPage.querySelectorAll(MunjangStoriesIndex.selectorStories)
        logger.info('found %s stories in index page', storiesEl.length)

        for (let [idx, storyEl] of storiesEl.entries()) {
            try {
                const titleAuthor = storyEl.querySelector(MunjangStoriesIndex.selectorTitleAuthor).textContent
                logger.info('stories[%s] title-author=%s', idx, titleAuthor)

                const splitIdx = titleAuthor.indexOf('-')
                const author = titleAuthor.substring(0, splitIdx)
                const title = titleAuthor.substring(splitIdx + 1)
                logger.debug('stories[%s] title.raw=%s author.raw=%s', idx, title, author)

                const meta = storyEl.querySelector(MunjangStoriesIndex.selectorMeta)
                const excerpt = storyEl.querySelector(
                    MunjangStoriesIndex.selectorExcerpt
                ).textContent
                .replace(/&lsquo.+&rsquo;\s+/, '')
                .replace(/광고 건너뛰기▶｜\s+/, '')
                .replaceAll(/[\r\n]+\s+/g, ' ')
                .trim()

                const url = new URL(path.join(
                    this.urlTemplate.origin,
                    storyEl.querySelector(MunjangStoriesIndex.selectorStoryUrl).getAttribute('href')
                ))
                
                /**
                 * @type {Story}
                 */
                let storySummary = {
                    authorName: author.trim(),
                    title: title.trim(),
                    publishDate: new Date(meta.querySelector(MunjangStoriesIndex.selectorMetaDate).textContent),
                    viewCount: parseInt(meta.querySelector(MunjangStoriesIndex.selectorMetaViews).textContent),
                    // concatenate origin (root without path) and story path
                    url: url,
                    excerpts: [
                        excerpt
                    ],
                    id: url.searchParams.get('list_no')
                }
                logger.debug('stories[%s] summary object=%o', idx, storySummary)

                yield storySummary
            }
            catch (err) {
                throw new Error(`failed to parse summary of stories[${idx}]`, {
                    cause: err
                })
            }
        }
    }
  }
