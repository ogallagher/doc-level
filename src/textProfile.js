let logger

export const MATURITY_TYPE_PROFANE = 'profanity'

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
  constructor(isRestricted=undefined, presents=[], absents=[]) {
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
  }
  
  append(other) {
    this.isRestricted = this.isRestricted || other.isRestricted
    this.presents = this.presents.concat(other.presents)
    this.absents = this.absents.concat(other.absents)
  }
}

export class TextProfile {
  constructor() {
    this.maturity = new Maturity()
  }
  
  setMaturity(maturity) {
    this.maturity = maturity
  }
}
