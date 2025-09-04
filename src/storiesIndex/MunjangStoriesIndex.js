import * as path from 'path'
import { StoriesIndex } from './storiesIndex.js'
import { StorySummary } from '../storySummary.js'

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
    'p',
    'blockquote'
  ].join(',')

  static excerptAuthorRegexp = /\s*([가-힣]{2,}|[가-힣 ]{3,})\s+/

  static titleStartIdxMax = 32

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
      70,
      undefined, undefined, undefined, undefined, undefined,
      12
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
    MunjangStoriesIndex.logger.debug('isolate list of stories at selector=%s', MunjangStoriesIndex.selectorStories)

    const storiesEl = indexPage.querySelectorAll(MunjangStoriesIndex.selectorStories)
    MunjangStoriesIndex.logger.info('found %s stories in index page', storiesEl.length)

    for (let [idx, storyEl] of storiesEl.entries()) {
      try {
        const titleAuthor = storyEl.querySelector(MunjangStoriesIndex.selectorTitleAuthor).textContent
        MunjangStoriesIndex.logger.info('stories[%s] title-author=%s', idx, titleAuthor)

        const splitIdx = titleAuthor.indexOf('-')

        let author = titleAuthor.substring(0, splitIdx)
        const title = titleAuthor.substring(splitIdx + 1)
        MunjangStoriesIndex.logger.debug('stories[%s] title.raw=%s author.raw=%s', idx, title, author)

        const meta = storyEl.querySelector(MunjangStoriesIndex.selectorMeta)
        const metaDate = meta.querySelector(MunjangStoriesIndex.selectorMetaDate) || undefined
        const metaViews = meta.querySelector(MunjangStoriesIndex.selectorMetaViews) || undefined

        const excerpt = storyEl.querySelector(MunjangStoriesIndex.selectorExcerpt).textContent
          .replace(/&lsquo.+&rsquo;\s+/, '')
          .replace(/광고 건너뛰기▶｜\s+/, '')
          .replaceAll(/[\r\n]+\s+/g, ' ')
          .trim()

        if (splitIdx === -1) {
          MunjangStoriesIndex.logger.debug(
            'title=%s does not contain author; get from start of excerpt after title'
          )

          const titleStartIdx = excerpt.indexOf(title)
          const titleEndIdx = (
            (titleStartIdx !== -1 && titleStartIdx < MunjangStoriesIndex.titleStartIdxMax) 
            ? titleStartIdx + title.length 
            : 0
          )
          const authorMatcher = MunjangStoriesIndex.excerptAuthorRegexp.exec(excerpt.substring(titleEndIdx))
          
          if (authorMatcher !== null) {
            author = authorMatcher[1]
          }
          else {
            throw new Error(
              'failed to parse author name from stories[%s] title-author=%s excerpt=%s', 
              idx, 
              titleAuthor,
              excerpt
            )
          }
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
          publishDate: (
            metaDate === undefined ? undefined : new Date(metaDate.textContent)
          ),
          viewCount: (
            metaViews === undefined ? -1 : parseInt(metaViews.textContent)
          ),
          // concatenate origin (root without path) and story path
          url: url,
          excerpts: [
            excerpt
          ],
          id: url.searchParams.get('list_no')
        }
        MunjangStoriesIndex.logger.debug('stories[%s] summary object=%o', idx, storySummary)

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
    MunjangStoriesIndex.logger.debug('isolate story text at selector=%s', MunjangStoriesIndex.selectorStoryText)

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
    MunjangStoriesIndex.logger.info('found %s paragraphs in story text', pgraphsEl.length)

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
          MunjangStoriesIndex.logger.debug('skip pgraph[%s] = %s...', idx, pgraph.substring(0, 100))
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
