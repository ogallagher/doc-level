import { RelationalTag } from 'relational_tags'
import path from 'node:path'
import { LibraryDescriptor } from './libraryDescriptor.js'
import { StoriesIndex } from './storiesIndex.js'

export class IndexPage extends LibraryDescriptor {
  static t = RelationalTag.new('index-page')
  static tPageNumber = RelationalTag.new('page-number')
  static tPageDir = RelationalTag.new('page-dir')
  static tPageFileName = RelationalTag.new('page-filename')

  /**
   * @param {string} indexName
   * @param {string} pageNumber
   * @param {string} filePath
   */
  constructor(indexName, pageNumber, filePath) {
    super()

    this.indexName = indexName
    this.pageNumber = pageNumber
    this.filePath = filePath
  }

  static initTags() {
    this.adoptTag(StoriesIndex.tName)
    this.adoptTag(this.tPageNumber)
    this.adoptTag(this.tPageDir)
    this.adoptTag(this.tPageFileName)
  }

  setTags() {
    let tin = StoriesIndex.getNameTag(this.indexName)
    StoriesIndex.tName.connect_to(tin)
    tin.connect_to(this)
    
    IndexPage.tPageNumber.connect_to(this, undefined, this.pageNumber)

    let tpd = RelationalTag.get(path.dirname(this.filePath))
    IndexPage.tPageDir.connect_to(tpd)
    tpd.connect_to(this)

    let tpf = RelationalTag.get(path.basename(this.filePath))
    IndexPage.tPageFileName.connect_to(tpf)
    tpf.connect_to(this)
  }

  toString() {
    return `${IndexPage.name}[index=${this.indexName} page-number=${this.pageNumber}]`
  }
}