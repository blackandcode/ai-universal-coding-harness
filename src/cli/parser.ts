/**
 * @fileoverview CLI argument parser for AI Universal Coding Harness.
 * Transforms raw string argv into a strongly-typed, discriminated CliCommand union without executing side effects.
 */

/**
 * Discriminated union of all executable CLI commands and their typed arguments.
 */
export type CliCommand =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'init'; force: boolean }
  | {
      kind: 'config';
      subCommand: 'show' | 'paths' | 'init';
      targetScope: 'global' | 'project' | 'local';
      force: boolean;
    }
  | {
      kind: 'runs';
      subCommand: 'list' | 'reset' | 'delete';
      runId?: string;
      force: boolean;
    }
  | {
      kind: 'list-stages';
      stageSource: string;
      feature?: string;
    }
  | {
      kind: 'inspect';
      stageSource: string;
      stages: string[];
      feature?: string;
    }
  | {
      kind: 'validate';
      stageSource: string;
      stages: string[];
      feature?: string;
    }
  | {
      kind: 'preflight';
      stageSource?: string;
      stages: string[];
      feature?: string;
      executorHarness?: string;
      reviewerHarness?: string;
    }
  | {
      kind: 'status';
      runId?: string;
    }
  | {
      kind: 'tail';
      runId?: string;
    }
  | {
      kind: 'recover';
      runId?: string;
      stageName?: string;
      apply: boolean;
      force: boolean;
    }
  | {
      kind: 'run';
      stageSource: string;
      stages: string[];
      feature?: string;
      branch?: string;
      base?: string;
      qualityCmd?: string;
      ui?: string;
      executorHarness?: string;
      reviewerHarness?: string;
    }
  | {
      kind: 'resume';
      runId?: string;
      ui?: string;
    };

interface RawArgs {
  cmd: string;
  sub?: string;
  stageSource?: string;
  stages: string[];
  feature?: string;
  branch?: string;
  base?: string;
  runId?: string;
  qualityCmd?: string;
  ui?: string;
  executorHarness?: string;
  reviewerHarness?: string;
  project?: string;
  global?: boolean;
  local?: boolean;
  force?: boolean;
  apply?: boolean;
  dryRun?: boolean;
}

export function parseCliArgs(argv: string[]): CliCommand {
  const first = argv[0] || 'help';
  const initial =
    first === '--help' || first === '-h'
      ? 'help'
      : first === '--version' || first === '-v'
        ? 'version'
        : first;

  const o: RawArgs = {
    cmd: initial,
    sub: argv[1] && !argv[1].startsWith('-') ? argv[1] : undefined,
    stages: []
  };

  const start = o.sub ? 2 : 1;
  for (let i = start; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${a}`);
      return argv[++i]!;
    };

    if (a === '--stage-source') o.stageSource = next();
    else if (a === '--stage') o.stages.push(next());
    else if (a === '--feature') o.feature = next();
    else if (a === '--branch') o.branch = next();
    else if (a === '--base') o.base = next();
    else if (a === '--run') o.runId = next();
    else if (a === '--quality-cmd') o.qualityCmd = next();
    else if (a === '--ui') o.ui = next();
    else if (a === '--executor-harness') o.executorHarness = next();
    else if (a === '--reviewer-harness') o.reviewerHarness = next();
    else if (a === '--project' || a === '--cwd') o.project = next();
    else if (a === '--global') o.global = true;
    else if (a === '--local') o.local = true;
    else if (a === '--force') o.force = true;
    else if (a === '--apply') o.apply = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--help' || a === '-h') o.cmd = 'help';
    else if (a === '--version' || a === '-v') o.cmd = 'version';
    else throw new Error(`Unknown argument: ${a}`);
  }

  if (o.cmd === 'help') return { kind: 'help' };
  if (o.cmd === 'version') return { kind: 'version' };
  if (o.cmd === 'init') return { kind: 'init', force: Boolean(o.force) };

  if (o.cmd === 'config') {
    const sub = o.sub || 'show';
    if (!['show', 'paths', 'init'].includes(sub)) {
      throw new Error(`Unknown config command '${sub}'. Use paths, show, or init.`);
    }
    const targetScope: 'global' | 'project' | 'local' = o.global
      ? 'global'
      : o.local
        ? 'local'
        : 'project';
    return {
      kind: 'config',
      subCommand: sub as 'show' | 'paths' | 'init',
      targetScope,
      force: Boolean(o.force)
    };
  }

  if (o.cmd === 'runs' || o.cmd === 'reset') {
    const sub = o.cmd === 'reset' ? 'reset' : o.sub || 'list';
    if (!['list', 'reset', 'delete'].includes(sub)) {
      throw new Error(`Unknown runs command '${sub}'. Use list, delete, or reset.`);
    }
    return {
      kind: 'runs',
      subCommand: sub as 'list' | 'reset' | 'delete',
      runId: o.runId,
      force: Boolean(o.force)
    };
  }

  if (o.cmd === 'list-stages') {
    if (!o.stageSource) throw new Error('--stage-source is required.');
    return { kind: 'list-stages', stageSource: o.stageSource, feature: o.feature };
  }

  if (o.cmd === 'inspect') {
    if (!o.stageSource) throw new Error('--stage-source is required.');
    if (!o.stages.length) throw new Error('At least one --stage is required.');
    return {
      kind: 'inspect',
      stageSource: o.stageSource,
      stages: o.stages,
      feature: o.feature
    };
  }

  if (o.cmd === 'validate') {
    if (!o.stageSource) throw new Error('--stage-source is required.');
    return {
      kind: 'validate',
      stageSource: o.stageSource,
      stages: o.stages,
      feature: o.feature
    };
  }

  if (o.cmd === 'preflight' || o.cmd === 'doctor') {
    return {
      kind: 'preflight',
      stageSource: o.stageSource,
      stages: o.stages,
      feature: o.feature,
      executorHarness: o.executorHarness,
      reviewerHarness: o.reviewerHarness
    };
  }

  if (o.cmd === 'status') {
    return { kind: 'status', runId: o.runId };
  }

  if (o.cmd === 'tail') {
    return { kind: 'tail', runId: o.runId };
  }

  if (o.cmd === 'recover') {
    return {
      kind: 'recover',
      runId: o.runId,
      stageName: o.stages[0],
      apply: Boolean(o.apply),
      force: Boolean(o.force)
    };
  }

  if (o.cmd === 'run') {
    if (!o.stageSource || !o.stages.length) {
      throw new Error('run requires --stage-source and at least one --stage.');
    }
    return {
      kind: 'run',
      stageSource: o.stageSource,
      stages: o.stages,
      feature: o.feature,
      branch: o.branch,
      base: o.base,
      qualityCmd: o.qualityCmd,
      ui: o.ui,
      executorHarness: o.executorHarness,
      reviewerHarness: o.reviewerHarness
    };
  }

  if (o.cmd === 'resume') {
    return {
      kind: 'resume',
      runId: o.runId,
      ui: o.ui
    };
  }

  throw new Error(`Unknown command '${o.cmd}'.`);
}
