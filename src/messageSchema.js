/**
 * Natural language model structured response schemas.
 */

import { z } from 'zod'
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
 *  authorName: string,
 *  title: string,
 *  publishDate: Date,
 *  viewCount: number,
 *  url: string,
 *  excerpts: string[],
 *  id: string
 * }} Story Summary story info.
 * 
 * Not currently derived from a language model prompt, but rather explicitly parsed from a downloaded stories
 * index/listing page.
 */
/**
 * @typedef {{
 *  stories: Story[]
 * }} ExtractStoriesResponse
 */
