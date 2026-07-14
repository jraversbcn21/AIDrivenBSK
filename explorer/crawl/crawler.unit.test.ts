import { describe, it, expect, vi } from 'vitest';
import { isDuplicateResolution } from './crawler';

describe('isDuplicateResolution (F3)', () => {
  it('does not skip and does not call markSeen when path was already considered this visit', () => {
    const markSeen = vi.fn();
    expect(isDuplicateResolution('/es/h-woman.html', ['/es/h-woman.html'], markSeen)).toBe(false);
    expect(markSeen).not.toHaveBeenCalled();
  });

  it('does not skip on a new path when markSeen reports it as new (first time)', () => {
    const markSeen = vi.fn(() => true);
    expect(isDuplicateResolution('/es/h-woman.html', ['/es/'], markSeen)).toBe(false);
    expect(markSeen).toHaveBeenCalledWith('/es/h-woman.html');
  });

  it('skips on a new path when markSeen reports it as already seen (redirect duplicate)', () => {
    const markSeen = vi.fn(() => false);
    expect(isDuplicateResolution('/es/h-woman.html', ['/es/'], markSeen)).toBe(true);
    expect(markSeen).toHaveBeenCalledWith('/es/h-woman.html');
  });

  it('handles the URL-changed-during-settle case: new extracted path not yet considered, not seen before -> proceeds', () => {
    const markSeen = vi.fn(() => true);
    const alreadyConsidered = ['/es/mujer.html', '/es/mujer-resolved.html'];
    expect(isDuplicateResolution('/es/mujer-final.html', alreadyConsidered, markSeen)).toBe(false);
    expect(markSeen).toHaveBeenCalledWith('/es/mujer-final.html');
  });

  it('handles the URL-changed-during-settle case: new extracted path not yet considered, already seen -> skips', () => {
    const markSeen = vi.fn(() => false);
    const alreadyConsidered = ['/es/mujer.html', '/es/mujer-resolved.html'];
    expect(isDuplicateResolution('/es/mujer-final.html', alreadyConsidered, markSeen)).toBe(true);
    expect(markSeen).toHaveBeenCalledWith('/es/mujer-final.html');
  });
});
