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
 * 
 * @returns {RegExp|undefined}
 */
export function compileRegexp(str) {
  if (str.startsWith('/') && str.endsWith('/')) {
    return new RegExp(str.substring(1, str.length-1))
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
