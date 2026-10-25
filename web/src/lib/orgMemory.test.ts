import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLastOrgSlug, writeLastOrgSlug } from './orgMemory';

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('orgMemory', () => {
  it('scrive e legge lo slug', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    writeLastOrgSlug('alfa');
    expect(readLastOrgSlug()).toBe('alfa');
  });
  it('non solleva se lo storage non è disponibile', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readLastOrgSlug()).toBeNull();
    expect(() => writeLastOrgSlug('alfa')).not.toThrow();
  });
});
