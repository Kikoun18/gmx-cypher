// One gesture scheme (R8a): what a click means, with its keys, the same on every surface.
import { describe, expect, it } from 'vitest';
import { modsOf, pickInList } from '../src/core/gestures';

describe('a list: click, ⌘/Ctrl-click, Shift-click', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  const cases: [string, string[], string | null, string, Parameters<typeof pickInList>[4], string[]][] = [
    ['a click selects one', ['a', 'b'], 'a', 'c', {}, ['c']],
    ['⌘ adds one', ['a'], 'a', 'c', { add: true }, ['a', 'c']],
    ['⌘ removes one', ['a', 'c'], 'a', 'c', { add: true }, ['a']],
    ['⌘ removes the last', ['c'], 'c', 'c', { add: true }, []],
    ['Shift selects the range from the anchor', ['b'], 'b', 'd', { shift: true }, ['b', 'c', 'd']],
    ['upwards too, in list order', ['d'], 'd', 'b', { shift: true }, ['b', 'c', 'd']],
    ['Shift with no anchor selects one', [], null, 'c', { shift: true }, ['c']],
    ['Shift with an anchor no longer listed selects one', ['x'], 'x', 'c', { shift: true }, ['c']],
  ];
  it.each(cases)('%s', (_, selected, anchor, id, mods, want) => {
    expect(pickInList(order, selected, anchor, id, mods)).toEqual(want);
  });

  it('⌘ or Ctrl is "add", whichever the platform has', () => {
    const e = { shiftKey: false, altKey: false, metaKey: false, ctrlKey: false };
    expect(modsOf({ ...e, metaKey: true })).toEqual({ shift: false, alt: false, add: true });
    expect(modsOf({ ...e, ctrlKey: true })).toEqual({ shift: false, alt: false, add: true });
    expect(modsOf({ ...e, shiftKey: true, altKey: true })).toEqual({ shift: true, alt: true, add: false });
  });
});
