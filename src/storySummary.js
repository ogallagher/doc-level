import { RelationalTag } from 'relational_tags'
import { LibraryDescriptor } from './libraryDescriptor.js'

export class StorySummary extends LibraryDescriptor {
  static t = RelationalTag.new('story')
  static tAuthorName = RelationalTag.new('author-name')
  static tTitle = RelationalTag.new('title')
  static tPublishDate = RelationalTag.new('publish-date')

  /**
   * @param {string} authorName
   * @param {string} title
   * @param {Date} publishDate
   * @param {number} viewCount
   * @param {string} url
   * @param {string[]} excerpts
   * @param {string} id
   */
  constructor(id, authorName, title, publishDate, viewCount, url, excerpts) {
    super()

    /**
     * @type {string}
     */
    this.id = id
    /**
     * @type {string}
     */
    this.authorName = authorName
    /**
     * @type {string}
     */
    this.title = title
    /**
     * @type {Date}
     */
    this.publishDate = publishDate
    /**
     * @type {number}
     */
    this.viewCount = viewCount
    /**
     * @type {string}
     */
    this.url = url
    /**
     * @type {string[]}
     */
    this.excerpts = excerpts
  }

  static fromData({id, authorName, title, publishDate, viewCount, url, excerpts}) {
    return new StorySummary(id, authorName, title, publishDate, viewCount, url, excerpts)
  }

  static initTags() {
    this.adoptTag(this.tAuthorName)
    this.adoptTag(this.tTitle)
    this.adoptTag(this.tPublishDate)
  }

  setTags() {
    StorySummary.t.connect_to(this)
    StorySummary.tAuthorName.connect_to(this.authorName)
    StorySummary.tTitle.connect_to(this.title)
    StorySummary.tPublishDate.connect_to(this.publishDate)
  }
}