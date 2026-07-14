import { describe, it, expect, vi } from 'vitest';
import { buildSteps, runPipeline, type StepDef } from './pipeline';

const ok = { exitCode: 0, durationMs: 100 };
const fail = { exitCode: 1, durationMs: 50 };

describe('buildSteps', () => {
  it('produces the fixed five-step sequence with default flags', () => {
    const steps = buildSteps({ noProbe: false, updateMap: false });
    expect(steps.map((s) => s.name)).toEqual(['test', 'analyze', 'learn', 'heal', 'plan']);
    expect(steps.map((s) => s.command)).toEqual([
      'pnpm test', 'pnpm analyze', 'pnpm learn', 'pnpm heal', 'pnpm plan',
    ]);
    expect(steps.map((s) => s.onFailure)).toEqual(['continue', 'abort', 'continue', 'continue', 'continue']);
  });

  it('passes flags through to exactly the right agents', () => {
    const steps = buildSteps({ risk: 'baseline.json', noProbe: true, updateMap: true, top: 5 });
    const byName = new Map(steps.map((s) => [s.name, s.command]));
    expect(byName.get('analyze')).toBe('pnpm analyze --risk baseline.json --top 5');
    expect(byName.get('heal')).toBe('pnpm heal --no-probe');
    expect(byName.get('plan')).toBe('pnpm plan --update --top 5');
    expect(byName.get('test')).toBe('pnpm test');
    expect(byName.get('learn')).toBe('pnpm learn');
  });
});

describe('runPipeline', () => {
  const steps: StepDef[] = buildSteps({ noProbe: false, updateMap: false });

  it('runs every step in order on a green cycle', async () => {
    const exec = vi.fn().mockResolvedValue(ok);
    const results = await runPipeline(steps, exec);
    expect(exec.mock.calls.map((c) => c[0])).toEqual([
      'pnpm test', 'pnpm analyze', 'pnpm learn', 'pnpm heal', 'pnpm plan',
    ]);
    expect(results.every((r) => r.status === 'ok')).toBe(true);
  });

  it('continues past a red suite — a failing pnpm test is data, not a pipeline failure (D3)', async () => {
    const exec = vi.fn().mockImplementation((cmd: string) => Promise.resolve(cmd === 'pnpm test' ? fail : ok));
    const results = await runPipeline(steps, exec);
    expect(results[0]).toMatchObject({ name: 'test', status: 'failed', exitCode: 1 });
    expect(results.slice(1).every((r) => r.status === 'ok')).toBe(true);
    expect(exec).toHaveBeenCalledTimes(5);
  });

  it('aborts the rest when analyze fails — downstream consumers would report garbage (D2)', async () => {
    const exec = vi.fn().mockImplementation((cmd: string) => Promise.resolve(cmd.startsWith('pnpm analyze') ? fail : ok));
    const results = await runPipeline(steps, exec);
    expect(results.map((r) => r.status)).toEqual(['ok', 'failed', 'skipped', 'skipped', 'skipped']);
    expect(exec).toHaveBeenCalledTimes(2); // test + analyze only
    expect(results[2].exitCode).toBeNull();
  });

  it('continues past a learn refusal (a firing guard is not a cycle failure)', async () => {
    const exec = vi.fn().mockImplementation((cmd: string) => Promise.resolve(cmd === 'pnpm learn' ? fail : ok));
    const results = await runPipeline(steps, exec);
    expect(results.map((r) => r.status)).toEqual(['ok', 'ok', 'failed', 'ok', 'ok']);
  });

  it('records exit codes and durations faithfully', async () => {
    const exec = vi.fn().mockResolvedValue({ exitCode: 0, durationMs: 1234 });
    const results = await runPipeline(steps, exec);
    expect(results[0].durationMs).toBe(1234);
    expect(results[0].exitCode).toBe(0);
  });
});
