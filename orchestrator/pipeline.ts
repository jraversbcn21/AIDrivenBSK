export interface CycleArgs {
  /** Baseline map path — passed through to `pnpm analyze --risk`. */
  risk?: string;
  /** Passed through to `pnpm heal --no-probe` (offline candidates). */
  noProbe: boolean;
  /** Opts in to `pnpm plan --update` — writing coveredBy to the committed map is a
   *  human-authorized mutation, default OFF (decision log D4). */
  updateMap: boolean;
  /** Passed through to analyze/plan printing when provided. */
  top?: number;
}

export interface StepDef {
  name: string;
  command: string;
  /** Fixed at design time, never content-driven (decision log D2). */
  onFailure: 'abort' | 'continue';
}

export interface StepResult {
  name: string;
  command: string;
  status: 'ok' | 'failed' | 'skipped';
  exitCode: number | null;
  durationMs: number;
}

export type Exec = (command: string) => Promise<{ exitCode: number; durationMs: number }>;

/** The fixed five-step cycle (design §1/§3). Flags map to exact child commands — pure. */
export function buildSteps(args: CycleArgs): StepDef[] {
  const top = args.top !== undefined ? ` --top ${args.top}` : '';
  return [
    // A red suite is the cycle's most valuable input — analyze/learn/heal exist for it (D3).
    { name: 'test', command: 'pnpm test', onFailure: 'continue' },
    // Everything downstream consumes analyze's output; an unparseable-results failure aborts.
    { name: 'analyze', command: `pnpm analyze${args.risk !== undefined ? ` --risk ${args.risk}` : ''}${top}`, onFailure: 'abort' },
    { name: 'learn', command: 'pnpm learn', onFailure: 'continue' },
    { name: 'heal', command: `pnpm heal${args.noProbe ? ' --no-probe' : ''}`, onFailure: 'continue' },
    { name: 'plan', command: `pnpm plan${args.updateMap ? ' --update' : ''}${top}`, onFailure: 'continue' },
  ];
}

export async function runPipeline(steps: StepDef[], exec: Exec): Promise<StepResult[]> {
  const results: StepResult[] = [];
  let aborted = false;
  for (const step of steps) {
    if (aborted) {
      results.push({ name: step.name, command: step.command, status: 'skipped', exitCode: null, durationMs: 0 });
      continue;
    }
    const { exitCode, durationMs } = await exec(step.command);
    const okRun = exitCode === 0;
    results.push({ name: step.name, command: step.command, status: okRun ? 'ok' : 'failed', exitCode, durationMs });
    if (!okRun && step.onFailure === 'abort') aborted = true;
  }
  return results;
}
