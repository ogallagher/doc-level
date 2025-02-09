import { RelationalTag, RelationalTagConnection } from 'relational_tags'
import { LibraryDescriptor } from './libraryDescriptor.js'
import { Difficulty, Ideology, Maturity, TextProfile, Topic } from './textProfile.js'
import { StoriesIndex, getStoriesIndex } from './storiesIndex.js'
import { StorySummary } from './storySummary.js'
import { IndexPage } from './indexPage.js'
import { loadText, loadProfile } from './reader.js'
/**
 * @typedef {import('pino').Logger} Logger
 */

/**
 * @type {Logger}
 */
let logger

/**
 * tag-tag connection type for parent to child.
 * @type {string}
 */
export const TYPE_TO_TAG_CHILD = RelationalTagConnection.TYPE_TO_TAG_CHILD

/**
 * Init module logger and tags for all subclasses of {@link LibraryDescriptor}.
 * 
 * @param {Logger} parentLogger
 * @returns {Promise<undefined>}
 */
export function init(parentLogger) {
  return new Promise(function (res) {
    logger = parentLogger.child(
      {
        name: 'library'
      }
    )

    RelationalTag.config(false)

    // call initTags on every LibraryDescriptor
    Maturity.initTags()
    Difficulty.initTags()
    Topic.initTags()
    Ideology.initTags()
    TextProfile.initTags()
    StorySummary.initTags()
    StoriesIndex.initTags()
    IndexPage.initTags()
    LibraryBook.initTags()
    Library.initTags()

    logger.debug('end init')
    res()
  })
}

/**
   * 
   * @param {IndexPage[]} indexPages 
   * @param {string} profilesDir
   */
export async function getLibrary(indexPages, profilesDir) {
  /**
   * @type {Promise[]}
   */
  let pPages = []
  /**
   * @type {Library}
   */
  const library = new Library()

  for (let page of indexPages) {
    logger.debug('create LibraryBook instance for each story in page-path=%s', page.filePath)
    let pPage = loadText(page.filePath)
    .then(JSON.parse)
    .then(
      /**
       * @param {StorySummary[]} storySummaries 
       */
      (storySummaries) => {
        return Promise.all(storySummaries.map(async (story) => {
          /**
           * @type {TextProfile|undefined}
           */
          let profile
          try {
            profile = await loadProfile(story.id, profilesDir)
          }
          catch (err) {
            logger.debug('no profile found for story=%s', story.id)
            logger.trace(err)
          }

          return {story: StorySummary.fromData(story), profile}
        }))
      }
    )
    .then((storyProfiles) => {
      storyProfiles.forEach(({story, profile}) => {
        library.addBook(new LibraryBook(library, story, page, profile))
      })
    })

    pPages.push(pPage)
  }

  await Promise.all(pPages)
  return library
}

/**
 * Unified data structure for browsing indexes, stories/texts, profiles.
 * 
 * All items within the library are organized using [relational tagging](https://github.com/ogallagher/relational_tags).
 */
export class Library extends LibraryDescriptor {
  static t = RelationalTag.new('library')

  constructor() {
    // library is root of hierarchy; no parent
    super(undefined)

    /**
     * @type {Map<string, LibraryBook>}
     */
    this.books = new Map()

    this.setTags()
    logger.info('created empty library')
  }

  /**
   * Create unique id for the given book.
   * 
   * Current implementation includes the index name nad page number, so if the same story id is present
   * on multiple pages, for example, they will are added as separate books.
   * 
   * @param {LibraryBook} book 
   * @returns {string}
   */
  static _getKey(book) {
    return [book.index.name, book.indexPage.pageNumber, book.story.id].join('-')
  }

  /**
   * 
   * @param {LibraryBook} book 
   */
  addBook(book) {
    this.books.set(Library._getKey(book), book)
    book.setTags()
  }

  static initTags() {
    this.adoptTag(LibraryBook.t)
  }

  setTags() {
    Library.t.connect_to(this)
    // does not call books.setTags because this is done when each book is added.
  }
}

export class LibraryBook extends LibraryDescriptor {
  static t = RelationalTag.new('library-book')

  /**
   * @param {LibraryDescriptor} parent
   * @param {StorySummary} story 
   * @param {IndexPage} indexPage 
   * @param {TextProfile|undefined} profile 
   */
  constructor(parent, story, indexPage, profile) {
    super(parent)

    /**
     * @type {StorySummary}
     */
    this.story = story
    this.story.setParent(this)

    /**
     * @type {IndexPage}
     */
    this.indexPage = indexPage
    this.indexPage.setParent(this)

    /**
     * @type {StoriesIndex}
     */
    this.index = getStoriesIndex(indexPage.indexName)
    // indexes do not have separate instances for each book, so they belong directly to the library
    this.index.setParent(parent)

    /**
     * @type {TextProfile|undefined}
     */
    this.profile = profile
    this.profile?.setParent(this)
  }

  static initTags() {
    // currently, index-page is child of both library-book and stories-index tags.
    this.adoptTag(IndexPage.t)

    this.adoptTag(StoriesIndex.t)

    this.adoptTag(TextProfile.t)
  }

  setTags() {
    this.story.setTags()
    this.indexPage.setTags()
    this.index.setTags()
    this.profile?.setTags()
  }
}
