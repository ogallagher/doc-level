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

export function fileString(str) {
  return sanitizeFilename(str)
  .replace(/\s+/g, '-')
}
