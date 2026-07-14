import type { FunctionalMap } from '../explorer/map/schema';

/**
 * Deterministic NL→flow resolution weights (design §3, decision log D2/D3). One exported
 * const, code-only — the risk-scorer precedent: a resolution only means something if
 * everyone computes it the same way. The future `llm` mode (registered seam, mirroring
 * the explorer's ClassifierMode) would sit beside this, never replace its explainability.
 */
export const WEIGHTS = {
  tokenHit: 25,        // one query token found among the flow's URL tokens
  typeHit: 40,         // a synonym's PageType target equals the flow's type
  minScore: 25,        // at least one real signal to qualify
  clearWinnerRatio: 1.5, // auto-pick only when clearly better than the runner-up
} as const;

// Test-speak, articles and prepositions — never intent (decision log D2).
const STOPWORDS = new Set([
  'prueba', 'probar', 'pruebame', 'testea', 'testear', 'test', 'chequea', 'verifica',
  'valida', 'revisa', 'quiero', 'dame', 'genera', 'generar', 'crea', 'crear', 'hacer',
  'haz', 'una', 'las', 'los', 'del', 'con', 'para', 'por', 'que', 'este', 'esta',
  'flujo', 'flow', 'spec', 'specs', 'pagina', 'page', 'hasta', 'desde', 'sobre', 'the',
]);

// URL-fragment noise that carries no intent.
const NOISE = new Set(['html', 'www']);

/**
 * Domain synonym dictionary, ES-first, deliberately small and grounded in the real map's
 * vocabulary (decision log D4). `tokens` are URL-token targets; `type` targets flow.type.
 */
const SYNONYMS: Record<string, { tokens?: string[]; type?: string }> = {
  carrito: { tokens: ['cesta', 'cart', 'shop'], type: 'Cart' },
  carro: { tokens: ['cesta', 'cart', 'shop'], type: 'Cart' },
  cesta: { tokens: ['cart', 'shop'], type: 'Cart' },
  cart: { tokens: ['cesta', 'shop'], type: 'Cart' },
  checkout: { tokens: ['checkout', 'pago', 'payment'], type: 'Checkout' },
  pago: { tokens: ['checkout', 'payment'], type: 'Checkout' },
  pagar: { tokens: ['checkout', 'payment'], type: 'Checkout' },
  compra: { tokens: ['checkout', 'payment'], type: 'Checkout' },
  comprar: { tokens: ['checkout', 'payment'], type: 'Checkout' },
  login: { tokens: ['logon', 'login'] },
  sesion: { tokens: ['logon', 'login'] },
  acceso: { tokens: ['logon', 'login'] },
  acceder: { tokens: ['logon', 'login'] },
  inicio: { tokens: ['woman', 'home'], type: 'Home' },
  home: { tokens: ['woman'], type: 'Home' },
  portada: { tokens: ['woman', 'home'], type: 'Home' },
  busqueda: { tokens: ['search'], type: 'Search' },
  buscar: { tokens: ['search'], type: 'Search' },
  search: { type: 'Search' },
  producto: { type: 'PDP' },
  articulo: { type: 'PDP' },
  detalle: { type: 'PDP' },
  pdp: { type: 'PDP' },
  categoria: { type: 'PLP' },
  listado: { type: 'PLP' },
  catalogo: { type: 'PLP' },
  plp: { type: 'PLP' },
  zapatos: { tokens: ['zapatos', 'shoes'] },
  zapato: { tokens: ['zapatos', 'shoes'] },
  calzado: { tokens: ['zapatos', 'shoes'] },
  rebajas: { tokens: ['rebajas', 'sale'] },
  ofertas: { tokens: ['rebajas', 'sale'] },
  sale: { tokens: ['rebajas'] },
  descuentos: { tokens: ['rebajas', 'sale'] },
  novedades: { tokens: ['novedades'] },
};

export interface IntentMatch {
  flowId: string;
  name: string;
  type: string;
  steps: number;
  score: number;
  reasons: string[];
  coveredBy: string[];
}

export interface Resolution {
  query: string;
  /** Intent tokens after normalization and stopword removal. */
  tokens: string[];
  /** Qualifying matches (score >= minScore), best first. */
  matches: IntentMatch[];
  pick: IntentMatch | null;
  outcome: 'picked' | 'ambiguous' | 'no-match';
  /** The query targeted Checkout and the map holds no Checkout flow (D15) — say it plainly. */
  checkoutBlindSpot: boolean;
  /** Sub-threshold near-misses (score > 0), for the no-match message. */
  suggestions: IntentMatch[];
}

const normalize = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const tokensOf = (text: string): string[] =>
  normalize(text).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !NOISE.has(t));

// Singular/plural tolerance: "pantalon" must hit "pantalones" (prefix either way, min 4 chars).
function tokenMatches(queryToken: string, flowToken: string): boolean {
  if (queryToken === flowToken) return true;
  if (queryToken.length >= 4 && flowToken.startsWith(queryToken)) return true;
  if (flowToken.length >= 4 && queryToken.startsWith(flowToken)) return true;
  return false;
}

export function resolveIntent(query: string, map: FunctionalMap): Resolution {
  const queryTokens = tokensOf(query).filter((t) => !STOPWORDS.has(t));

  // Expand each intent token: itself + its synonym URL-tokens; collect type targets.
  const expansions = queryTokens.map((t) => {
    const syn = SYNONYMS[t];
    return { token: t, urlTokens: [t, ...(syn?.tokens ?? [])], type: syn?.type };
  });
  const typeTargets = new Set(expansions.map((e) => e.type).filter((t): t is string => t !== undefined));

  const scored: IntentMatch[] = map.flows.map((flow) => {
    const flowTokens = tokensOf(flow.name);
    const reasons: string[] = [];
    let score = 0;
    for (const exp of expansions) {
      const hit = exp.urlTokens.some((ut) => flowTokens.some((ft) => tokenMatches(ut, ft)));
      if (hit) {
        score += WEIGHTS.tokenHit;
        reasons.push(`token "${exp.token}" matches the flow path`);
      }
    }
    if (typeTargets.has(flow.type)) {
      score += WEIGHTS.typeHit;
      reasons.push(`type match: ${flow.type}`);
    }
    return {
      flowId: flow.id, name: flow.name, type: flow.type, steps: flow.steps.length,
      score, reasons, coveredBy: flow.coveredBy ?? [],
    };
  }).sort((a, b) => b.score - a.score || a.steps - b.steps || a.name.localeCompare(b.name));

  const matches = scored.filter((m) => m.score >= WEIGHTS.minScore);
  const suggestions = scored.filter((m) => m.score > 0 && m.score < WEIGHTS.minScore).slice(0, 3);
  const checkoutBlindSpot = typeTargets.has('Checkout') && !map.flows.some((f) => f.type === 'Checkout');

  let pick: IntentMatch | null = null;
  if (matches.length === 1) pick = matches[0];
  else if (matches.length > 1 && matches[0].score >= WEIGHTS.clearWinnerRatio * matches[1].score) {
    pick = matches[0];
  }

  return {
    query, tokens: queryTokens, matches, pick,
    outcome: pick !== null ? 'picked' : matches.length > 0 ? 'ambiguous' : 'no-match',
    checkoutBlindSpot, suggestions,
  };
}
