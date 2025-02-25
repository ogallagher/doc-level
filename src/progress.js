import { MultiBar, Presets, SingleBar } from 'cli-progress'
/**
 * @typedef {import('pino').Logger} Logger
 */

const PROG_BAR = 'bar'
const PROG_NAME = 'name'
const PROG_VALUE = 'value'
const PROG_TOTAL = 'total'
const PROG_ETA = 'eta'

/**
 * @type {Logger}
 */
let logger
/**
 * @type {Map<MultiBar, function>}
 */
let processExitHandlers = new Map()

/**
 * 
 * @param {Logger} parentLogger 
 */
export async function init(parentLogger) {
  logger = parentLogger.child({
    name: 'progress'
  })

  return logger
}

/**
 * @returns {MultiBar}
 */
export function start() {
  logger.debug('start multibar')
  const bars = new MultiBar(
    {
      clearOnComplete: false,
      stopOnComplete: false,
      forceRedraw: true,
      hideCursor: true,
      format: `{${PROG_BAR}} | {${PROG_NAME}} | {${PROG_VALUE}}/{${PROG_TOTAL}} | {${PROG_ETA}}s`,
      barsize: 10,
      align: 'left'
    },
    Presets.rect
  )

  // ensure that user access to console is restored if early quit
  logger.debug('add multibar process.exit handler')
  const processExitHandler = () => {
    stop(bars)
  }
  processExitHandlers.set(bars, processExitHandler)
  process.on('exit', processExitHandler)

  return bars
}

/**
 * @param {MultiBar} bars 
 * @param {string} name
 * 
 * @returns {SingleBar}
 */
export function addBar(bars, name, total) {
  logger.debug('add bar %s[total=%s]', name, total)
  const bar = bars.create(
    total, 
    0, 
    Object.fromEntries([
      [PROG_NAME, name]
    ])
  )

  return bar
}

/**
 * Log a message to console while progress bars are still active.
 * 
 * @param {MultiBar} bars
 * @param {string} message 
 */
export function log(bars, message) {
  bars.log(message + '\n')
}

/**
 * End given set of progress bars and restore user access to console.
 * 
 * @param {MultiBar} bars 
 */
export function stop(bars) {
  logger.debug('stop multibar')
  bars.stop()

  const processExitHandler = processExitHandlers.get(bars)
  if (processExitHandler !== undefined) {
    logger.debug('delete multibar process.exit handler')
    process.off('exit', processExitHandler)
    processExitHandlers.delete(bars)
  }
}
