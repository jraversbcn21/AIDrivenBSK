export type EnvName = 'prod' | 'des' | 'local';

export interface EnvironmentDefaults {
  defaultTimeoutMs: number;
  locale: string;
  checkoutAllowed: boolean;
}

export const environments: Record<EnvName, EnvironmentDefaults> = {
  prod:  { defaultTimeoutMs: 30_000, locale: 'es', checkoutAllowed: false },
  des:   { defaultTimeoutMs: 30_000, locale: 'es', checkoutAllowed: true },
  local: { defaultTimeoutMs: 30_000, locale: 'es', checkoutAllowed: true },
};
