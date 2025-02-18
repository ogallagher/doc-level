import { RelationalTag } from 'relational_tags'
import path from 'node:path'
import { TYPE_TO_TAG_CHILD } from './config.js'
import { LibraryDescriptor } from './libraryDescriptor.js'
import { StoriesIndex } from './storiesIndex/storiesIndex.js'

export class IndexPage extends LibraryDescriptor {
  static get tPageNumber() { return RelationalTag.new('page-number') }
  static get tPageDir() { return RelationalTag.new('page-dir') }
  static get tPageFileName() {return RelationalTag.new('page-filename') }

  /**
   * Reference to a page within a stories index. 
   * 
   * Every book will have it's own index page instance.
   * 
   * @param {string} indexName Name of {@link StoriesIndex index}.
   * @param {string|number} pageNumber Page number.
   * @param {string|undefined} filePath Path to page file having a list of story summaries.
   * @param {string|undefined} storiesDir Used to derive file path if `filePath` is not provided.
   */
  constructor(indexName, pageNumber, filePath, storiesDir) {
    super()

    /**
     * @type {string}
     */
    this.indexName = indexName
    /**
     * @type {number}
     */
    this.pageNumber = (typeof pageNumber === 'number' ? pageNumber : parseInt(pageNumber))
    /**
     * @type {string}
     */
    this.filePath = filePath
    if (filePath === undefined) {
      this.filePath = IndexPage.getPath(this.indexName, this.pageNumber, storiesDir)
    }
  }

  static fromData({indexName, pageNumber, filePath}) {
    return new IndexPage(indexName, pageNumber, filePath)
  }

  static initTags() {
    this.adoptTag(StoriesIndex.tName)
    this.adoptTag(this.tPageNumber)
    this.adoptTag(this.tPageDir)
    this.adoptTag(this.tPageFileName)
  }

  static getPath(indexName, pageNumber, storiesDir) {
    return path.join(storiesDir, indexName, `page-${pageNumber}`, 'index.json')
  }

  setTags() {
    let tin = StoriesIndex.getNameTag(this.indexName)
    StoriesIndex.tName.connect_to(tin, TYPE_TO_TAG_CHILD)
    tin.connect_to(this)
    
    IndexPage.tPageNumber.connect_to(this, undefined, this.pageNumber)

    let tpd = RelationalTag.get(path.dirname(this.filePath))
    IndexPage.tPageDir.connect_to(tpd, TYPE_TO_TAG_CHILD)
    tpd.connect_to(this)

    let tpf = RelationalTag.get(path.basename(this.filePath))
    IndexPage.tPageFileName.connect_to(tpf, TYPE_TO_TAG_CHILD)
    tpf.connect_to(this)
  }

  toString() {
    return `${IndexPage.name}[index=${this.indexName} page-number=${this.pageNumber}]`
  }
}