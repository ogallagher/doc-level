import { RelationalTag, RelationalTagConnection } from 'relational_tags'
import { LibraryDescriptor } from './libraryDescriptor.js'
import { Difficulty, Ideology, Maturity, TextProfile, Topic } from './textProfile.js'
import { StoriesIndex, getStoriesIndex } from './storiesIndex.js'
import { loadText, loadProfile } from './reader.js'
/**
 * @typedef {import('pino').Logger} Logger
 * @typedef {import('./messageSchema.js').Story} Story
 * @typedef {import('./index.js').IndexPage} IndexPage
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
    LibraryBook.initTags()

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
   * @type {LibraryBook[]}
   */
  let books = []

  for (let page of indexPages) {
    logger.debug('create LibraryBook instance for each story in page-path=%s', page.filePath)
    let pPage = loadText(page.filePath)
    .then(JSON.parse)
    .then(
      /**
       * @param {Story[]} storySummaries 
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

          return {story, profile}
        }))
      }
    )
    .then((storyProfiles) => {
      storyProfiles.forEach(({story, profile}) => {
        books.push(new LibraryBook(story, page, profile))
      })
    })

    pPages.push(pPage)
  }

  await Promise.all(pPages)
  return new Library(books)
}

/**
 * Unified data structure for browsing indexes, stories/texts, profiles.
 * 
 * All items within the library are organized using [relational tagging](https://github.com/ogallagher/relational_tags).
 */
export class Library {
  /**
   * @param {LibraryBook[]} books 
   */
  constructor(books) {
    /**
     * @type {LibraryBook[]}
     */
    this.books = books
    logger.info('created library of %s items', books.length)
  }
}

export class LibraryBook extends LibraryDescriptor {
  static t = RelationalTag.new('library-book')

  // extra tags for Story and IndexPage attributes are currently defined here since these types are not proper classes.
  static tStory = RelationalTag.new('story')
  static tAuthorName = RelationalTag.new('author-name')
  static tTitle = RelationalTag.new('title')

  static tIndexPage = RelationalTag.new('index-page')
  static tPageNumber = RelationalTag.new('page-number')
  static tPagePath = RelationalTag.new('page-path')

  /**
   * @param {Story} story 
   * @param {IndexPage} indexPage 
   * @param {TextProfile|undefined} profile 
   */
  constructor(story, indexPage, profile) {
    super()

    /**
     * @type {Story}
     */
    this.story = story
    /**
     * @type {IndexPage}
     */
    this.indexPage = indexPage
    /**
     * @type {StoriesIndex}
     */
    this.index = getStoriesIndex(indexPage.indexName)
    /**
     * @type {TextProfile|undefined}
     */
    this.profile = profile
  }

  static initTags() {
    this.adoptTag(this.tStory)
    this.tStory.connect_to(this.tAuthorName, TYPE_TO_TAG_CHILD)
    this.tStory.connect_to(this.tTitle, TYPE_TO_TAG_CHILD)

    this.adoptTag(this.tIndexPage)
    this.tIndexPage.connect_to(this.tPageNumber, TYPE_TO_TAG_CHILD)
    this.tIndexPage.connect_to(this.tPagePath, TYPE_TO_TAG_CHILD)

    this.adoptTag(StoriesIndex.t)

    this.adoptTag(TextProfile.t)
  }

  setTags() {
    LibraryBook.tStory.connect_to(this.story)
    LibraryBook.tAuthorName.connect_to(this.story.authorName)
    LibraryBook.tTitle.connect_to(this.story.title)

    LibraryBook.tIndexPage.connect_to(this.indexPage)
    LibraryBook.tPageNumber.connect_to(this.indexPage.pageNumber)
    LibraryBook.tPagePath.connect_to(this.indexPage.filePath)

    this.index.setTags()

    this.profile.setTags()
  }
}
