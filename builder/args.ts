export interface BuildArgs {
  top: number;
  proposals: string;
  map: string;
  out: string;
}

export function parseBuildArgs(argv: string[]): BuildArgs {
  const args: BuildArgs = { top: 3, proposals: 'reports/planner/proposals.json', map: 'coverage/functional-map.json', out: 'tests/generated' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--proposals') args.proposals = argv[++i] ?? args.proposals;
    else if (a === '--map') args.map = argv[++i] ?? args.map;
    else if (a === '--out') args.out = argv[++i] ?? args.out;
    else if (a === '--top') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) throw new Error('--top must be a positive number');
      args.top = n;
    }
  }
  return args;
}
