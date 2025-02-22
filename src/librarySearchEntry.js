import path from 'node:path'
import { RelationalTag } from 'relational_tags'
import { TYPE_TO_TAG_CHILD, SEARCHES_DIR } from './config.js'
import { LibraryDescriptor } from './libraryDescriptor.js'
import { getDateTag } from './library.js'
import { dateToString } from './stringUtil.js'
import { LibraryBook } from './library.js'
/**
 * @typedef {{
 *  indexName: string
 *  pageNumber: string
 *  storyId: string
 *  profilePath: string|undefined
 * }} BookReference
 */

/**
 * Library search entry from history.
 * 
 * In future, could extend a HistoryEntry superclass.
 */
export class LibrarySearchEntry extends LibraryDescriptor {
  static get tSearchDate() { return RelationalTag.new('search-date') }
  static get tSearchNumber() { return RelationalTag.new('search-number') }

  /**
   * 
   * @param {Date|string|number} searchDate 
   * @param {number} searchNumber 
   * @param {string} input 
   * @param {string} renderFilePath 
   * @param {BookReference[]} resultBookRefs
   * @param {string} historyDir 
   */
  constructor(searchDate, searchNumber, input, renderFilePath, resultBookRefs, historyDir) {
    super()

    /**
     * @type {Date}
     */
    this.searchDate = new Date(searchDate)
    /**
     * @type {number}
     */
    this.searchNumber = searchNumber
    /**
     * @type {string}
     */
    this.input = input
    /**
     * @type {string}
     */
    this.filePath = LibrarySearchEntry.getFilePath(historyDir, searchNumber)
    /**
     * @type {string}
     */
    this.renderFilePath = renderFilePath
    /**
     * @type {BookReference[]}
     */
    this.resultBookRefs = resultBookRefs
    this.resultBookRefs.forEach((bookRef) => {
      if (bookRef.profilePath === null) {
        bookRef.profilePath = undefined
      }
    })
  }

  static fromData({ searchDate, searchNumber, input, renderFilePath, resultBookRefs }, historyDir) {
    return new LibrarySearchEntry(
      searchDate, searchNumber, input, renderFilePath, resultBookRefs, historyDir
    )
  }

  static getFilePath(historyDir, searchNumber) {
    return path.join(historyDir, SEARCHES_DIR, `libsearch-${searchNumber}.json`)
  }

  static initTags() {
    this.adoptTag(this.tSearchDate)
    this.adoptTag(this.tSearchNumber)
  }

  /**
   * @param {LibraryBook} book 
   */
  static getBookRef(book) {
    return {
      indexName: book.indexPage.indexName,
      pageNumber: book.indexPage.pageNumber,
      storyId: book.story.id,
      profilePath: book.profile?.filePath
    }
  }

  /**
   * @type {RegExp}
   */
  static get fileRegExp() {
    return /libsearch-(\d+).json$/
  }

  /**
   * @param {string} searchFilePath 
   * @returns {number}
   */
  static parseSearchNumber(searchFilePath) {
    let m = this.fileRegExp.exec(searchFilePath)
    if (m === null) {
      throw new Error(`failed to parse search number from ${searchFilePath}`)
    }
    return parseInt(m[1])
  }

  setTags() {
    let tsd = getDateTag(this.searchDate)
    tsd.connect_to(this)
    LibrarySearchEntry.tSearchDate.connect_to(tsd, TYPE_TO_TAG_CHILD)

    LibrarySearchEntry.tSearchNumber.connect_to(this, undefined, this.searchNumber)
  }

  toString() {
    return `${LibrarySearchEntry.name}[`
      + `date=${dateToString(this.searchDate)}`
      + ` number=${this.searchNumber}]`
  }
}