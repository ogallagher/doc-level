import * as path from 'path'
import { StorySummary } from '../storySummary.js'
import { StoriesIndex } from './storiesIndex.js'

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
    for (let l = 'z'.codePointAt(0); l >= 'a'.codePointAt(0); l--) {
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
      ProjectGutenberg.alphabetPrefixes[pageNumber - 1]
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

    ProjectGutenberg.logger.info('found %s books in index page', bookLinks.length)
    /**
     * @type {StorySummary}
     */
    let prevSummary
    for (let b_idx = 0; b_idx < bookLinks.length; b_idx++) {
      try {
        let audiobookIndicator = bookLinks[b_idx].parentNode.querySelector(
          ProjectGutenberg.selectorAudiobookIndicator
        )
        if (audiobookIndicator !== null) {
          ProjectGutenberg.logger.info('skip audiobook "%s"', bookLinks[b_idx].textContent)
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
          ProjectGutenberg.logger.info(
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
      .split(/[\n\r]{2,}/)

    for (let pgraph of pgraphs) {
      let p = pgraph.trim()
      if (p.length > 0) {
        yield p
      }
    }
  }
}
