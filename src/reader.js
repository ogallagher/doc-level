/**
 * Read texts and provide analysis.
 */

import { Maturity, TextProfile, MATURITY_TYPE_PROFANE } from './textProfile.js'
import { CustomMaturityTypes } from './messageSchema.js'
import { zodResponseFormat } from 'openai/helpers/zod'

let logger
/**
 * AI language model interface.
 */ 
let _ai
/**
 * Language model identifier.
 * 
 * @type {String}
 */  
let _chatModel
let _maturityModel

export function init(parentLogger, ai, chatModel, maturityModel) {
  return new Promise(function(res, rej) {
    logger = parentLogger.child(
      {
        name: 'reader'
      }
    )
    
    _ai = ai
    _chatModel = chatModel
    _maturityModel = maturityModel
  
    logger.debug('end init')
    res()
  })
}

export class Context {
  constructor(text, profile) {
    this.text = text
    this.profile = profile
  }
}

function getChatResponse(instructions, request, responseFormat) {
  return new Promise(function(res, rej) {
    logger.debug('call _ai.chat.completions')
    _ai.chat.completions.create({
      model: _chatModel,
      store: false,
      max_completion_tokens: null,
      n: 1,
      user: 'anonymous',
      response_format: zodResponseFormat(responseFormat, responseFormat.name),
      messages: [
        {
          // priority and contextual instructions
          role: 'developer',
          content: instructions
        },
        {
          // request
          role: 'user', 
          content: request
        }
      ]
    })
    .then(
      (completion) => {
        let response = completion.choices[0].message
        if(response.refusal) {
          logger.error('chat model refused to answer as requested')
          rej(filterAIError(completion.choices[0]))
        }
        else {
          try {
            res(JSON.parse(response.content))
          }
          catch (err) {
            logger.error('unable to parse chat response=%o', response)
            rej(err)
          }
        }
      },
      (err) => {
        rej(filterAIError(err))
      }
    )
  })
}

function filterAIError(err) {
  delete err.headers
  delete err.error
  return err
}

/**
 * Determine estimated maturity/offensiveness using OpenAI moderation model.
 * Since this does not account for curse words (offensive language not
 * directly targeted at anyone), we compensate with a separate chat prompt.
 */
export function getMaturity(ctx) {  
  return Promise.all([
    // moderations
    new Promise(function(res, rej) {
      logger.debug('call _ai.moderations')
      _ai.moderations.create({
        model: _maturityModel,
        store: false,
        input: ctx.text
      })
      .then(
        (moderation) => {
          const result = moderation.results[0]

          let presents = [], absents = []
          Object.entries(result.categories).map(([category, isPresent]) => {
            (isPresent ? presents : absents).push(category)
          })
          res(new Maturity(
            result.flagged,
            presents,
            absents
          ))
        },
        (err) => {
          rej(filterAIError(err))
        }
      )
    }),
    // custom
    getChatResponse(
      (
        `You are detecting the presence of the following types of mature `
        + `content, each having an id and description: (id="${MATURITY_TYPE_PROFANE}" `
        + `description="offensive language, curse words"). `
        + `For each type, determine if the given text includes it on a scale `
        + `of 0 to 1. This value is called "presence". `
        + `Return an array of these maturity type presences.`
      ),
      ctx.text,
      CustomMaturityTypes
    )
    .then(
      (maturityTypesResponse) => {
        let presents = [], absents = []
        try {
          maturityTypesResponse.maturityTypes.map(({ id, presence }) => {
            (presence > 0.5 ? presents : absents).push(id)
          })
        
          return new Maturity(
            presents.length > 0,
            presents,
            absents
          )
        }
        catch (err) {
          logger.error(
            'unable to parse maturityTypesResponse=%o', 
            maturityTypesResponse
          )
          throw err
        }
      }
    )
  ])
  .then(
    ([m1, m2]) => {
      logger.info('maturity-moderations=%o', m1)
      logger.info('maturity-custom=%o', m2)
      m1.append(m2)
      return m1
    },
    (err) => {
      throw err
    }
  )
}

export function getDifficulty(ctx) {
  
}

export function getVocabularyNovelty(ctx) {
  
}

export function getPoliticalBias(ctx) {
  
}

export function getCategories(ctx) {
  
}