import { describe, expect, it } from 'vitest';
import { unlockDelaySeconds } from './VaultGate';

describe('unlockDelaySeconds', () => {
  it('lets the first 3 attempts through, then doubles from 5 s up to 5 min', () => {
    expect([0, 1, 2].map(unlockDelaySeconds)).toEqual([0, 0, 0]);
    expect([3, 4, 5, 6].map(unlockDelaySeconds)).toEqual([5, 10, 20, 40]);
    expect(unlockDelaySeconds(9)).toBe(300);
    expect(unlockDelaySeconds(50)).toBe(300);
  });
});
