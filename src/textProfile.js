/**
 * @typedef {import('pino').Logger} Logger
 */

/**
 * @type {Logger}
 */
let logger

export const MATURITY_TYPE_PROFANE = 'profanity'

/**
 * Init module logger.
 * 
 * @param {Logger} parentLogger
 */
export function init(parentLogger) {
  return new Promise(function(res) {
    logger = parentLogger.child(
      {
        name: 'text-profile'
      }
    )
    
    logger.debug('end init')
    res()
  })
}

export class Maturity {  
  constructor(isRestricted=undefined, presents=[], absents=[], examples=[]) {
   /**
    * @type {boolean?}
    */ 
    this.isRestricted = isRestricted
    /**
     * @type {string[]}
     */
    this.presents = presents
   /**
    * @type {string[]}
    */ 
    this.absents = absents
    /**
     * @type {string[]}
     */
    this.examples = examples
  }
  
  /**
   * @param {Maturity} other
   */
  append(other) {
    this.isRestricted = this.isRestricted || other.isRestricted
    this.presents = this.presents.concat(other.presents)
    this.absents = this.absents.concat(other.absents)
  }
}

/**
 * Reading difficulty.
 */
export class Difficulty {
  constructor(yearsOfEducation=0, readingLevelName, reasons=[], difficultWords=[], difficultPhrases=[]) {
    /**
     * @type {number}
     */
    this.yearsOfEducation = yearsOfEducation
    /**
     * @type {string}
     */
    this.readingLevelName = readingLevelName
    this.reasons = reasons
    this.difficultWords = difficultWords
    this.difficultPhrases = difficultPhrases
  }
}

export class Topic {
  constructor(id, examplePhrases=[]) {
    /**
     * @type {string}
     */
    this.id = id
    /**
     * @type {string[]}
     */
    this.examplePhrases = examplePhrases
  }
}

export class TextProfile {
  constructor() {
    /**
     * @type {Maturity}
     */
    this.maturity = new Maturity()
    this.difficulty = new Difficulty()
    /**
     * @type {Topic[]}
     */
    this.topics = []
  }
  
  setMaturity(maturity) {
    this.maturity = maturity
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty
  }

  setTopics(topics) {
    this.topics = topics
  }
}
