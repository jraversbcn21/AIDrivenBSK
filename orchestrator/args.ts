import type { CycleArgs } from './pipeline';

export function parseCycleArgs(argv: string[]): CycleArgs {
  const args: CycleArgs = { noProbe: false, updateMap: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--risk') {
      const path = argv[++i];
      if (path === undefined || path.startsWith('--')) throw new Error('--risk requires a baseline map path');
      args.risk = path;
    } else if (a === '--no-probe') args.noProbe = true;
    else if (a === '--update-map') args.updateMap = true;
    else if (a === '--top') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) throw new Error('--top must be a positive number');
      args.top = n;
    }
  }
  return args;
}
