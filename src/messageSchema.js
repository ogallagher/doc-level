import { z } from 'zod'

let logger

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
 */ 
export let CustomMaturityTypes = z.object({
  maturityTypes: z.array(z.object({
    id: z.string(),
    presence: z.number()
  }))
})
CustomMaturityTypes.name = 'CustomMaturityTypes'