import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  const saved = { ...process.env };
  beforeEach(() => { delete process.env.ENVIRONMENT; delete process.env.BASE_URL; });
  afterEach(() => { process.env = { ...saved }; });

  it('loads a valid des config with merged defaults', () => {
    process.env.ENVIRONMENT = 'des';
    process.env.BASE_URL = 'https://des.example/es/';
    const env = loadEnv();
    expect(env.name).toBe('des');
    expect(env.baseURL).toBe('https://des.example/es/');
    expect(env.checkoutAllowed).toBe(true);
    expect(env.locale).toBe('es');
  });

  it('marks prod as checkout-disallowed', () => {
    process.env.ENVIRONMENT = 'prod';
    process.env.BASE_URL = 'https://www.bershka.com/';
    expect(loadEnv().checkoutAllowed).toBe(false);
  });

  it('throws when BASE_URL is missing', () => {
    process.env.ENVIRONMENT = 'des';
    expect(() => loadEnv()).toThrow(/BASE_URL/);
  });

  it('throws when ENVIRONMENT is not a known value', () => {
    process.env.ENVIRONMENT = 'staging';
    process.env.BASE_URL = 'https://x/';
    expect(() => loadEnv()).toThrow(/ENVIRONMENT/);
  });
});
