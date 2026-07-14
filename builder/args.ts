export interface BuildArgs {
  top: number;
  proposals: string;
  map: string;
  out: string;
  /** Prune stale drafts from `out` before writing the new generation (F10 root fix).
   *  ON by default — drafts are documented as disposable ("regeneration overwrites";
   *  keeping one means promoting it out of tests/generated/). --no-prune opts out. */
  prune: boolean;
}

export function parseBuildArgs(argv: string[]): BuildArgs {
  const args: BuildArgs = {
    top: 3, proposals: 'reports/planner/proposals.json', map: 'coverage/functional-map.json', out: 'tests/generated',
    prune: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--proposals') args.proposals = argv[++i] ?? args.proposals;
    else if (a === '--map') args.map = argv[++i] ?? args.map;
    else if (a === '--out') args.out = argv[++i] ?? args.out;
    else if (a === '--no-prune') args.prune = false;
    else if (a === '--top') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) throw new Error('--top must be a positive number');
      args.top = n;
    }
  }
  return args;
}
