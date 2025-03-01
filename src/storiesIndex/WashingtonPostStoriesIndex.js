import { StorySummary } from '../storySummary.js'
import { StoriesIndex } from './storiesIndex.js'

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
   * @param {number} pageArticleCount 
   */
  constructor(basePath, pageArticleCount = 50) {
    let url = new URL('https://www.washingtonpost.com/prism/api/prism-query')
    url.searchParams.set('_website', 'washpost')

    super(
      url.toString(),
      ['washington-post', 'washpost'],
      0,
      300,
      'index-prism-api.json',
      undefined,
      undefined,
      undefined,
      undefined,
      pageArticleCount
    )

    /**
     * Count of articles per page. Multiply page number by this to get offset.
     * @type {number}
     */
    this.pageArticleCount = pageArticleCount

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
    WashingtonPostStoriesIndex.logger.debug('found %s articles in index page', indexPage.items.length)

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
        WashingtonPostStoriesIndex.logger.debug('articles[%s] summary object=%o', idx, summary)

        yield StorySummary.fromData(summary)
      }
      catch (err) {
        throw new Error(`failed to parse summary of articles[${idx}]`, { cause: err })
      }
    }
  }

  /**
   * @param {HTMLElement} storyPage
   * @returns {Generator<string>}
   */
  *getStoryText(storyPage) {
    WashingtonPostStoriesIndex.logger.debug('isolate story text at selector=%s', WashingtonPostStoriesIndex.selectorArticleText)

    const pgraphsEl = storyPage.querySelectorAll(WashingtonPostStoriesIndex.selectorArticleText)
    if (pgraphsEl.length < 1) {
      throw new Error(`failed to load paragraphs from article page`, {
        cause: {
          pgraphsElSelector: WashingtonPostStoriesIndex.selectorArticleText
        }
      })
    }
    WashingtonPostStoriesIndex.logger.info('found %s paragraphs in article text', pgraphsEl.length)

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
