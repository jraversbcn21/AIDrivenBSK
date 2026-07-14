export interface PlanArgs {
  update: boolean;
  map: string;
  evidence: string;
  /** Run-history path (Phase 8); a missing file just means no drift signal in the ranking. */
  history: string;
  top: number;
}

export function parsePlanArgs(argv: string[]): PlanArgs {
  const args: PlanArgs = {
    update: false, map: 'coverage/functional-map.json', evidence: 'reports/route-evidence.json',
    history: 'coverage/run-history.json', top: 10,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--update') args.update = true;
    else if (a === '--map') args.map = argv[++i] ?? args.map;
    else if (a === '--evidence') args.evidence = argv[++i] ?? args.evidence;
    else if (a === '--history') args.history = argv[++i] ?? args.history;
    else if (a === '--top') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) throw new Error('--top must be a positive number');
      args.top = n;
    }
  }
  return args;
}
