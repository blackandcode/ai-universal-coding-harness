/**
 * @fileoverview Main CLI command runner.
 * Bridges argument parsing (parseCliArgs) and command execution (dispatchCliCommand) with top-level error formatting.
 */

import { parseCliArgs } from './cli/parser.js';
import { dispatchCliCommand } from './cli/dispatch.js';

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  try {
    const cmd = parseCliArgs(argv);
    return await dispatchCliCommand(cmd);
  } catch (e: unknown) {
    const errMessage = e instanceof Error ? e.message : String(e);
    console.error(`ERROR: ${errMessage}`);
    return 2;
  }
}
