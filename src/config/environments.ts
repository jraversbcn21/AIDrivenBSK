export type EnvName = 'prod' | 'des' | 'local';

export interface EnvironmentDefaults {
  defaultTimeoutMs: number;
  locale: string;
  checkoutAllowed: boolean;
}

export const environments: Record<EnvName, EnvironmentDefaults> = {
  prod:  { defaultTimeoutMs: 30_000, locale: 'es', checkoutAllowed: false },
  // DES/local are real, heavily-gated storefronts (cookie + gender entry gates, lots of
  // third-party beacons) — flows need more headroom than a lean prod smoke check.
  des:   { defaultTimeoutMs: 60_000, locale: 'es', checkoutAllowed: true },
  local: { defaultTimeoutMs: 60_000, locale: 'es', checkoutAllowed: true },
};
