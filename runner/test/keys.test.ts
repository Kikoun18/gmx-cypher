import { describe, expect, it } from 'vitest';
import { fitKeys, initialKeys, removeKey } from '../src/lib/keys';

describe('stable keys for the group cards (review finding 7)', () => {
  it('removing a card drops its key, so the next card keeps its own state', () => {
    const k = removeKey(initialKeys(4), 1);
    expect(k.keys).toEqual([0, 2, 3]);
    expect(fitKeys(k, 4).keys).toEqual([0, 2, 3, 4]);
  });

  it('a list replaced elsewhere (a recipe, run again) is fitted: new keys at the end, or cut', () => {
    const k = initialKeys(2);
    expect(fitKeys(k, 2)).toBe(k);
    expect(fitKeys(fitKeys(k, 4), 3).keys).toEqual([0, 1, 2]);
    expect(fitKeys(fitKeys(fitKeys(k, 4), 3), 4).keys).toEqual([0, 1, 2, 4]);
  });
});
