import { StorySummary } from '../storySummary.js'
import { StoriesIndex } from './storiesIndex.js'

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
    NaverBlogStoriesIndex.logger.debug('found %s posts in index page', indexPage.result.postList.length)

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
        NaverBlogStoriesIndex.logger.debug('posts[%s] summary object=%o', idx, summary)

        yield StorySummary.fromData(summary)
      }
      catch (err) {
        throw new Error(`failed to parse summary of posts[${idx}]`, { cause: err })
      }
    }
  }

  /**
   * @param {HTMLElement} storyPage
   * @returns {Generator<string>}
   */
  *getStoryText(storyPage) {
    NaverBlogStoriesIndex.logger.debug('isolate post text at selector=%s', NaverBlogStoriesIndex.selectorPostText)

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
    NaverBlogStoriesIndex.logger.info('found %s paragraphs in post text', pgraphsEl.length)

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
