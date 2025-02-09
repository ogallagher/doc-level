import { RelationalTag } from 'relational_tags'
import { LibraryDescriptor } from './libraryDescriptor.js'
import { StoriesIndex } from './storiesIndex.js'

export class IndexPage extends LibraryDescriptor {
  static t = RelationalTag.new('index-page')
  static tPageNumber = RelationalTag.new('page-number')
  static tPagePath = RelationalTag.new('page-path')

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
    this.adoptTag(this.tPagePath)
  }

  setTags() {
    IndexPage.tPageNumber.connect_to(this.pageNumber)
    IndexPage.tPagePath.connect_to(this.filePath)
  }
}