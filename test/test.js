import assert from 'assert'
import pino from 'pino'
import path from 'path'
import { RelationalTag } from 'relational_tags'
import * as textProfile from '../src/textProfile.js'
import * as messageSchema from '../src/messageSchema.js'
import { formatString } from '../src/stringUtil.js'
import { loadPrompt, loadText, init as readerInit, setPromptDir, parseHtml, reduceStory } from '../src/reader.js'
import * as storiesIndex from '../src/storiesIndex.js'
import { getTagLineageName, Library, LibraryBook, init as libraryInit, TYPE_TO_TAG_CHILD } from '../src/library.js'
import { IndexPage } from '../src/indexPage.js'
import { StorySummary } from '../src/storySummary.js'
import { LibraryDescriptor } from '../src/libraryDescriptor.js'

const logger = pino(
  {
    name: 'test-app',
    level: 'debug'
  }
)

describe('textProfile', function() {
  describe('#init', function() {
    it('passes with parent logger', function() {
      return textProfile.init(logger)
    })
    
    it('fails without parent logger', function() {
      assert.rejects(textProfile.init())
    })
  })
  
  describe('Maturity', function() {
    describe('#append', function() {
      it('updates all attributes of affected maturity', function() {
        let m1 = new textProfile.Maturity(false, ['a', 'b'], ['c'])
        let m2 = new textProfile.Maturity(true, ['d'], ['e'])
        
        assert.notStrictEqual(m1.isRestricted, m2.isRestricted)
        m1.append(m2)
        assert.strictEqual(m1.isRestricted, m2.isRestricted)
        assert.strictEqual(m1.presents.length, 3)
        assert.strictEqual(m1.absents.length, 2)
      })
    })
  })
})

describe('messageSchema', function() {
  describe('#init', function() {
    it('passes with parent logger', function() {
      return messageSchema.init(logger)
    })
  })
})

describe('stringUtil', function() {
  describe('#formatString', function() {
    it('works', function() {
      const template = 'zero={0} one={1}'
      assert.strictEqual(
        formatString(template, '0', '1'),
        'zero=0 one=1'
      )
    })
  })
})

describe('reader', function() {
  this.beforeAll(function() {
    setPromptDir(path.join(import.meta.dirname, 'resource/prompt'))
  })

  describe('#init', function() {
    it('passes with parent logger', function() {
      return readerInit(logger)
    })
  })

  describe('#loadPrompt', function() {
    it('works when file is found', function() {
      return loadPrompt('prompt1.txt', 'someone')
      .then((prompt) => {
        assert.strictEqual(prompt.indexOf('{0}'), -1)
      })
    })

    it('fails when file is missing', function() {
      return assert.rejects(loadPrompt('prompt0.txt', 'someone'))
    })
  })

  describe('#loadText', function() {
    it('works when file is found', function() {
      return loadText('test/resource/text1.txt', 5)
      .then((text) => {
        assert.strictEqual(text.length, 5)
      })
    })
  })

  describe('#parseHtml', function() {
    it('works with selectors when file is found', function() {
      return parseHtml('test/resource/index1.html')
      .then((root) => {
        let title = root.querySelector('head > title')
        assert.ok(title)
        assert.notStrictEqual(title.textContent.indexOf('index 1'), -1)

        let id1_1 = root.querySelector('#id1')
        let id1_2 = root.querySelector('body article').querySelector('p#id1')
        assert.strictEqual(id1_1, id1_2)
      })
    })
  })

  describe('#reduceStory', function() {
    let pgs = ['aaaaa', 'bbbbb', 'cccccc', 'dddddddddd', 'eeeeee', 'fffffff']

    let pgLenTotal = 0
    pgs.forEach((pg) => {
      pgLenTotal += pg.length
    })

    it('selects equally distributed fragments', function() {
      return reduceStory(pgs, 18)
      .then((r) => {
        let rLen = 0
        r.forEach((pg) => {
          rLen += pg.length
        })
        logger.info('sample=%o sample-len=%s', r, rLen)
        assert.ok(rLen <= 18)
      })
      .then(() => reduceStory(pgs, pgLenTotal))
      .then((r) => {
        let rLen = 0
        r.forEach((pg) => {
          rLen += pg.length
        })
        logger.info('sample-len=%s population-len=%s sample=%o', rLen, pgLenTotal, r)
        assert.strictEqual(r.length, pgs.length)  
      })
    })
  })
})

describe('storiesIndex', function() {
  describe('#init', function() {
    it('passes with parent logger', function() {
      return storiesIndex.init(logger)
    })
  })

  describe('StoriesIndex', function() {
    /**
     * @type {storiesIndex.StoriesIndex}
     */
    let asi
    /**
     * @type {storiesIndex.MunjangStoriesIndex}
     */
    let mji

    before(async function() {
      await storiesIndex.init(logger)

      asi = new storiesIndex.StoriesIndex('https://host.tld', ['abstract0'])
      mji = storiesIndex.getStoriesIndex('문장웹진')
    })

    describe('#getPageUrl', function() {
      it('fails as abstract method', function() {
        assert.throws(
          () => {
            asi.getPageUrl()
          },
          {
            cause: 'abstract method'
          }
        )
      })

      it('passes as implemented method', function() {
        assert.doesNotThrow(
          () => {
            mji.getPageUrl(mji.pageNumberMin)
          }
        )
      })
    })

    describe('#storiesIndexes', function() {
      it('is updated with each instance', function() {
        assert.ok(storiesIndex.getStoriesIndex(asi.name) !== undefined)
      })
    })

    describe('#getStorySummaries', function() {
      describe('Munjang implementation', function() {
        it('parses stories from real page without failures', function() {
          return parseHtml('test/resource/index2.html')
          .then((htmlPage) => {
            for (let storySummary of mji.getStorySummaries(htmlPage)) {
              assert.ok(storySummary.authorName.length < 10)
              assert.ok(storySummary.title.length > 2)
              assert.ok(storySummary.publishDate < new Date())
              assert.ok(storySummary.viewCount > 0)
              assert.strictEqual(new URL(storySummary.url).host, 'munjang.or.kr')
              assert.ok(storySummary.excerpts.length == 1 && storySummary.excerpts[0].length > 50)
            }
          })
        })
      })
    })
  })
})

describe('library', () => {
  /**
   * @type {Library}
   */
  let library
  /**
   * @type {LibraryBook}
   */
  let book1
  /**
   * @type {LibraryBook}
   */
  let book2

  before(async () => {
    await libraryInit(logger)
    library = new Library()

    let index1 = new storiesIndex.StoriesIndex('https://host.tld', ['index1', 'i1'])

    let page1 = new IndexPage(
      index1.name, 
      1, 
      path.join(import.meta.dirname, 'resource/stories/index1/page-1/index.json')
    )
    let page1Stories = await loadText(page1.filePath).then(JSON.parse)

    let story1 = StorySummary.fromData(page1Stories[0])
    let story2 = StorySummary.fromData(page1Stories[1])
    
    let profile1 = await loadText(path.join(
      import.meta.dirname, 
      `resource/profiles/index1/story-142/Twain,-Mark_The-$30,000-Bequest,-and-Other-Stories_excerpt.txt.profile.json`
    ))
    .then(JSON.parse)
    .then((profileData) => new textProfile.TextProfile(profileData))

    book1 = new LibraryBook(library, story1, page1, profile1)
    book2 = new LibraryBook(library, story2, page1, undefined)
  })

  describe('#getTagLineageName', () => {
    it('can return a lineage name for any tag', () => {
      const namespace = 'test-lineage-name'

      let gen0 = RelationalTag.new(`${namespace}-gen0`)
      assert.strictEqual(getTagLineageName(gen0), gen0.name)

      let gen1 = RelationalTag.new(`${namespace}-gen1`)
      gen0.connect_to(gen1, TYPE_TO_TAG_CHILD)
      assert.strictEqual(getTagLineageName(gen1), `${gen0.name}.${gen1.name}`)
      assert.strictEqual(getTagLineageName(gen0), gen0.name)

      let gen2 = RelationalTag.new(`${namespace}-gen2`)
      gen1.connect_to(gen2, TYPE_TO_TAG_CHILD)

      let gen3 = RelationalTag.new(`${namespace}-gen3`)
      gen2.connect_to(gen3, TYPE_TO_TAG_CHILD)

      let gen4 = RelationalTag.new(`${namespace}-gen4`)
      gen3.connect_to(gen4, TYPE_TO_TAG_CHILD)
      // lineage exceeds library.TAG_LINEAGE_NAME_PARTS_MAX
      assert.notStrictEqual(getTagLineageName(gen4).split('.')[0], gen0.name)

      let genOne = RelationalTag.new(`${namespace}-gen-one`)
      genOne.connect_to(gen0, 'TO_TAG_UNDIRECTED')
      // genOne has no parent tag
      assert.strictEqual(getTagLineageName(genOne), genOne.name)
    })
  })

  describe('Library', () => {
    before(() => {
      [book1, book2].forEach((book) => library.addBook(book))
    })

    describe('#getBooks', () => {
      it('fetches all books without query', () => {
        /**
         * @type {LibraryBook[]}
         */
        let books = []

        for (let [book, tagConnections] of library.getBooks(Library.t)) {
          logger.info(
            book + ': '
            + tagConnections.map(
              (entTagConn) => {
                let str = getTagLineageName(entTagConn.target)
                if (entTagConn.weight !== null) {
                  str += '=' + entTagConn.weight
                }

                return str
              }
            ).join(', ')
          )

          books.push(book)
        }

        assert.strictEqual(
          // Currently, books are not tagged directly, since their member descriptors
          // are already tagged.
          books.filter((d) => d instanceof LibraryBook).length,
          books.length,
          'all return values should be instances of Library Book'
        )
        assert.strictEqual(
          books.filter((book) => book.profile?.difficulty !== undefined).length,
          1,
          'only 1 book has a profile.difficulty'
        )
      })
    })
  })

  describe('LibraryBook', () => {
    before(() => {
      logger.info('reset library')
      library = new Library()
    })

    it('handles unprofiled stories', () => {
      assert.strictEqual(library.books.size, 0)
      library.addBook(book2)
      assert.strictEqual(library.books.size, 1)

      assert.ok(
        !textProfile.Difficulty.tReadingLevel.connections.has(book2), 
        `book ${Library._getKey(book2)} without profile should not be connected to tag ${textProfile.Difficulty.tReadingLevel.name}`
      )
      // text-profile.topic.trout-competition
      assert.strictEqual(RelationalTag.get('trout-competition').connections.size, 0)
    })

    it('handles profiled stories', () => {
      library.addBook(book1)

      // text-profile.difficulty.years-of-education weighted connection
      let connYearsOfEducation = RelationalTag.get('years-of-education').connections.get(book1.profile.difficulty)
      assert.strictEqual(connYearsOfEducation.weight, book1.profile.difficulty.yearsOfEducation)

      // text-profile.topic.dreams-and-aspirations
      assert.strictEqual(book1.profile.topics[1].id, 'dreams-and-aspirations')
      RelationalTag.get('dreams-and-aspirations').connections.has(book1.profile.topics[1])
    })
  })

  describe('LibraryDescriptor implementations', () => {
    it('always have references to a library to which they belong', () => {
      /**
       * @type {LibraryDescriptor}
       */
      let ld
      for (ld of [
        book1, 
        book1.index, 
        book1.indexPage, 
        book1.profile, book1.profile.ideologies[0], book1.profile.difficulty, book1.profile.topics[0]
      ]) {
        /**
         * @type {LibraryDescriptor}
         */
        let root = ld
        while (root.parent !== undefined) {
          root = root.parent
        }

        assert.ok(root instanceof Library)
      }
    })

    it('have expected tag relationships', () => {
      for (let [a, b, d] of [
        // library has book
        [Library.t, LibraryBook.t, 1],
        // book has story, index-page, profile
        [LibraryBook.t, IndexPage.t, 1],
        [LibraryBook.t, StorySummary.t, 1],
        [LibraryBook.t, textProfile.TextProfile.t, 1],
        // library has index
        [storiesIndex.StoriesIndex.t, Library.t, 1],
        // index name belongs to page (and index)
        [IndexPage.t, storiesIndex.StoriesIndex.tName, 1],
        // and page belongs to index 
        [IndexPage.t, storiesIndex.StoriesIndex.t, 1], 
        // transitive property a--c = a--b + b--c
        [Library.t, textProfile.TextProfile.t, 2], // library--book--profile
        [StorySummary.tAuthorName, StorySummary.tTitle, 2], // author-name--story--title
        [StorySummary.tAuthorName, textProfile.Ideology.t, 4], //author-name--story--book--profile--ideology
      ]) {
        assert.strictEqual(
          RelationalTag.graph_distance(a, b), 
          d, 
          `graph distance from ${a.name} to ${b.name} should be ${d}`
        )
      }
    })

    it('are the only tagged entities', () => {
      [...RelationalTag._tagged_entities.keys()].forEach((ent) => {
        assert.ok(ent instanceof LibraryDescriptor)
      })
    })
  })
})