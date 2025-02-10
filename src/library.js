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
export const TYPE_TO_TAG_PARENT = RelationalTagConnection.inverse_type(TYPE_TO_TAG_CHILD)
/**
 * Prefix of an ISO timestamp to use for date-value tags.
 * @type {number}
 */
export const TAG_DATE_PRECISION = 'yyyy-mm-dd'.length
/**
 * Minimum length of a word within free text to be included in a compressed tag name.
 */
export const TAG_TEXT_WORD_LEN_MIN = 4
/**
 * Maximum length of a tag name derived from free text.
 */
export const TAG_TEXT_LEN_MAX = 16
/**
 * Maximum number of generations to include in a lineage tag name.
 * 
 * Given tag-tag connections are parent-child relationships, the lineage name for
 * a child is `parent.child`, here having 2 "generations"/parts.
 */
export const TAG_LINEAGE_NAME_PARTS_MAX = 4

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
 * 
 * @returns {Promise<Library>}
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
 * @param {Date} date 
 * @returns Tag derived from date.
 */
export function getDateTag(date) {
  return RelationalTag.get(date.toISOString().substring(0, TAG_DATE_PRECISION))
}

/**
 * Convert free text to a compressed tag name.
 * 
 * This function will need to be updated to include legible characters in other languages.
 * 
 * @param {string} text 
 */
export function getTextTag(text) {
  if (text.length > TAG_TEXT_LEN_MAX) {
    let tagText = text
    // lowercase
    .toLowerCase()
    // split on illegible chars
    .split(/[^a-z0-9가-힣áéíóúäëïöüÿç]+/)
    // drop small words
    .filter((w) => w.length > TAG_TEXT_WORD_LEN_MIN)
    // space delimited
    .join(' ')

    logger.debug('compressed text %s to tag name %s', text, tagText)
    return RelationalTag.get(tagText)
  }
  else {
    return RelationalTag.get(text)
  }
}

/**
 * @param {RelationalTag} tag 
 * @returns {RelationalTag|undefined}
 */
function getTagParent(tag) {
  for (let [target, conn] of tag.connections.entries()) {
    if (target instanceof RelationalTag && conn.type === TYPE_TO_TAG_PARENT) {
      return target
    }
  }
  return undefined
}

/**
 * @param {RelationalTag} tag 
 * @param {string} delim
 */
export function getTagLineageName(tag, delim='.') {
  /**
   * Tag lineage, ordered child last.
   * 
   * @type {string[]}
   */
  let generations = [tag.name]
  /**
   * @type {RelationalTag}
   */
  let parent = tag

  while (generations.length < TAG_LINEAGE_NAME_PARTS_MAX && (parent = getTagParent(parent)) !== undefined) {
    generations.splice(0, 0, parent.name)
  }

  return generations.join(delim)
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

  /**
   * Fetch items according to a query to filter and comparator to sort.
   * 
   * @return {Generator<LibraryDescriptor>}
   */
  *getItems(query, comparator) {
    
  }

  static initTags() {
    this.adoptTag(LibraryBook.t)
    this.adoptTag(StoriesIndex.t)
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
    // Indexes do not have separate instances for each book, so they belong directly to the library.
    // TODO To determine books associated with an index, the name should reference the indexPage within a book.
    this.index.setParent(parent)

    /**
     * @type {TextProfile|undefined}
     */
    this.profile = profile
    this.profile?.setParent(this)
  }

  static initTags() {
    this.adoptTag(StorySummary.t)
    // currently, index-page is child of both library-book and stories-index tags.
    this.adoptTag(IndexPage.t)
    this.adoptTag(TextProfile.t)
  }

  setTags() {
    this.story.setTags()
    this.indexPage.setTags()
    this.index.setTags()
    this.profile?.setTags()
  }
}
