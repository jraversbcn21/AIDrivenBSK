export interface CliArgs {
  session: 'anon' | 'auth' | 'both';
  diff: boolean;
  update: boolean;
  failOnNew: boolean;
  out: string;
}

const SESSIONS = ['anon', 'auth', 'both'] as const;

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { session: 'both', diff: false, update: false, failOnNew: false, out: 'coverage/functional-map.json' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--diff') args.diff = true;
    else if (a === '--update') args.update = true;
    else if (a === '--fail-on-new') args.failOnNew = true;
    else if (a === '--session') {
      const v = argv[++i];
      if (!SESSIONS.includes(v as (typeof SESSIONS)[number])) throw new Error(`--session must be one of: ${SESSIONS.join(' | ')}`);
      args.session = v as CliArgs['session'];
    } else if (a === '--out') {
      args.out = argv[++i] ?? args.out;
    }
  }
  return args;
}
