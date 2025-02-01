import assert from 'assert'
import pino from 'pino'
import path from 'path'
import * as textProfile from '../src/textProfile.js'
import * as messageSchema from '../src/messageSchema.js'
import { formatString } from '../src/stringUtil.js'
import { loadPrompt, loadText, init as readerInit, setPromptDir, parseHtml } from '../src/reader.js'
import * as storiesIndex from '../src/storiesIndex.js'

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
    /**
     * @type {Map}
     */
    let indexes

    this.beforeAll(function() {
      asi = new storiesIndex.StoriesIndex('https://host.tld', ['abstract0'])
      mji = new storiesIndex.MunjangStoriesIndex()

      return storiesIndex.init(logger)
      .then((storiesIndexes) => {
        indexes = storiesIndexes
      })
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
        assert.ok(indexes.indexOf(asi.name) > 0)
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