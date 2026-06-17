import { createHash } from 'node:crypto';

export function makeId(prefix: string, ...parts: string[]): string {
  const hash = createHash('sha1').update(parts.join(' ')).digest('hex').slice(0, 12);
  return `${prefix}_${hash}`;
}
