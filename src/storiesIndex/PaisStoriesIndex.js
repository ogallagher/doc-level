import * as path from 'path'
import { StoriesIndex } from './storiesIndex.js'
import { StorySummary } from '../storySummary.js'

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
    PaisStoriesIndex.logger.debug('isolate list of articles at selector=%s', PaisStoriesIndex.selectorArticles)

    const articlesEl = indexPage.querySelectorAll(PaisStoriesIndex.selectorArticles)
    PaisStoriesIndex.logger.info('found %s articles in index page', articlesEl.length)

    const wsRegExp = /\s+/g

    for (let [idx, articleEl] of articlesEl.entries()) {
      try {
        const title = articleEl.querySelector(
          PaisStoriesIndex.selectorArticleTitle
        ).textContent.replaceAll(wsRegExp, ' ').trim()
        PaisStoriesIndex.logger.info('articles[%s] title=%s', idx, title)

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
        PaisStoriesIndex.logger.debug('articles[%s] summary object=%o', idx, summary)

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
    PaisStoriesIndex.logger.debug('isolate story text at selector=%s', PaisStoriesIndex.selectorArticleText)

    const pgraphsEl = storyPage.querySelectorAll(PaisStoriesIndex.selectorArticleText)
    if (pgraphsEl.length < 1) {
      throw new Error(`failed to load paragraphs from article page`, {
        cause: {
          pgraphsElSelector: PaisStoriesIndex.selectorArticleText
        }
      })
    }
    PaisStoriesIndex.logger.info('found %s paragraphs in article text', pgraphsEl.length)

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