import sanitizeFilename from 'sanitize-filename'

/**
 * Taken from https://stackoverflow.com/a/4673436/10200417
 */
export function formatString(str, ...args) {
  return str.replace(/{(\d+)}/g, function(match, number) { 
    return typeof args[number] != 'undefined'
    ? args[number]
    : match
  })
}

/**
 * Taken from https://stackoverflow.com/a/3561711/10200417
 * 
 * @param {string} str 
 * @returns {string}
 */
export function regexpEscape(str) {
  return str.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

/**
 * Convert regexp string literal to RegExp instance.
 * 
 * @param {string} str 
 * @param {boolean} ignoreCase Whether expression is case insensitive. Default `true`.
 * 
 * @returns {RegExp|undefined}
 */
export function compileRegexp(str, ignoreCase=true) {
  if (str.startsWith('/') && str.endsWith('/')) {
    return new RegExp(str.substring(1, str.length-1), ignoreCase ? 'i' : undefined)
  }
}

/**
 * Format given regular expression as a string.
 * 
 * @param {RegExp|string} regexp 
 * @param {boolean} omitFlags Whether to omit regexp flags. Default `true`.
 */
export function formatRegexp(regexp, omitFlags=true) {
  if (regexp instanceof RegExp) {
    let str = regexp.toString()

    if (omitFlags) {
      return str.substring(0, str.indexOf('/', 1) + 1)
    }
    else {
      return str
    }
  }
  else {
    return regexp
  }
}

export function fileString(str) {
  return sanitizeFilename(str)
  .replace(/\s+/g, '-')
  .replace(/[\(\)]/g, '')
}

export function dateToString(date) {
  return date.toISOString().substring(0, 10)
}
