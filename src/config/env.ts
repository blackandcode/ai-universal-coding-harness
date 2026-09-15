/**
 * @fileoverview Environment variable parsing and mapping for configuration.
 * Normalizes both AI_HARNESS_* and legacy AI_STAGE_* environment variables into camelCase configuration.
 */

/**
 * Parses and maps environment variables into a partial configuration object.
 *
 * @param env - Process environment dictionary to read (defaults to process.env)
 * @returns Partial configuration record with camelCase property keys
 */
export function envLayer(env: NodeJS.ProcessEnv = process.env): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (key: string, ...values: (string | undefined)[]) => {
    const val = values.find((v) => v !== undefined && v !== '');
    if (val !== undefined) out[key] = val;
  };

  set('executorHarness', env.AI_HARNESS_EXECUTOR_HARNESS, env.AI_STAGE_EXECUTOR_HARNESS);
  set('reviewerHarness', env.AI_HARNESS_REVIEWER_HARNESS, env.AI_STAGE_REVIEWER_HARNESS);
  set('permissionMode', env.AI_HARNESS_PERMISSION_MODE, env.AI_STAGE_PERMISSION_MODE);
  set('permissionsFile', env.AI_HARNESS_PERMISSIONS_FILE, env.AI_STAGE_PERMISSIONS_FILE);
  set('qualityCommand', env.AI_HARNESS_QUALITY_COMMAND, env.AI_STAGE_QUALITY_COMMAND);
  set('branchPrefix', env.AI_HARNESS_BRANCH_PREFIX, env.AI_STAGE_BRANCH_PREFIX);

  const plan = env.AI_HARNESS_MAX_PLAN_REVIEWS || env.AI_STAGE_MAX_PLAN_REVIEWS;
  if (plan !== undefined && plan !== '') {
    const n = Number(plan);
    if (!Number.isNaN(n)) out.maxPlanReviews = n;
  }

  const attempts = env.AI_HARNESS_MAX_EXECUTION_ATTEMPTS || env.AI_STAGE_MAX_EXECUTION_ATTEMPTS;
  if (attempts !== undefined && attempts !== '') {
    const n = Number(attempts);
    if (!Number.isNaN(n)) out.maxExecutionAttempts = n;
  }

  return out;
}
