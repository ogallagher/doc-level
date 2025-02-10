import * as path from 'path'
import { RelationalTag } from 'relational_tags'
import { LibraryDescriptor } from './libraryDescriptor.js'
import { StorySummary } from './storySummary.js'
import { IndexPage } from './indexPage.js'
import { getTextTag, TYPE_TO_TAG_CHILD } from './library.js'
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
    if (storiesIndexes.size === 0) {
      new MunjangStoriesIndex()
      new PaisStoriesIndex('opinion/columnas')
      new WashingtonPostStoriesIndex('/opinions/columns')
      new NaverBlogStoriesIndex()
      new NuevoDiaStoriesIndex('/noticias')
      new ProjectGutenberg()
    }

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

export class StoriesIndex extends LibraryDescriptor {
  static t = RelationalTag.new('stories-index')
  static tUrlTemplate = RelationalTag.new('url-template')
  static tName = RelationalTag.new('index-name')

  /**
   * 
   * @param {string} urlTemplate 
   * @param {string[]} names 
   * @param {number} pageNumberMin 
   * @param {number} pageNumberMax 
   * @param {string} pageFilename
   * @param {any} pageRequestHeaders
   */
  constructor(
    urlTemplate, names, 
    pageNumberMin = 0, pageNumberMax = 50, 
    pageFilename = 'index.html',
    pageRequestHeaders = undefined,
    storyFileExt = '.html'
  ) {
    super()
    
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
    /**
     * HTTP request headers when fetching an index/listing page.
     */
    this.pageRequestHeaders = pageRequestHeaders
    /**
     * File extension of a story page, indicating the file type.
     */
    this.storyFileExt = storyFileExt

    // define tags early so that aliases are also defined
    this.setTags()

    names.forEach((alias) => {
      if (!storiesIndexes.has(alias)) {
        storiesIndexes.set(alias, this)
      }
      else {
        logger.warn(
          'story index alias %s already registered as %o; do not overwrite', 
          alias, 
          storiesIndexes.get(alias)
        )
      }
      RelationalTag.alias(StoriesIndex.getNameTag(this.name), alias)
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
   * @returns {Generator<StorySummary>}
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

  static initTags() {
    this.adoptTag(this.tUrlTemplate)
    this.adoptTag(this.tName)

    this.adoptTag(IndexPage.t)
  }

  /**
   * Ensures all objects tagged with StoryIndex names follow the same format.
   * 
   * @param {string} name 
   * @returns {RelationalTag}
   */
  static getNameTag(name) {
    return RelationalTag.get(name)
  }

  setTags() {
    let tuh = RelationalTag.get(this.urlTemplate.hostname)
    StoriesIndex.tUrlTemplate.connect_to(tuh, TYPE_TO_TAG_CHILD)
    tuh.connect_to(this)

    let tn = StoriesIndex.getNameTag(this.name)
    StoriesIndex.tName.connect_to(tn, TYPE_TO_TAG_CHILD)
    tn.connect_to(this)
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
      ['문장웹진', 'mj'],
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
   * @returns {Generator<StorySummary>}
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
         * @type {StorySummary}
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

        yield StorySummary.fromData(storySummary)
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
   * @returns {Generator<StorySummary>}
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
         * @type {StorySummary}
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

        yield StorySummary.fromData(summary)
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
  * @returns {Generator<StorySummary>}
  */
  *getStorySummaries(indexPage) {
    logger.debug('found %s articles in index page', indexPage.items.length)

    for (let [idx, article] of indexPage.items.entries()) {
      try {
        /**
         * @type {StorySummary}
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

        yield StorySummary.fromData(summary)
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

/**
 * 네이버 블로그.
 * 
 * Lists most popular and recent descending. The static page does not have any articles, so we have to call the
 * underlying api endpoints to fetch article info. The contained articles vary widely between calls, even for the
 * same page, with the same session cookie, within a few seconds of the previous call. 
 * Regardless of this additional variability, the content of a given page will change as new posts are available.
 */
export class NaverBlogStoriesIndex extends StoriesIndex {
  static SEARCH_KEY_CATEGORY = 'directoryNo'
  static SEARCH_KEY_PAGE = 'currentPage'

  static selectorPostText = 'body #body #whole-body #post-area #postListBody .post-body'
  static selectorTextTitle = '.se-documentTitle .se-text-paragraph'
  static selectorTextBody = '.se-main-container .se-text .se-text-paragraph'

  constructor() {
    let url = new URL('https://section.blog.naver.com/ajax/DirectoryPostList.naver?directorySeq=0')
    url.searchParams.set(NaverBlogStoriesIndex.SEARCH_KEY_CATEGORY, 0)

    super(
      url.toString(),
      ['네이버-블로그', 'navblog'],
      1,
      300,
      'index-naver-api.json',
      {
        'referer': 'https://section.blog.naver.com/ThemePost.naver'
      }
    )
  }

  getPageUrl(pageNumber) {
    this.assertPageNumberIsValid(pageNumber)
    let url = new URL(this.urlTemplate)

    url.searchParams.set(NaverBlogStoriesIndex.SEARCH_KEY_PAGE, pageNumber)
    return url
  }

  /**
   * @param {{result: {
   *  totalCount: number,
   *  postList: {
   *    domainIdOrBlogId: string,
   *    nickname: string,
   *    logNo: number,
   *    title: string,
   *    postUrl: string,
   *    briefContents: string,
   *    sympathyCnt: number,
   *    addDate: number,
   *    sympathyEnable: boolean
   *  }[]
   * }}} indexPage
   * @returns {Generator<StorySummary>}
   */
  *getStorySummaries(indexPage) {
    logger.debug('found %s posts in index page', indexPage.result.postList.length)

    for (let [idx, post] of indexPage.result.postList.entries()) {
      try {
        // convert container to child/iframe url
        let containerUrl = new URL(post.postUrl)
        let childUrl = new URL(containerUrl.origin)
        childUrl.pathname = '/PostView.naver'
        childUrl.searchParams.set('redirect', 'Dlog')
        childUrl.searchParams.set('widgetTypeCall', true)
        childUrl.searchParams.set('noTrackingCode', true)
        childUrl.searchParams.set('directAccess', false)
        childUrl.searchParams.set('blogId', post.domainIdOrBlogId)
        childUrl.searchParams.set('logNo', post.logNo)

        /**
         * @type {StorySummary}
         */
        const summary = {
          authorName: post.nickname,
          title: post.title,
          // convert epoch ts to date
          publishDate: new Date(post.addDate),
          // use reaction count instead of unavailable views
          viewCount: (post.sympathyEnable ? post.sympathyCnt : -1),
          url: childUrl.toString(),
          excerpts: [
            post.briefContents
          ],
          id: `${post.domainIdOrBlogId}_${post.logNo}`
        }
        logger.debug('posts[%s] summary object=%o', idx, summary)

        yield StorySummary.fromData(summary)
      }
      catch (err) {
        throw new Error(`failed to parse summary of posts[${idx}]`, {cause: err})
      }
    }
  }

  /**
   * @param {HTMLElement} storyPage
   * @returns {Generator<string>}
   */
  *getStoryText(storyPage) {
    logger.debug('isolate post text at selector=%s', NaverBlogStoriesIndex.selectorPostText)

    const postEl = storyPage.querySelector(NaverBlogStoriesIndex.selectorPostText)
    const pgraphsEl = postEl?.querySelectorAll(NaverBlogStoriesIndex.selectorTextBody)
    if (pgraphsEl === undefined || pgraphsEl.length < 1) {
      throw new Error(`failed to load paragraphs from post page`, {
        cause: {
          postElSelector: NaverBlogStoriesIndex.selectorPostText,
          pgraphsElSelector: NaverBlogStoriesIndex.selectorTextBody,
          postElIsDefined: postEl !== null,
          pgraphsElIsDefined: false
        }
      })
    }
    logger.info('found %s paragraphs in post text', pgraphsEl.length)

    /**
     * @type {string}
     */
    let pgraph
    for (let pgraphEl of pgraphsEl) {
      pgraph = pgraphEl.textContent
      .replaceAll(/\s+/g, ' ')
      .trim()

      if (pgraph.length > 1) {
        yield pgraph
      }
    }
  }
}

/**
 * Noticiero El Nuevo Día. Lists recent descending as a single endless page. Call the underlying articles
 * api endpoint to fetch each page.
 */
export class NuevoDiaStoriesIndex extends StoriesIndex {
  static SEARCH_KEY_QUERY = 'query'
  /**
   * Fetch opinon articles. Access is generally restricted.
   */
  static ENDPOINT_OPINION = 'latest-articles-opinion-by-subsection-v1'
  /**
   * Fetch news articles ordered publish date descending. Access is generally open.
   */
  static ENDPOINT_NOTICIAS = 'latest-articles-section-v1'

  static RESTRICTION_STANDARD = 'standard'
  static RESTRICTION_PREMIUM = 'premium'
  
  static ARTICLE_MAX = 1000

  static selectorArticleTitle = 'body .primary-stage .article-headline'
  static selectorTitleHeadlines = '.article-headline__title, .article-headline__subheadline'
  static selectorArticleText = 'body .primary-stage .content-elements p.content-element'

  /**
   * 
   * @param {string} basePath 
   * @param {number} pageArticleCount 
   */
  constructor(basePath, pageArticleCount=20) {
    let refererUrl = new URL('https://www.elnuevodia.com')
    refererUrl.pathname = basePath

    // first part of basePath
    let section = basePath.split('/').filter((p) => p.length > 0)[0]
    /**
     * @type {string}
     */
    let apiEndpoint
    if (section === 'noticias') {
      apiEndpoint = NuevoDiaStoriesIndex.ENDPOINT_NOTICIAS
    }
    else if (section === 'opinion') {
      apiEndpoint = NuevoDiaStoriesIndex.ENDPOINT_OPINION
    }
    else {
      throw new Error(`basePath references unsupported section=${section}`)
    }

    let apiUrl = new URL('https://www.elnuevodia.com')
    apiUrl.pathname = `/pf/api/v3/content/fetch/${apiEndpoint}`
    apiUrl.searchParams.set('d', '187')
    apiUrl.searchParams.set('mxId', '00000000')
    apiUrl.searchParams.set('_website', 'el-nuevo-dia')

    super(
      apiUrl.toString(),
      ['nuevo-dia', 'ndia'],
      0, 
      NuevoDiaStoriesIndex.ARTICLE_MAX / pageArticleCount,
      `${apiEndpoint}.json`,
      {
        'referer': refererUrl.toString()
      }
    )

    /**
     * Articles per page/api call.
     * 
     * @type {number}
     */
    this.pageArticleCount = pageArticleCount

    /**
     * @type {{
     *  uri: string,
     *  website: string,
     *  size: number,
     *  from: number,
     *  arc-site: string
     * }}
     */
    this.pfApiQuery = {
      uri: basePath,
      sectionId: basePath,
      website: 'el-nuevo-dia',
      size: pageArticleCount,
      from: 0,
      'arc-site': 'el-nuevo-dia'
    }
  }

  getPageUrl(pageNumber) {
    this.assertPageNumberIsValid(pageNumber)
    let url = new URL(this.urlTemplate)

    this.pfApiQuery.from = pageNumber * this.pageArticleCount
    url.searchParams.set(
      NuevoDiaStoriesIndex.SEARCH_KEY_QUERY, JSON.stringify(this.pfApiQuery)
    )
    return url
  }

  /**
   * @typedef {{
   *    id: string,
   *    byline: string,
   *    biography: string,
   *    link: string
   *  }} NuevoDiaAuthor
   * 
   * @typedef {{
   *    id: string,
   *    headline: string,
   *    subheadline: string,
   *    displayDate: string,
   *    canonicalUrl: string,
   *    contentRestriction: string,
   *    authors?: NuevoDiaAuthor[]
   *  }} NuevoDiaArticle
   */
  /**
   * 
   * @param {NuevoDiaArticle} article 
   * @param {NuevoDiaAuthor} author 
   * @returns {StorySummary|undefined}
   */
  getStorySummary(article, author) {
    if (article.contentRestriction === NuevoDiaStoriesIndex.RESTRICTION_PREMIUM) {
      logger.info('skip restricted article "%s"', article.headline)
      return undefined
    }

    let url = new URL(this.urlTemplate)
    url.search = ''
    url.pathname = article.canonicalUrl

    return StorySummary.fromData({
      authorName: author.byline,
      title: article.headline,
      publishDate: new Date(article.displayDate),
      viewCount: -1,
      url: url.toString(),
      excerpts: [
        article.subheadline
      ],
      id: `${author.id}_${article.id}`
    })
  }

  /**
   * @param {{
   *  groups?: {
   *    author: NuevoDiaAuthor,
   *    articles: NuevoDiaArticle[]
   *  }[],
   *  articles?: NuevoDiaArticle[]
   * }} indexPage
   * @returns {Generator<StorySummary>}
   */
  *getStorySummaries(indexPage) {
    let groups = indexPage.groups
    
    if (groups !== undefined) {
      logger.debug('found %s groups in index page', groups.length)

      for (let [g_idx, group] of indexPage.groups.entries()) {
        for (let [a_idx, article] of group.articles.entries()) {
          try {
            const summary = this.getStorySummary(article, group.author)
            if (summary !== undefined) {
              logger.debug('groups[%s].articles[%s] summary object=%0', g_idx, a_idx, summary)
              yield summary
            }
          }
          catch (err) {
            throw new Error(`failed to parse summary of groups[${g_idx}].articles[${a_idx}]`, {cause: err})
          }
        }
      }
    }
    else {
      let articles = indexPage.articles
      logger.debug('found %s articles in index page', articles.length)

      for (let [a_idx, article] of articles.entries()) {
        try {
          const summary = this.getStorySummary(article, article.authors[0])
          if (summary !== undefined) {
            logger.debug('articles[%s] summary object=%0', a_idx, summary)
            yield summary
          }
        }
        catch (err) {
          throw new Error(`failed to parse summary of articles[${a_idx}]`, {cause: err})
        }
      }
    }
  }

  /**
   * @param {HTMLElement} storyPage
   * @returns {Generator<string>}
   */
  *getStoryText(storyPage) {
    logger.debug(
      'isolate article text at selectors=[%s, %s]', 
      NuevoDiaStoriesIndex.selectorArticleTitle, NuevoDiaStoriesIndex.selectorArticleText
    )

    function filterText(text) {
      return text.replaceAll(/\s+/g, ' ').trim()
    }

    const titlesEl = storyPage.querySelector(NuevoDiaStoriesIndex.selectorArticleTitle)
    const headlinesEl = titlesEl?.querySelectorAll(NuevoDiaStoriesIndex.selectorTitleHeadlines)
    if (headlinesEl === undefined || headlinesEl.length < 1) {
      logger.warning(
        'unable to find headlines to include in story text at %s', 
        NuevoDiaStoriesIndex.selectorTitleHeadlines
      )
    }
    else {
      for (let h of headlinesEl) {
        yield filterText(h.textContent)
      }
    }

    const pgraphsEl = storyPage.querySelectorAll(NuevoDiaStoriesIndex.selectorArticleText)
    if (pgraphsEl.length < 1) {
      throw new Error(`failed to load paragraphs from article page`, {
        cause: {
          pgraphsSelector: NuevoDiaStoriesIndex.selectorArticleText
        }
      })
    }

    for (let pgraphEl of pgraphsEl) {
      yield filterText(pgraphEl.textContent)
    }
  }
}

/**
 * Project Gutenberg online library of public domain literature.
 * 
 * Index page url, alphabetical by title
 *  https://www.gutenberg.org/browse/titles/<letter>
 *  https://www.gutenberg.org/browse/titles/other
 * 
 * Book page url
 *  https://www.gutenberg.org/ebooks/<integer-id>
 * 
 * Book page will have links to various versions/formats. We use plain-text.
 *  https://www.gutenberg.org/ebooks/<integer-id>.txt.utf-8
 */
export class ProjectGutenberg extends StoriesIndex {
  static PATH_BROWSE_TITLE = '/browse/titles'
  static PATH_BROWSE_AUTHOR = '/browse/authors'
  static PATH_BOOK = '/ebooks'

  static alphabetPrefixes = ['other']
  static {
    for (let l='z'.codePointAt(0); l>='a'.codePointAt(0); l--) {
      this.alphabetPrefixes.push(String.fromCharCode(l))
    }
  }

  static selectorBookLink = `.pgdbbytitle a[href^="${this.PATH_BOOK}"]`
  static selectorAuthorLink = `.pgdbbytitle a[href^="${this.PATH_BROWSE_AUTHOR}"]`
  static selectorAudiobookIndicator = 'img[title="Audio Book"]'

  constructor() {
    super(
      'https://www.gutenberg.org',
      ['gutenberg', 'gutb'],
      1,
      ProjectGutenberg.alphabetPrefixes.length,
      undefined,
      undefined,
      '.txt'
    )
  }

  getPageUrl(pageNumber) {
    this.assertPageNumberIsValid(pageNumber)
    let url = new URL(this.urlTemplate)
    url.pathname = path.join(
      ProjectGutenberg.PATH_BROWSE_TITLE, 
      ProjectGutenberg.alphabetPrefixes[pageNumber-1]
    )

    return url
  }

  /**
   * 
   * @param {HTMLElement} indexPage 
   * @returns {Generator<StorySummary>}
   */
  *getStorySummaries(indexPage) {
    let bookLinks = indexPage.querySelectorAll(ProjectGutenberg.selectorBookLink)
    let bookAuthors = indexPage.querySelectorAll(ProjectGutenberg.selectorAuthorLink)

    logger.info('found %s books in index page', bookLinks.length)
    /**
     * @type {StorySummary}
     */
    let prevSummary
    for (let b_idx=0; b_idx<bookLinks.length; b_idx++) {
      try {
        let audiobookIndicator = bookLinks[b_idx].parentNode.querySelector(
          ProjectGutenberg.selectorAudiobookIndicator
        )
        if (audiobookIndicator !== null) {
          logger.info('skip audiobook "%s"', bookLinks[b_idx].textContent)
          continue
        }
        
        let url = new URL(this.urlTemplate)
        url.pathname = bookLinks[b_idx].getAttribute('href')
  
        const summary = StorySummary.fromData({
          authorName: bookAuthors[b_idx].textContent,
          title: bookLinks[b_idx].textContent,
          publishDate: null,
          viewCount: -1,
          url: url.toString() + '.txt.utf-8',
          excerpts: [],
          id: path.parse(url.pathname).name
        })

        if (summary.id !== prevSummary?.id) {
          prevSummary = summary
          yield summary
        }
        else {
          logger.info(
            'skip duplicate book entry title=%s author=', summary.title, summary.authorName
          )
        }
      }
      catch (err) {
        throw new Error(`failed to parse books[${b_idx}]`, {
          cause: {
            bookLink: bookLinks[b_idx].getAttribute('href'),
            bookAuthor: bookAuthors[b_idx].textContent,
            book: bookLinks[b_idx].parentNode
          }
        })
      }
    }
  }

  /**
   * @param {string} storyPage
   * @returns {Generator<string>}
   */
  *getStoryText(storyPage) {
    // skip project gutenberg intro
    let startMatch = storyPage.match(/\*{3}.+\*{3}[\n\r]*/)

    const pgraphs = storyPage
    .substring(startMatch.index + startMatch[0].length)
    .split(/\n{2,}/)

    for (let pgraph of pgraphs) {
       let p = pgraph.trim()
       if (p.length > 0) {
        yield p
       }
    }
  }
}