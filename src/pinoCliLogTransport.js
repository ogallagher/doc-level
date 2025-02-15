import pinoPretty from 'pino-pretty'
/**
 * @typedef {import('pino-pretty').PrettyStream} PrettyStream
 */

/**
 * @type {PrettyStream}
 */
let stdoutLogStream = pinoPretty({
  destination: process.stdout.fd,
  sync: false
})

export default () => stdoutLogStream

export function flushCliLogStream() {
  return new Promise((res) => {
    stdoutLogStream._flush(res)
  })
}
