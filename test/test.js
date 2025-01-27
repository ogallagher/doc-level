import assert from 'assert'
import pino from 'pino'
import path from 'path'
import * as textProfile from '../src/textProfile.js'
import * as messageSchema from '../src/messageSchema.js'
import { formatString } from '../src/stringUtil.js'
import { loadPrompt, loadText, init as readerInit, setPromptDir } from '../src/reader.js'
import * as storiesIndex from '../src/storiesIndex.js'

const logger = pino(
  {
    name: 'test-app',
    level: 'warn'
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
})

describe('storiesIndex', function() {
  describe('#init', function() {
    it('passes with parent logger', function() {
      return storiesIndex.init(logger)
    })
  })

  describe('StoriesIndex', function() {
    let asi, mji
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
  })
})