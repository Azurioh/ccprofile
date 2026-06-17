// @ts-check

/** Error type that the CLI maps to a `ccprofile: <msg>` stderr line + exit 1. */
export class CcprofileError extends Error {}

/** @param {string} msg */
export function info(msg) {
  process.stdout.write(`${msg}\n`);
}

/** @param {string} msg */
export function warn(msg) {
  process.stderr.write(`${msg}\n`);
}

/** @param {string} msg @returns {never} */
export function die(msg) {
  throw new CcprofileError(msg);
}
