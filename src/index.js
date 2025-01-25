/**
 * doc-level entrypoint.
 */ 

import * as config from './config.js'
import * as reader from './reader.js'
import * as tp from './textProfile.js'
import * as ms from './messageSchema.js'
import pino from 'pino'

const logger = pino(
  {
    name: 'doc-level',
    level: 'debug'
  }
)

Promise.all([
  tp.init(logger),
  ms.init(logger)
])
.then(() => {
  return config.init(logger)
})
.then(
  ({ ai, chatModel, maturityModel }) => {
    logger.error(chatModel)
    logger.info(
      'config.init passed. ai.baseUrl=%s chatModel=%s maturityModel=%s', 
      ai.baseURL, 
      chatModel,
      maturityModel
    )
  
    return reader.init(logger, ai, chatModel, maturityModel)
  },
  (err) => {
    logger.error(err)
  }
)
.then(
  () => {
    logger.info('reader.init passed')
    
    let text = `Let's see if you find any fucking shit curse words in my message.`
    logger.info('get maturity of %s', text)
    let ctx = new reader.Context(text, new tp.TextProfile())
    
    return reader.getMaturity(ctx)
    .then((maturity) => {
      ctx.profile.setMaturity(maturity)
      logger.info('profile=%o', ctx.profile)
    })
  },
  (err) => {
    logger.error(err)
  }
)
.then(
  () => {
    logger.info('reader.get method passed')
  },
  (err) => {
    logger.error(err)
  }
)

