/**
 */

import * as dotenv from 'dotenv'
import OpenAI from 'openai'

const ENV_KEY_OPENAI_API_KEY = 'OPENAI_API_KEY' 

const OpenAIModel = {
  GPT_4: 'gpt-4o',
  GPT_4_MINI: 'gpt-4o-mini'
}
const OpenAIModerationModel = {
  TEXT_LATEST: 'text-moderation-latest'
}

let logger

export function init(parentLogger) {
  return new Promise(function(res, rej) {
    logger = parentLogger.child(
      {
        name: 'config'
      }
    )
    
    logger.debug('load env vars from .env')
    dotenv.config()
  
    // confirm env vars loaded
    const openaiApiKey = process.env[ENV_KEY_OPENAI_API_KEY]
    if (openaiApiKey == undefined) {
      rej(`missing env var ${ENV_KEY_OPENAI_API_KEY}`)
    }
    else {
      logger.info('loaded env vars')
      const openai = new OpenAI()
      logger.debug(
        'chat-models=%o moderation-models=%o', 
        OpenAIModel,
        OpenAIModerationModel
      )
      res({
        ai: openai, 
        chatModel: OpenAIModel.GPT_4_MINI, 
        maturityModel: OpenAIModerationModel.TEXT_LATEST
      })
    }
  })
}
