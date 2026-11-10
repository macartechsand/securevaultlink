import { beforeEach, describe, expect, it } from 'vitest';

// Node test environment: a minimal in-memory localStorage.
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;
import { looksLikeEmail, readRememberedEmail, rememberEmail } from './rememberedEmail';

describe('remembered e-mail', () => {
  beforeEach(() => localStorage.clear());

  it('stores only after opting in, normalized', () => {
    rememberEmail(' Ana@Example.com ', false);
    expect(readRememberedEmail()).toBe('');
    rememberEmail(' Ana@Example.com ', true);
    expect(readRememberedEmail()).toBe('ana@example.com');
  });

  it('forgets when the box is unchecked', () => {
    rememberEmail('ana@example.com', true);
    rememberEmail('ana@example.com', false);
    expect(readRememberedEmail()).toBe('');
  });

  it('validates the address before continuing', () => {
    expect(looksLikeEmail('ana@example.com')).toBe(true);
    expect(looksLikeEmail('ana@')).toBe(false);
    expect(looksLikeEmail('ana example.com')).toBe(false);
  });
});
