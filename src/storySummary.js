import { RelationalTag } from 'relational_tags'
import { LibraryDescriptor } from './libraryDescriptor.js'
import { TYPE_TO_TAG_CHILD, getDateTag, getTextTag } from './library.js'

export class StorySummary extends LibraryDescriptor {
  static t = RelationalTag.new('story')
  static tAuthorName = RelationalTag.new('author-name')
  static tTitle = RelationalTag.new('title')
  static tPublishDate = RelationalTag.new('publish-date')

  /**
   * @param {string} authorName
   * @param {string} title
   * @param {Date|string|number} publishDate
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
    this.publishDate = new Date(publishDate)
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
    let tan = getTextTag(this.authorName)
    StorySummary.tAuthorName.connect_to(tan, TYPE_TO_TAG_CHILD)
    tan.connect_to(this)

    let tt = getTextTag(this.title)
    StorySummary.tTitle.connect_to(tt, TYPE_TO_TAG_CHILD)
    tt.connect_to(this)

    let tpd = getDateTag(this.publishDate)
    StorySummary.tPublishDate.connect_to(tpd, TYPE_TO_TAG_CHILD)
    tpd.connect_to(this)
  }

  toString() {
    return `${StorySummary.name}[id=${this.id} title=${this.title}]`
  }
}