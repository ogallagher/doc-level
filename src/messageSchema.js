/**
 * Natural language model structured response schemas.
 */

import { z } from 'zod'
import { StorySummary } from './storySummary.js'

/**
 * @typedef {import('pino').Logger} Logger
 */
/**
 * @typedef {z.ZodObject} MessageSchema
 * @property {string} name
 */

/**
 * @type {Logger}
 */
let logger

/**
 * Init module logger.
 * 
 * @param {Logger} parentLogger
 */
export function init(parentLogger) {
  return new Promise(function(res) {
    logger = parentLogger.child(
      {
        name: 'message-schema'
      }
    )
    
    logger.debug('end init')
    res()
  })
}

/**
 * Detect presence of custom maturity indicators (ex. profanity/curse words).
 * @type {MessageSchema}
 */ 
export let CustomMaturityTypes = z.object({
  maturityTypes: z.array(z.object({
    id: z.string(),
    presence: z.number(),
    examples: z.array(z.string())
  }))
})
CustomMaturityTypes.name = 'CustomMaturityTypes'
/**
 * @typedef {{
 *  maturityTypes: {
 *    id: string,
 *    presence: number,
 *    examples: string[]
 *  }[]
 * }} CustomMaturityTypesResponse
 */

export let ReadingDifficulty = z.object({
  yearsOfEducation: z.number(),
  readingLevelName: z.string(),
  reasons: z.array(z.string()),
  difficultWords: z.array(z.string()),
  difficultPhrases: z.array(z.string())
})
ReadingDifficulty.name = 'ReadingDifficulty'
/**
 * @typedef {{
 *  yearsOfEducation: number,
 *  readingLevelName: string,
 *  reasons: string[],
 *  difficultWords: string[],
 *  difficultPhrases: string[]
 * }} ReadingDifficultyResponse
 */

export let Topics = z.object({
  topics: z.array(z.object({
    id: z.string(),
    examples: z.array(z.string())
  }))
})
Topics.name = 'Topics'
/**
 * @typedef {{
 *  topics: {
 *    id: string,
 *    examples: string[]
 *  }[]
 * }} TopicsResponse
 */

export let Ideologies = z.object({
  ideologies: z.array(z.object({
    id: z.string(),
    presence: z.number(),
    examples: z.array(z.string())
  }))
})
Ideologies.name = 'Ideologies'
/**
 * @typedef {{
 *  ideologies: {
 *    id: string,
 *    presence: number,
 *    examples: string[]
 *  }[]
 * }} IdeologiesResponse
 */

export let Stories = z.object({
  stories: z.array(z.object({
    authorName: z.string(),
    title: z.string(),
    publishDate: z.string(),
    viewCount: z.number(),
    url: z.string()
  }))
})
Stories.name = 'Stories'

/**
 * @typedef {{
 *  stories: StorySummary[]
 * }} ExtractStoriesResponse
 * 
 * Note this does not technically contain `StorySummary` instances, but rather raw objects with the same
 * attributes.
 */
