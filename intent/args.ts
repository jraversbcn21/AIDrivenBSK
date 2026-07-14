export interface AskArgs {
  /** The natural-language query (positional words joined); empty when --flow is used. */
  query: string;
  /** Direct flowId — the ambiguity follow-up; skips resolution entirely. */
  flow?: string;
  map: string;
  out: string;
  /** Also execute `pnpm test:generated` after generating (opt-in — scope decision). */
  run: boolean;
  /** Candidate-list size for the ambiguous outcome. */
  top: number;
}

export function parseAskArgs(argv: string[]): AskArgs {
  const args: AskArgs = { query: '', map: 'coverage/functional-map.json', out: 'tests/generated', run: false, top: 5 };
  const words: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--flow') {
      const id = argv[++i];
      if (id === undefined || id.startsWith('--')) throw new Error('--flow requires a flow id');
      args.flow = id;
    } else if (a === '--map') args.map = argv[++i] ?? args.map;
    else if (a === '--out') args.out = argv[++i] ?? args.out;
    else if (a === '--run') args.run = true;
    else if (a === '--top') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) throw new Error('--top must be a positive number');
      args.top = n;
    } else words.push(a);
  }
  args.query = words.join(' ').trim();
  if (args.query === '' && args.flow === undefined) {
    throw new Error('Nothing to resolve: pass a query ("pnpm ask prueba el carrito") or --flow <id>.');
  }
  return args;
}
