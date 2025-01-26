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
