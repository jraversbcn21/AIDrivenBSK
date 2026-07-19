import { describe, it, expect } from 'vitest';
import { groupSessionTwins, type TwinGroup } from './group';
import type { IntentMatch } from './resolve';

function match(overrides: Partial<IntentMatch> = {}): IntentMatch {
  return {
    flowId: 'f-1',
    name: '/es/h-woman.html -> /es/shop-cart.html',
    type: 'Cart',
    steps: 2,
    score: 65,
    reasons: ['type match: Cart'],
    coveredBy: [],
    session: 'auth',
    ...overrides,
  };
}

describe('groupSessionTwins', () => {
  it('groups a genuine session-twin pair into one TwinGroup, preserving both members', () => {
    const anon = match({ flowId: 'f-anon', session: 'anon' });
    const auth = match({ flowId: 'f-auth', session: 'auth' });
    const result = groupSessionTwins([anon, auth]);
    expect(result).toHaveLength(1);
    const group = result[0] as TwinGroup;
    expect(group.kind).toBe('twin-group');
    expect(group.members).toEqual([anon, auth]);
  });

  it('does not group two matches with different names', () => {
    const a = match({ flowId: 'f-a', name: '/es/h-woman.html -> /es/shop-cart.html', session: 'anon' });
    const b = match({ flowId: 'f-b', name: '/es/h-woman.html -> /es/logon.html', session: 'auth' });
    const result = groupSessionTwins([a, b]);
    expect(result).toEqual([a, b]);
  });

  it('does not group two matches sharing name+type+steps but the same session', () => {
    const a = match({ flowId: 'f-a', session: 'auth' });
    const b = match({ flowId: 'f-b', session: 'auth' });
    const result = groupSessionTwins([a, b]);
    expect(result).toEqual([a, b]);
  });

  it('passes a singleton match through unchanged', () => {
    const a = match({ flowId: 'f-solo' });
    expect(groupSessionTwins([a])).toEqual([a]);
  });

  it('preserves relative order in a mixed list of one twin pair and one unrelated match', () => {
    const anon = match({ flowId: 'f-anon', session: 'anon', score: 65 });
    const other = match({
      flowId: 'f-other', name: '/es/h-woman.html -> /es/logon.html', type: 'Other',
      session: 'auth', score: 40,
    });
    const auth = match({ flowId: 'f-auth', session: 'auth', score: 65 });
    const result = groupSessionTwins([anon, other, auth]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ kind: 'twin-group', members: [anon, auth] });
    expect(result[1]).toEqual(other);
  });
});
