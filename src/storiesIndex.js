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
 * @returns {Promise<undefined>}
 */
export function init(parentLogger) {
  return new Promise((res) => {
    logger = parentLogger.child(
      {
        name: 'stories-index'
      }
    )

    // create and register indexes
    new MunjangStoriesIndex()
    new PaisStoriesIndex('opinion/columnas')
    new WashingtonPostStoriesIndex('/opinions/columns')

    logger.debug('end init')
    res()
  })
}

export function getStoryIndexNames() {
  logger.info('storyIndexNames=%o', [...storiesIndexes.keys()])
  return [...storiesIndexes.keys()]
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
   * @param {string} pageFilename
   */
  constructor(urlTemplate, names, pageNumberMin = 0, pageNumberMax = 50, pageFilename = 'index.html') {
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
    /**
     * Name of index page when downloading to local directory. Includes the extension to indicate file type.
     * @type {string}
     */
    this.pageFilename = pageFilename

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
   * @throws Error for unimplemented abstract method.
   */
  throwErrorNotImplemented() {
    throw new Error('abstract method must be implemented by subclass', {
      cause: 'abstract method'
    })
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
    this.throwErrorNotImplemented()
  }

  /**
   * Parse a list of story summaries from the stories index page content.
   * 
   * @param {any} indexPage Parsed page (ex. `HTMLElement` from html page, or `object` from json page).
   * @returns {Generator<Story>}
   */
  *getStorySummaries(indexPage) {
    this.throwErrorNotImplemented()
  }

  /**
   * Parse the full text of a story from its webpage content.
   * 
   * @param {HTMLElement} storyPage Parsed page.
   * @returns {Generator<string>}
   */
  *getStoryText(storyPage) {
    this.throwErrorNotImplemented()
  }

  toString() {
    return `StoriesIndex[${this.name}=${this.urlTemplate.hostname}]`
  }
}

/**
 * 문장 웹진 문예지 / [단편]소설.
 * 
 * Short stories, publish date ascending, from Munjang lit magazine.
 */
export class MunjangStoriesIndex extends StoriesIndex {
  static SORT_DATE_ASC = 'OLD'
  static SORT_DATE_DESC = 'RECENT'
  static SEARCH_KEY_PAGE = 'nPage'

  static selectorStories = (
    '#contents .board.container > .board_list .list_ul .list_li'
  )
  static selectorStoryUrl = 'a.item[href^="/board.es"][href*="list_no="]'
  static selectorExcerpt = '.txt p.desc'
  static selectorTitleAuthor = '.txt .title'
  static selectorMeta = '.txt .etc_info'
  static selectorMetaDate = '.date span'
  static selectorMetaViews = '.hit span'

  static selectorStoryText = (
    '#contents > section.view_section .detail_cont > .page_group > .page_breaking'
  )
  static selectorTextParagraphs = [
    'p.p1',
    'blockquote',
    'p > span'
  ].join(',')

  constructor() {
    let url = new URL('https://munjang.or.kr/board.es')
    url.searchParams.set('act', 'list')
    url.searchParams.set('bid', '0003')
    // category=소설
    url.searchParams.set('mid', 'a20103000000')
    // sort ascending to prevent different results for same page number
    url.searchParams.set('ord', MunjangStoriesIndex.SORT_DATE_ASC)

    super(
      url.toString(),
      ['문장웹진', 'munjang-webzine', 'munjang'],
      1,
      70
    )
  }

  getPageUrl(pageNumber) {
    this.assertPageNumberIsValid(pageNumber)
    let url = new URL(this.urlTemplate)
    url.searchParams.set(MunjangStoriesIndex.SEARCH_KEY_PAGE, pageNumber)
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
        let author = titleAuthor.substring(0, splitIdx)

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

        if (splitIdx === -1) {
          logger.debug('title=%s does not contain author; get from start of excerpt')
          author = excerpt.substring(0, excerpt.search(/\s/))
        }

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

  /**
   * @param {HTMLElement} storyPage
   * @returns {Generator<string>}
   */
  *getStoryText(storyPage) {
    logger.debug('isolate story text at selector=%s', MunjangStoriesIndex.selectorStoryText)

    const textEl = storyPage.querySelector(MunjangStoriesIndex.selectorStoryText)
    const pgraphsEl = textEl?.querySelectorAll(MunjangStoriesIndex.selectorTextParagraphs)
    if (pgraphsEl === undefined || pgraphsEl.length < 1) {
      throw new Error(`failed to load paragraphs from story page`, {
        cause: {
          textElIsDefined: textEl !== undefined,
          textElSelector: MunjangStoriesIndex.selectorStoryText,
          pgraphsElCount: pgraphsEl.length,
          pgraphsElSelector: MunjangStoriesIndex.selectorTextParagraphs
        }
      })
    }
    logger.info('found %s paragraphs in story text', pgraphsEl.length)

    /**
     * @type {string}
     */
    let pgraph
    for (let [idx, pgraphEl] of pgraphsEl.entries()) {
      pgraph = pgraphEl.textContent
        .replaceAll(/\s+/g, ' ')
        .replaceAll(/[“”]/g, '"')
        .trim()

      try {
        if (pgraph.search(/광고 건너뛰기▶｜\s+/) === -1 && pgraph.length > 1) {
          yield pgraph
        }
        else {
          logger.debug('skip pgraph[%s] = %s...', idx, pgraph.substring(0, 100))
        }
      }
      catch (err) {
        throw new Error(`failed to parse paragraph[${idx}]`, {
          cause: err
        })
      }
    }
  }
}

/**
 * Noticiero El País.
 * 
 * Currently fetches articles chronologically descending, which means content of a given page number will
 * change over time. There is no convenient solution for this currently; try to fetch all article list pages
 * at once, then process them later. If additional pages are needed, move or rename previous pages to pull in 
 * new articles.
 */
export class PaisStoriesIndex extends StoriesIndex {
  static selectorArticles = (
    'body > main article'
  )
  static selectorArticleTitle = 'header .c_t'
  static selectorArticleUrl = `${PaisStoriesIndex.selectorArticleTitle} > a[href*="elpais.com"]`
  static selectorArticleAuthor = '.c_a_a'
  static selectorArticleDatetime = '.c_a_t time'
  static selectorArticleDescription = '.c_d'

  static selectorArticleText = 'body article .a_c[data-dtm-region="articulo_cuerpo"] p'

  /**
   * 
   * @param {string} basePath 
   */
  constructor(basePath) {
    let url = new URL('https://elpais.com/')
    url.pathname = basePath

    super(
      url.toString(),
      ['el-país', 'pais'],
      0,
      300
    )
  }

  getPageUrl(pageNumber) {
    this.assertPageNumberIsValid(pageNumber)
    let url = new URL(this.urlTemplate)
    url.pathname = path.join(url.pathname, pageNumber.toString())
    return url
  }

  /**
   * @param {HTMLElement} indexPage 
   * @returns {Generator<Story>}
   */
  *getStorySummaries(indexPage) {
    logger.debug('isolate list of articles at selector=%s', PaisStoriesIndex.selectorArticles)

    const articlesEl = indexPage.querySelectorAll(PaisStoriesIndex.selectorArticles)
    logger.info('found %s articles in index page', articlesEl.length)

    const wsRegExp = /\s+/g

    for (let [idx, articleEl] of articlesEl.entries()) {
      try {
        const title = articleEl.querySelector(
          PaisStoriesIndex.selectorArticleTitle
        ).textContent.replaceAll(wsRegExp, ' ').trim()
        logger.info('articles[%s] title=%s', idx, title)

        const author = articleEl.querySelector(
          PaisStoriesIndex.selectorArticleAuthor
        ).textContent.replaceAll(wsRegExp, ' ').trim()
        const description = articleEl.querySelector(
          PaisStoriesIndex.selectorArticleDescription
        ).textContent.replaceAll(wsRegExp, ' ').trim()
        const url = new URL(
          articleEl.querySelector(PaisStoriesIndex.selectorArticleUrl).getAttribute('href')
        )

        /**
         * @type {Story}
         */
        const summary = {
          authorName: author,
          title: title,
          publishDate: new Date(
            articleEl.querySelector(PaisStoriesIndex.selectorArticleDatetime).getAttribute('dateTime')
          ),
          viewCount: -1,
          url: url,
          excerpts: [description],
          id: path.basename(url.pathname, '.html')
        }
        logger.debug('articles[%s] summary object=%o', idx, summary)

        yield summary
      }
      catch (err) {
        throw new Error(`failed to parse summary of articles[${idx}]`, {
          cause: err
        })
      }
    }
  }

  /**
   * @param {HTMLElement} storyPage
   * @returns {Generator<string>}
   */
  *getStoryText(storyPage) {
    logger.debug('isolate story text at selector=%s', PaisStoriesIndex.selectorArticleText)

    const pgraphsEl = storyPage.querySelectorAll(PaisStoriesIndex.selectorArticleText)
    if (pgraphsEl.length < 1) {
      throw new Error(`failed to load paragraphs from article page`, {
        cause: {
          pgraphsElSelector: PaisStoriesIndex.selectorArticleText
        }
      })
    }
    logger.info('found %s paragraphs in article text', pgraphsEl.length)

    /**
     * @type {string}
     */
    let pgraph
    for (let pgraphEl of pgraphsEl) {
      pgraph = pgraphEl.textContent
      .replaceAll(/\s+/g, ' ')
      .trim()

      yield pgraph
    }
  }
}

/**
 * Washington Post news site.
 * 
 * Has similar problems as el-pais, where articles are time descending, so the list of articles per page changes
 * over time. Unlike previous 2 indexes, this is implemented using the API that the webpage frontend calls to
 * fetch story data, in JSON format.
 */
export class WashingtonPostStoriesIndex extends StoriesIndex {
  static selectorArticleText = 'body main article .article-body p[data-el="text"]'

  /**
   * @param {string} basePath
   */
  constructor(basePath) {
    let url = new URL('https://www.washingtonpost.com/prism/api/prism-query')
    url.searchParams.set('_website', 'washpost')

    super(
      url.toString(),
      ['washington-post', 'washpost'],
      0,
      300,
      'index-prism-api.json'
    )

    /**
     * Count of articles per page. Multiply page number by this to get offset.
     * @type {number}
     */
    this.pageArticleCount = 50

    /**
     * @type {{
    *  query: string,
    *  limit: number,
    *  offset: number
    * }}
    */
   this.prismQuery = {
     query: ['prism://prism.query/site', basePath].join(','),
     // articles per page
     limit: this.pageArticleCount,
     // page number
     offset: 0
   }
  }

  getPageUrl(pageNumber) {
    this.assertPageNumberIsValid(pageNumber)
    let url = new URL(this.urlTemplate)

    this.prismQuery.offset = pageNumber * this.pageArticleCount
    url.searchParams.set('query', JSON.stringify(this.prismQuery))
    return url
  }

  /**
   * @param {{items: {
  *  _id: string,
  *  canonical_url: string,
  *  comments: {
  *   ai_prompt: {content: string} 
  *  }[]
  *  description: {basic: string},
  *  first_publish_date: string,
  *  headlines: {
  *    basic: string,
  *    url: string
  *  },
  *  language: string,
  *  last_updated_date: string,
  *  subheadlines: {basic: string},
  *  tracking: {
  *    author: string,
  *    author_name: string,
  *    content_id: string,
  *    in_url_headline: string
  *  }
  * }[]}} indexPage 
  * @returns {Generator<Story>}
  */
  *getStorySummaries(indexPage) {
    logger.debug('found %s articles in index page', indexPage.items.length)

    for (let [idx, article] of indexPage.items.entries()) {
      try {
        /**
         * @type {Story}
         */
        const summary = {
          // tracking.author = display name
          // tracking.author_name = lowercase full name
          authorName: article.tracking.author,
          title: article.headlines.basic,
          publishDate: new Date(article.first_publish_date),
          viewCount: -1,
          url: article.canonical_url,
          excerpts: [
            article.description.basic,
            article.comments?.ai_prompt?.content
          ].filter((c) => c !== undefined),
          // tracking.in_url_headline = hyphenated human readable summary
          // tracking.content_id = generated unique id string
          id: `${article.tracking.in_url_headline}_${article.tracking.content_id}`
        }
        logger.debug('articles[%s] summary object=%o', idx, summary)

        yield summary
      }
      catch (err) {
        throw new Error(`failed to parse summary of articles[${idx}]`, {cause: err})
      }
    }
  }

  /**
   * @param {HTMLElement} storyPage
   * @returns {Generator<string>}
   */
  *getStoryText(storyPage) {
    logger.debug('isolate story text at selector=%s', WashingtonPostStoriesIndex.selectorArticleText)

    const pgraphsEl = storyPage.querySelectorAll(WashingtonPostStoriesIndex.selectorArticleText)
    if (pgraphsEl.length < 1) {
      throw new Error(`failed to load paragraphs from article page`, {
        cause: {
          pgraphsElSelector: WashingtonPostStoriesIndex.selectorArticleText
        }
      })
    }
    logger.info('found %s paragraphs in article text', pgraphsEl.length)

    /**
     * @type {string}
     */
    let pgraph
    for (let pgraphEl of pgraphsEl) {
      pgraph = pgraphEl.textContent
      .replaceAll(/\s+/g, ' ')
      .trim()
      
      yield pgraph
    }
  }
}