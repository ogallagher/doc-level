import assert from 'assert'
import pino from 'pino'
import * as textProfile from '../src/textProfile.js'
import * as messageSchema from '../src/messageSchema.js'

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