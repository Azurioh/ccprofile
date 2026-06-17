#!/usr/bin/env node
import { run } from '../src/cli.js';

run(process.argv.slice(2)).then(
  (code) => process.exit(code ?? 0),
  (err) => {
    process.stderr.write(`ccprofile: ${err?.stack ?? err}\n`);
    process.exit(1);
  }
);
