export interface AnalyzeArgs {
  results: string;
  map: string;
  /** Baseline map path — presence enables diff risk-scoring against the current map. */
  risk?: string;
  /** Run-history path (Phase 8); a missing file just limits the history signal to the current run. */
  history: string;
  top: number;
}

export function parseAnalyzeArgs(argv: string[]): AnalyzeArgs {
  const args: AnalyzeArgs = {
    results: 'reports/results.json', map: 'coverage/functional-map.json',
    history: 'coverage/run-history.json', top: 10,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--results') args.results = argv[++i] ?? args.results;
    else if (a === '--map') args.map = argv[++i] ?? args.map;
    else if (a === '--history') args.history = argv[++i] ?? args.history;
    else if (a === '--risk') {
      const path = argv[++i];
      if (path === undefined || path.startsWith('--')) throw new Error('--risk requires a baseline map path');
      args.risk = path;
    } else if (a === '--top') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) throw new Error('--top must be a positive number');
      args.top = n;
    }
  }
  return args;
}
