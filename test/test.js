import assert from 'assert'
import pino from 'pino'
import path from 'path'
import { RelationalTag as rt } from 'relational_tags'
import { TYPE_TO_TAG_CHILD } from '../src/config.js'
import * as textProfile from '../src/textProfile.js'
import * as messageSchema from '../src/messageSchema.js'
import { formatString } from '../src/stringUtil.js'
import { loadPrompt, loadText, init as readerInit, setPromptDir, parseHtml, reduceStory, loadProfile, getProfilePath } from '../src/reader.js'
import { init as siInit, getStoriesIndex } from '../src/storiesIndex/index.js'
import { StoriesIndex } from '../src/storiesIndex/storiesIndex.js'
import { MunjangStoriesIndex } from '../src/storiesIndex/MunjangStoriesIndex.js' 
import { getTagLineageName, Library, LibraryBook, init as libraryInit } from '../src/library.js'
import { IndexPage } from '../src/indexPage.js'
import { StorySummary } from '../src/storySummary.js'
import { LibraryDescriptor } from '../src/libraryDescriptor.js'
import { resolvePageVar, resolveStoryVar, init as mainInit } from '../src/main.js'

const logger = pino(
  {
    name: 'test-app',
    level: 'debug'
  }
)

await libraryInit(logger)
await siInit(logger)
await mainInit(logger)

describe('textProfile', function() {
  describe('#init', function() {
    it('passes with parent logger', function() {
      return textProfile.init(logger)
    })
    
    it('fails without parent logger', function() {
      assert.rejects(textProfile.init())
    })
  })

  describe('TextProfile', () => {
    describe('#getSerializable', () => {
      before(async () => {
        await readerInit(logger)
      })

      it('enables JSON.stringify of a profile instance', async () => {
        let profile = new textProfile.TextProfile(
          await loadText('test/resource/profiles/index1/story-restore2004_223748051577/피터정_현역가왕2---박서진-vs-강문경-신유-vs-진해성---정말-대박-무대였다!_excerpt.txt.profile.json')
          .then(JSON.parse)
        )

        let serialized = JSON.stringify(profile, profile.getSerializable)
        assert.strictEqual(profile.filePath, JSON.parse(serialized).filePath)
      })
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

  describe('#loadProfile', function() {
    it('loads a profile when available', function() {
      return getProfilePath('142', 'test/resource/profiles')
      .then(loadProfile)
      .then((profile) => {
        assert.ok(profile instanceof textProfile.TextProfile)
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
      return siInit(logger)
    })
  })

  describe('StoriesIndex', function() {
    /**
     * @type {StoriesIndex}
     */
    let asi
    /**
     * @type {MunjangStoriesIndex}
     */
    let mji

    before(async function() {
      asi = new StoriesIndex('https://host.tld', ['abstract0'])
      mji = getStoriesIndex('문장웹진')
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
        assert.ok(getStoriesIndex(asi.name) !== undefined)
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
  /**
   * @type {LibraryBook}
   */
  let bookA
  /**
   * @type {LibraryBook}
   */
  let bookB
  /**
   * @type {LibraryBook}
   */
  let bookC

  before(async () => {
    library = new Library()

    let index1 = new StoriesIndex('https://host.tld', ['index1', 'i1'])

    let page1 = new IndexPage(
      index1.name, 
      1, 
      path.join(import.meta.dirname, 'resource/stories/index1/page-1/index.json')
    )
    /**
     * @type {StorySummary[]}
     */
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
    bookA = new LibraryBook(
      library, 
      StorySummary.fromData(page1Stories.filter((s) => s.id === 'aa')[0]),
      page1,
      undefined
    )
    logger.debug('bookA=%s', bookA)
    library.addBook(bookA)
    bookB = new LibraryBook(
      library, 
      StorySummary.fromData(page1Stories.filter((s) => s.id === 'bb')[0]),
      page1,
      undefined
    )
    library.addBook(bookB)
    bookC = new LibraryBook(
      library, 
      StorySummary.fromData(page1Stories.filter((s) => s.id === 'cc')[0]),
      page1,
      undefined
    )
    library.addBook(bookC)
  })

  describe('#getTagLineageName', () => {
    it('can return a lineage name for any tag', () => {
      const namespace = 'test-lineage-name'

      let gen0 = rt.new(`${namespace}-gen0`)
      assert.strictEqual(getTagLineageName(gen0), gen0.name)

      let gen1 = rt.new(`${namespace}-gen1`)
      gen0.connect_to(gen1, TYPE_TO_TAG_CHILD)
      assert.strictEqual(getTagLineageName(gen1), `${gen0.name}.${gen1.name}`)
      assert.strictEqual(getTagLineageName(gen0), gen0.name)

      let gen2 = rt.new(`${namespace}-gen2`)
      gen1.connect_to(gen2, TYPE_TO_TAG_CHILD)

      let gen3 = rt.new(`${namespace}-gen3`)
      gen2.connect_to(gen3, TYPE_TO_TAG_CHILD)

      let gen4 = rt.new(`${namespace}-gen4`)
      gen3.connect_to(gen4, TYPE_TO_TAG_CHILD)
      // lineage exceeds library.TAG_LINEAGE_NAME_PARTS_MAX
      assert.notStrictEqual(getTagLineageName(gen4).split('.')[0], gen0.name)

      let genOne = rt.new(`${namespace}-gen-one`)
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

      it('handles negative conditions', () => {
        // -t
        /**
         * @type {LibraryBook[]}
         */
        let res = [
          ...library.getBooks(rt.get('aaron abalone'), undefined, undefined, true, false)
        ].map(([book, _pathToBook]) => book)
        assert.strictEqual(res.indexOf(bookA), -1)
        assert.strictEqual(res.length, 4)

        // -q
        res = [
          ...library.getBooks(undefined, /.+a-or-b/, undefined, false, true)
        ].map(([book, _pathToBook]) => book)
        assert.strictEqual(res.indexOf(bookA), -1)
        assert.strictEqual(res.indexOf(bookB), -1)
        assert.strictEqual(res.length, 3)

        // -t -q
        res = [
          ...library.getBooks(rt.get('carolina chezer'), /.+a-or-b/, undefined, true, true)
        ].map(([book, _pathToBook]) => book)
        assert.strictEqual(res.indexOf(bookA), -1)
        assert.strictEqual(res.indexOf(bookB), -1)
        assert.strictEqual(res.indexOf(bookC), -1)
        assert.strictEqual(res.length, 2)

        // +t -q
        res = [
          ...library.getBooks(rt.get('author-name'), /.+a-or-b/, undefined, false, true)
        ].map(([book, _pathToBook]) => book)
        assert.strictEqual(res.indexOf(bookA), -1)
        assert.strictEqual(res.indexOf(bookB), -1)
        assert.strictEqual(res.length, 3)

        // -t +q
        res = [
          ...library.getBooks(rt.get('2000-01-01'), /.+a-or-b/, undefined, true, false)
        ].map(([book, _pathToBook]) => book)
        assert.notStrictEqual(res.indexOf(bookB), -1)
        assert.strictEqual(res.length, 1)
      })
    })

    describe('#addBook', () => {
      it('replaces existing books with the same key', () => {
        assert.ok(library.has(book1))
        assert.ok(book1.profile !== undefined)
        assert.ok(library.has(book2))
        let bookCountBefore = library.books.size

        // tags before
        let booksBefore = [
          ...library.getBooks(StorySummary.tAuthorName, 'twain, mark', 'asc')
        ].map(([book, _pathToBook]) => book)
        assert.strictEqual(booksBefore.length, 1)
        assert.strictEqual(booksBefore[0], book1)

        let book3 = new LibraryBook(
          library, 
          book1.story, 
          book1.indexPage
        )
        assert.strictEqual(Library._getKey(book1), Library._getKey(book3))
        assert.ok(book1.profile !== undefined)

        library.addBook(book3)
        let bookCountAfter = library.books.size
        assert.ok(library.has(book3))
        assert.ok(library.has(book1))
        assert.strictEqual(bookCountBefore, bookCountAfter)

        assert.strictEqual(
          library.books.get(Library._getKey(book3)),
          book3
        )
        assert.notStrictEqual(
          library.books.get(Library._getKey(book1)),
          book1
        )

        // tags after
        let booksAfter = [
          ...library.getBooks(StorySummary.tAuthorName, 'twain, mark', 'asc')
        ].map(([book, _pathToBook]) => book)
        assert.strictEqual(booksAfter.length, 1)
        assert.strictEqual(booksAfter[0], book3)
        assert.notStrictEqual(booksAfter[0], book1)
      })
    })

    describe('#execSearchExpression', () => {
      it('handles single conditions', () => {
        // publish-date.2000-01-01
        let searchExpr = `t == '2000-01-01'`
        let res = [...library.execSearchExpression(searchExpr, 'asc')]
        assert.strictEqual(res.length, 1)
        assert.strictEqual(res[0][0].story.id, 'aa')
      })

      it('handles composite conditions', () => {
        // publish-date in year 2000
        let searchExpr = `t == 'publish-date' ^ q == '/2000-.+/'`
        let res = [...library.execSearchExpression(searchExpr, 'asc')]
        assert.strictEqual(res.length, 3)
        res.forEach(([book, _bookPath]) => {
          assert.strictEqual(book.story.publishDate.getUTCFullYear(), 2000)
        })

        // handle redundant nested groups
        searchExpr = `((((t == 'publish-date'))) ^ ((q) == ('/2000-.+/')))`
        res = [...library.execSearchExpression(searchExpr, 'asc')]
        assert.strictEqual(res.length, 3)
        res.forEach(([book, _bookPath]) => {
          assert.strictEqual(book.story.publishDate.getUTCFullYear(), 2000)
        })
      })

      it('handles AND/intersection set operation', () => {
        let searchExpr = `t == 'publish-date' ^ q == '/2000-.+/' && t == 'title' ^ q == '/.+a-or-b/'`
        let res = [...library.execSearchExpression(searchExpr, 'asc')]
        assert.strictEqual(res.length, 2)
        res.forEach(([book, _bookPath]) => {
          assert.strictEqual(book.story.publishDate.getUTCFullYear(), 2000)
          assert.ok(book.story.title.endsWith('a-or-b'))
        })
      })

      it('handles OR/union set operation', () => {
        let searchExpr = `t == 'publish-date' ^ q == '/2000-01.+/' || t == 'publish-date' ^ q == '/2000-02.+/'`
        let res = [...library.execSearchExpression(searchExpr, 'asc')]
        assert.strictEqual(res.length, 2)
        res.forEach(([book, _bookPath]) => {
          assert.strictEqual(book.story.publishDate.getUTCFullYear(), 2000)
          assert.notStrictEqual(book.story.publishDate.getUTCMonth(), 3)
        })
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
      assert.strictEqual(rt.get('trout-competition').connections.size, 0)
    })

    it('handles profiled stories', () => {
      library.addBook(book1)

      // text-profile.difficulty.years-of-education weighted connection
      let connYearsOfEducation = rt.get('years-of-education').connections.get(book1.profile.difficulty)
      assert.strictEqual(connYearsOfEducation.weight, book1.profile.difficulty.yearsOfEducation)

      // text-profile.topic.dreams-and-aspirations
      assert.strictEqual(book1.profile.topics[1].id, 'dreams-and-aspirations')
      rt.get('dreams-and-aspirations').connections.has(book1.profile.topics[1])
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
        [StoriesIndex.t, Library.t, 1],
        // index name belongs to page (and index)
        [IndexPage.t, StoriesIndex.tName, 1],
        // and page belongs to index 
        [IndexPage.t, StoriesIndex.t, 1], 
        // transitive property a--c = a--b + b--c
        [Library.t, textProfile.TextProfile.t, 2], // library--book--profile
        [StorySummary.tAuthorName, StorySummary.tTitle, 2], // author-name--story--title
        [StorySummary.tAuthorName, textProfile.Ideology.t, 4], //author-name--story--book--profile--ideology
      ]) {
        assert.strictEqual(
          rt.graph_distance(a, b), 
          d, 
          `graph distance from ${a.name} to ${b.name} should be ${d}`
        )
      }
    })

    it('are the only tagged entities', () => {
      [...rt._tagged_entities.keys()].forEach((ent) => {
        assert.ok(ent instanceof LibraryDescriptor)
      })
    })
  })
})

describe ('entrypoint cli opts', () => {
  describe('variable expressions', () => {
    const index1 = new StoriesIndex(
      'https://host.tld', ['index1', 'i1'], 1, 5
    )

    describe('#resolvePageVar', () => {
      it('handles both contained and spilled page numbers', async () => {
        // first as 1 ignores previous
        let pageNumber = await resolvePageVar('@first', -1, index1.name)
        assert.strictEqual(pageNumber, index1.pageNumberMin)

        // next as 0 is below min
        pageNumber = await resolvePageVar('@next', -1, index1.name)
        assert.strictEqual(pageNumber, Number.NEGATIVE_INFINITY)

        // index is contained
        pageNumber = await resolvePageVar('@1', -1, index1.name)
        assert.strictEqual(pageNumber, await resolvePageVar('1', -5, index1.name))

        // next as 6 is above max
        pageNumber = await resolvePageVar('@next', 5, index1.name)
        assert.strictEqual(pageNumber, Number.POSITIVE_INFINITY)
      })
    })

    describe('#resolveStoryVar', () => {
      it('handles both contained and spilled story array indexes', async () => {
        const pageLength = 5
        const pagePath = 'test/resource/stories/index1/page-1/index.json'
        const storyIds = [
          '142',
          'restore2004_223748051577',
          'aa', 'bb', 'cc'
        ]

        // first ignores previous
        let story = (await resolveStoryVar('@first', 'missing', pagePath)).story
        assert.strictEqual(story.id, storyIds[0])

        // next as 0 is contained
        story = (await resolveStoryVar('@next', 'missing', pagePath)).story
        assert.strictEqual(story.id, storyIds[0])

        // index -1 is below min
        story = (await resolveStoryVar('@-1', 'missing', pagePath)).story
        assert.strictEqual(story, Number.NEGATIVE_INFINITY)

        // index is contained
        story = (await resolveStoryVar('@1', pageLength * 10, pagePath)).story
        assert.strictEqual(story.id, storyIds[1])

        // next is contained
        story = (await resolveStoryVar('@next', '142', pagePath)).story
        assert.strictEqual(story.id, storyIds[1])

        // next is above max
        story = (await resolveStoryVar('@next', storyIds[pageLength-1], pagePath)).story
        assert.strictEqual(story, Number.POSITIVE_INFINITY)
      })
    })
  })
})