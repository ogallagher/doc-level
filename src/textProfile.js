import { RelationalTag } from "relational_tags"
import { LibraryDescriptor } from './libraryDescriptor.js'
import { TYPE_TO_TAG_CHILD } from './library.js'
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
 * @returns {Promise<undefined>}
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

export class Maturity extends LibraryDescriptor {  
  static t = RelationalTag.new('maturity')
  // maturity types will be added on demand
  static tRestricted = RelationalTag.new('restricted')

  constructor(isRestricted=undefined, presents=[], absents=[], examples=[]) {
    super()
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

  static fromData({isRestricted, presents, absents, examples}) {
    return new Maturity(isRestricted, presents, absents, examples)
  }
  
  /**
   * @param {Maturity} other
   */
  append(other) {
    this.isRestricted = this.isRestricted || other.isRestricted
    this.presents = this.presents.concat(other.presents)
    this.absents = this.absents.concat(other.absents)
  }

  static initTags() {
    this.adoptTag(this.tRestricted)
  }

  setTags() {
    if (this.isRestricted) {
      Maturity.tRestricted.connect_to(this)
    }
    else {
      Maturity.tRestricted.disconnect_to(this)
    }
    /**
     * Tag for each maturity type.
     * @type {RelationalTag}
     */
    let mt
    for (let maturityType of this.presents) {
      mt = RelationalTag.get(maturityType)
      Maturity.adoptTag(mt)
      mt.connect_to(this)
    }

    for (let maturityType of this.absents) {
      mt = RelationalTag.get(maturityType)
      Maturity.adoptTag(mt)
      mt.disconnect_to(this)
    }

    // examples are not tags
  }

  toString() {
    return `${Maturity.name}[restricted=${this.isRestricted} presents=${this.presents.join(',')}]`
  }
}

/**
 * Reading difficulty.
 */
export class Difficulty extends LibraryDescriptor {
  static t = RelationalTag.new('difficulty')
  static tYearsOfEducation = RelationalTag.new('years-of-education')
  static tReadingLevel = RelationalTag.new('reading-level')
  static tDifficultWord = RelationalTag.new('difficult-word')

  constructor(yearsOfEducation=0, readingLevelName, reasons=[], difficultWords=[], difficultPhrases=[]) {
    super()

    /**
     * @type {number}
     */
    this.yearsOfEducation = yearsOfEducation
    /**
     * @type {string}
     */
    this.readingLevelName = readingLevelName
    this.reasons = reasons
    /**
     * @type {string[]}
     */
    this.difficultWords = difficultWords
    this.difficultPhrases = difficultPhrases
  }

  static fromData({yearsOfEducation, readingLevelName, reasons, difficultWords, difficultPhrases}) {
    return new Difficulty(yearsOfEducation, readingLevelName, reasons, difficultWords, difficultPhrases)
  }

  static initTags() {
    this.adoptTag(this.tYearsOfEducation)
    this.adoptTag(this.tReadingLevel)
    this.adoptTag(this.tDifficultWord)
  }

  setTags() {
    Difficulty.tYearsOfEducation.connect_to(this, undefined, this.yearsOfEducation)

    let tLevel = RelationalTag.get(this.readingLevelName)
    Difficulty.tReadingLevel.connect_to(tLevel, TYPE_TO_TAG_CHILD)
    tLevel.connect_to(this)

    // reasons are tags

    /**
     * @type {RelationalTag}
     */
    let tdw
    for (let word of this.difficultWords) {
      tdw = RelationalTag.get(word)
      Difficulty.tDifficultWord.connect_to(tdw)
      tdw.connect_to(this)
    }

    // difficult phrases are not tags
  }

  toString() {
    return `${Difficulty.name}[years-of-education=${this.yearsOfEducation} reading-level=${this.readingLevelName}]`
  }
}

export class Topic extends LibraryDescriptor {
  static t = RelationalTag.new('topic')

  constructor(id, examplePhrases=[]) {
    super()

    /**
     * @type {string}
     */
    this.id = id
    /**
     * @type {string[]}
     */
    this.examplePhrases = examplePhrases
  }

  static fromData({id, examplePhrases}) {
    return new Topic(id, examplePhrases)
  }

  static initTags() {
    // no child tags yet
  }

  setTags() {
    let tid = RelationalTag.get(this.id)
    Topic.adoptTag(tid)
    tid.connect_to(this)

    // example phrases are not tags
  }

  toString() {
    return `${Topic.name}[id=${this.id}]`
  }
}

export class Ideology extends LibraryDescriptor {
  static t = RelationalTag.new('ideology')
  static tPresence = RelationalTag.new('presence')

  constructor(id, presence, examplePhrases=[]) {
    super()

    /**
     * @type {string}
     */
    this.id = id

    /**
     * @type {number}
     */
    this.presence = presence

    /**
     * @type {string[]}
     */
    this.examplePhrases = examplePhrases
  }

  static fromData({id, presence, examplePhrases}) {
    return new Ideology(id, presence, examplePhrases)
  }

  static initTags() {
    this.adoptTag(this.tPresence)
  }

  setTags() {
    let tid = RelationalTag.get(this.id)
    Ideology.adoptTag(tid)
    tid.connect_to(this)

    Ideology.tPresence.connect_to(this, undefined, this.presence)

    // example phrases are not tags
  }

  toString() {
    return `${Ideology.name}[id=${this.id}]`
  }
}

export class TextProfile extends LibraryDescriptor {
  static t = RelationalTag.new('text-profile')

  /**
   * @param {{
   *  maturity?: Maturity,
   *  difficulty?: Difficulty,
   *  topics?: Topic[],
   *  ideologies?: Ideology[]
   * }|undefined} data Optional deserialized object.
   */
  constructor(data) {
    super()
    
    /**
     * @type {Maturity}
     */
    this.maturity
    this.setMaturity(Maturity.fromData(data?.maturity))
    /**
     * @type {Difficulty}
     */
    this.difficulty
    this.setDifficulty(Difficulty.fromData(data?.difficulty))
    /**
     * @type {Topic[]}
     */
    this.topics = []
    if (data?.topics !== undefined) {
      this.setTopics(data.topics.map((t) => Topic.fromData(t)))
    }
    /**
     * @type {Ideology[]}
     */
    this.ideologies = []
    if (data?.ideologies !== undefined) {
      this.setIdeologies(data.ideologies.map((i) => Ideology.fromData(i)))
    }
  }
  
  setMaturity(maturity) {
    this.maturity = maturity
    this.maturity.setParent(this)
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty
    this.difficulty.setParent(this)
  }

  setTopics(topics) {
    this.topics = topics
    this.topics.forEach((topic) => topic.setParent(this))
  }

  setIdeologies(ideologies) {
    this.ideologies = ideologies
    this.ideologies.forEach((ideology) => ideology.setParent(this))
  }

  static initTags() {
    this.adoptTag(Maturity.t)
    this.adoptTag(Difficulty.t)
    this.adoptTag(Topic.t)
    this.adoptTag(Ideology.t)
  }

  setTags() {
    this.maturity.setTags()
    this.difficulty.setTags()
    this.topics.forEach((t) => t.setTags())
    this.ideologies.forEach((i) => i.setTags())
  }
}
