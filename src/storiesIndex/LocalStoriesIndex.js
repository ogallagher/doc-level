import { StoriesIndex } from './storiesIndex.js'

export const LOCAL_INDEX_NAME = 'local'

export class LocalStoriesIndex extends StoriesIndex {
  constructor() {
    super(
      `file://local-filesystem`,
      [LOCAL_INDEX_NAME],
      1, 1,
      'index.json',
      undefined,
      undefined,
      true)
  }

  getPageUrl() {
    throw new Error('virtual index for local filesystem does not have page urls')
  }

  /**
   * Returns the story summaries directly from the given page content.
   *
   * @param {StorySummary[]} indexPage
   */
  *getStorySummaries(indexPage) {
    for (let story of indexPage) {
      yield story
    }
  }

  *getStoryText(storyPage) {
    throw new Error('virtual index for local filesystem does not have story pages')
  }
}
