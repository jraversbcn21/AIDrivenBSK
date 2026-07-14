export interface HealArgs {
  failures: string;
  map: string;
  /** Live validation on by default (the mandatory-validation scope decision);
   *  --no-probe emits the same report with all candidates not-probed (offline mode). */
  probe: boolean;
  top: number;
}

export function parseHealArgs(argv: string[]): HealArgs {
  const args: HealArgs = {
    failures: 'reports/analyzer/failure-report.json',
    map: 'coverage/functional-map.json',
    probe: true,
    top: 3,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--failures') args.failures = argv[++i] ?? args.failures;
    else if (a === '--map') args.map = argv[++i] ?? args.map;
    else if (a === '--no-probe') args.probe = false;
    else if (a === '--top') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) throw new Error('--top must be a positive number');
      args.top = n;
    }
  }
  return args;
}
