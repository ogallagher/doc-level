import { RelationalTag } from 'relational_tags'
import { TYPE_TO_TAG_CHILD } from '../config.js'
import { LibraryDescriptor } from '../libraryDescriptor.js'
import { IndexPage } from '../indexPage.js'
/**
 * @typedef {import('pino').Logger} Logger
 * @typedef {import('../storySummary.js').StorySummary} StorySummary
 */

/**
 * Registered `StoriesIndex` instances.
 * @type {Map<string, StoriesIndex>}
 */
export const storiesIndexes = new Map()

/**
 * Abstract superclass for all sources of stories.
 */
export class StoriesIndex extends LibraryDescriptor {
  /**
   * Logger for this type of stories index.
   * 
   * @type {Logger}
   */
  static logger

  /**
   * @type {RelationalTag}
   */
  static get tUrlTemplate() { return RelationalTag.new('url-template') }
  /**
   * @type {RelationalTag}
   */
  static get tName() { return RelationalTag.new('index-name') }

  /**
   * 
   * @param {string} urlTemplate 
   * @param {string[]} names 
   * @param {number} pageNumberMin 
   * @param {number} pageNumberMax 
   * @param {string} pageFilename
   * @param {any} pageRequestHeaders
   * @param {boolean} hide
   * @param {boolean} isPageDynamic
   */
  constructor(
    urlTemplate, names, 
    pageNumberMin = 0, pageNumberMax = 50, 
    pageFilename = 'index.html',
    pageRequestHeaders = undefined,
    storyFileExt = '.html',
    hide = false,
    isPageDynamic = false,
    pageStoryCountExpected = 25
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
    /**
     * @type {boolean}
     */
    this.hide = hide
    /**
     * Whether the same page number can return different sets of stories depending on when the fetch
     * is performed.
     * @type {boolean}
     */
    this.isPageDynamic = isPageDynamic
    /**
     * Expected number of stories in a single page.
     */
    this.pageStoryCountExpected = pageStoryCountExpected

    // define tags early so that aliases are also defined
    this.setTags()

    // register index as available
    names.forEach((alias) => {
      if (!storiesIndexes.has(alias)) {
        storiesIndexes.set(alias, this)
      }
      else {
        StoriesIndex.logger.warn(
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
   * @param {HTMLElement|object} indexPage Parsed page.
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

  /**
   * 
   * @param {Logger} parentLogger 
   */
  static init(parentLogger) {
    this.logger = parentLogger.child({
      name: this.name
    })
  }
}