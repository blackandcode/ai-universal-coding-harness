/**
 * @fileoverview CLI executable binary entry point.
 * Invokes runCli and sets the process exit code or logs uncaught fatal errors.
 */

import { runCli } from './cli-main.js';

runCli()
  .then((code) => {
    if (code !== 0) {
      process.exitCode = code;
    }
  })
  .catch((e: unknown) => {
    const errMessage = e instanceof Error ? e.message : String(e);
    console.error(`ERROR: ${errMessage}`);
    process.exit(2);
  });
