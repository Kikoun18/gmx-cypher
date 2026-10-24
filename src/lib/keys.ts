// Stable React keys for a list that grows at its end and loses items anywhere: the group cards (review
// finding 7). Keyed by position, removing a card handed its state (armed remove, typed atoms) to the next.

export interface Keys { keys: number[]; next: number }

export const initialKeys = (n: number): Keys => ({ keys: Array.from({ length: n }, (_, i) => i), next: n });

/** The keys for n items: new ones at the end, or cut to n when the list was replaced by a shorter one. */
export function fitKeys(k: Keys, n: number): Keys {
  if (k.keys.length === n) return k;
  if (k.keys.length > n) return { ...k, keys: k.keys.slice(0, n) };
  const add = n - k.keys.length;
  return { keys: [...k.keys, ...Array.from({ length: add }, (_, j) => k.next + j)], next: k.next + add };
}

export const removeKey = (k: Keys, i: number): Keys => ({ ...k, keys: k.keys.filter((_, j) => j !== i) });
