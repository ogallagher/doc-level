import { RelationalTag } from 'relational_tags'
import { TYPE_TO_TAG_CHILD } from './config.js'
import { LibraryDescriptor } from './libraryDescriptor.js'
import { getDateTag, getTextTag } from './library.js'


export class StorySummary extends LibraryDescriptor {
  static get tId() { return RelationalTag.new('story-id') }
  static get tAuthorName() { return  RelationalTag.new('author-name') }
  static get tTitle() { return RelationalTag.new('title') }
  static get tPublishDate() { return RelationalTag.new('publish-date') }

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
     * @type {Date|undefined}
     */
    this.publishDate = publishDate !== undefined && publishDate !== null ? new Date(publishDate) : undefined
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
    this.adoptTag(this.tId)
    this.adoptTag(this.tAuthorName)
    this.adoptTag(this.tTitle)
    this.adoptTag(this.tPublishDate)
  }

  setTags() {
    let tid = RelationalTag.get(this.id)
    StorySummary.tId.connect_to(tid, TYPE_TO_TAG_CHILD)
    tid.connect_to(this)

    let tan = getTextTag(this.authorName)
    StorySummary.tAuthorName.connect_to(tan, TYPE_TO_TAG_CHILD)
    tan.connect_to(this)

    let tt = getTextTag(this.title)
    StorySummary.tTitle.connect_to(tt, TYPE_TO_TAG_CHILD)
    tt.connect_to(this)

    if (this.publishDate !== undefined) {
      let tpd = getDateTag(this.publishDate)
      StorySummary.tPublishDate.connect_to(tpd, TYPE_TO_TAG_CHILD)
      tpd.connect_to(this)
    }
  }

  toString() {
    return `${StorySummary.name}[id=${this.id} title=${this.title}]`
  }
}