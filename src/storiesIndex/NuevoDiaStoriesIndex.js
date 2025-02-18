import { StorySummary } from '../storySummary.js'
import { StoriesIndex } from './storiesIndex.js'

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
  constructor(basePath, pageArticleCount = 20) {
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
      NuevoDiaStoriesIndex.logger.info('skip restricted article "%s"', article.headline)
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
      NuevoDiaStoriesIndex.logger.debug('found %s groups in index page', groups.length)

      for (let [g_idx, group] of indexPage.groups.entries()) {
        for (let [a_idx, article] of group.articles.entries()) {
          try {
            const summary = this.getStorySummary(article, group.author)
            if (summary !== undefined) {
              NuevoDiaStoriesIndex.logger.debug('groups[%s].articles[%s] summary object=%0', g_idx, a_idx, summary)
              yield summary
            }
          }
          catch (err) {
            throw new Error(`failed to parse summary of groups[${g_idx}].articles[${a_idx}]`, { cause: err })
          }
        }
      }
    }
    else {
      let articles = indexPage.articles
      NuevoDiaStoriesIndex.logger.debug('found %s articles in index page', articles.length)

      for (let [a_idx, article] of articles.entries()) {
        try {
          const summary = this.getStorySummary(article, article.authors[0])
          if (summary !== undefined) {
            NuevoDiaStoriesIndex.logger.debug('articles[%s] summary object=%0', a_idx, summary)
            yield summary
          }
        }
        catch (err) {
          throw new Error(`failed to parse summary of articles[${a_idx}]`, { cause: err })
        }
      }
    }
  }

  /**
   * @param {HTMLElement} storyPage
   * @returns {Generator<string>}
   */
  *getStoryText(storyPage) {
    NuevoDiaStoriesIndex.logger.debug(
      'isolate article text at selectors=[%s, %s]',
      NuevoDiaStoriesIndex.selectorArticleTitle, NuevoDiaStoriesIndex.selectorArticleText
    )

    function filterText(text) {
      return text.replaceAll(/\s+/g, ' ').trim()
    }

    const titlesEl = storyPage.querySelector(NuevoDiaStoriesIndex.selectorArticleTitle)
    const headlinesEl = titlesEl?.querySelectorAll(NuevoDiaStoriesIndex.selectorTitleHeadlines)
    if (headlinesEl === undefined || headlinesEl.length < 1) {
      NuevoDiaStoriesIndex.logger.warning(
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
