export interface LearnArgs {
  failures: string;
  risk: string;
  history: string;
  maxEntries: number;
}

export function parseLearnArgs(argv: string[]): LearnArgs {
  const args: LearnArgs = {
    failures: 'reports/analyzer/failure-report.json',
    risk: 'reports/analyzer/risk-report.json',
    history: 'coverage/run-history.json',
    maxEntries: 50,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--failures') args.failures = argv[++i] ?? args.failures;
    else if (a === '--risk') args.risk = argv[++i] ?? args.risk;
    else if (a === '--history') args.history = argv[++i] ?? args.history;
    else if (a === '--max-entries') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) throw new Error('--max-entries must be a positive number');
      args.maxEntries = n;
    }
  }
  return args;
}
