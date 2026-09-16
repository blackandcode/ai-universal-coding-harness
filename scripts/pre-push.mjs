/**
 * @fileoverview Pre-push verification gate.
 *
 * Runs full repository verification (npm run verify) prior to git push.
 * Halts the push if any formatting, linting, typechecking, test, or package checks fail.
 */

import { spawnNpm } from './lib/npm-invoke.mjs';

console.log('[pre-push] Running full repository verification before pushing to origin...');

const result = spawnNpm(['run', 'verify'], {
  stdio: 'inherit'
});

if (result.error || result.status !== 0) {
  console.error('\n================================================================');
  console.error('[pre-push] PRE-PUSH VERIFICATION FAILED! Halting push to origin.');
  console.error('[pre-push] Please fix the errors listed above before pushing.');
  console.error('================================================================\n');
  process.exit(result.status ?? 1);
}

console.log('\n[pre-push] Pre-push verification passed successfully. Proceeding with push.\n');
process.exit(0);
