export interface PlanArgs {
  update: boolean;
  map: string;
  evidence: string;
  top: number;
}

export function parsePlanArgs(argv: string[]): PlanArgs {
  const args: PlanArgs = { update: false, map: 'coverage/functional-map.json', evidence: 'reports/route-evidence.json', top: 10 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--update') args.update = true;
    else if (a === '--map') args.map = argv[++i] ?? args.map;
    else if (a === '--evidence') args.evidence = argv[++i] ?? args.evidence;
    else if (a === '--top') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) throw new Error('--top must be a positive number');
      args.top = n;
    }
  }
  return args;
}
