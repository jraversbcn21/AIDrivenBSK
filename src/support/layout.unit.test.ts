import { describe, expect, it } from 'vitest';
import { needsDeviceParam, withDesktopDevice } from './layout';

const BASE = 'https://des.example.test';

describe('needsDeviceParam', () => {
  it('true for a same-origin URL without a device param', () => {
    expect(needsDeviceParam(`${BASE}/es/h-woman.html`, BASE)).toBe(true);
  });
  it('false for a foreign origin (third-party beacons must never be rewritten)', () => {
    expect(needsDeviceParam('https://www.googletagmanager.com/gtm.js', BASE)).toBe(false);
  });
  it('false when the URL already carries device= (no duplicate params)', () => {
    expect(needsDeviceParam(`${BASE}/es/?device=desktop`, BASE)).toBe(false);
    expect(needsDeviceParam(`${BASE}/es/?device=`, BASE)).toBe(false);
  });
  it('false for an unparseable URL (never throw inside a route handler)', () => {
    expect(needsDeviceParam('not-a-url', BASE)).toBe(false);
  });
  it('true when a query already exists but device is absent', () => {
    expect(needsDeviceParam(`${BASE}/es/camisetas-n4365.html?celement=1`, BASE)).toBe(true);
  });
});

describe('withDesktopDevice', () => {
  it('adds ?device=desktop when the URL has no query', () => {
    expect(withDesktopDevice(`${BASE}/es/h-woman.html`))
      .toBe(`${BASE}/es/h-woman.html?device=desktop`);
  });
  it('appends with & when a query already exists, preserving it', () => {
    expect(withDesktopDevice(`${BASE}/es/camisetas-n4365.html?celement=1`))
      .toBe(`${BASE}/es/camisetas-n4365.html?celement=1&device=desktop`);
  });
});
