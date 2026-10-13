import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { modKeyLabel, roundToAxis } from '../src/lib/interact';
import { buildGraph, lineKey, sharedDomain } from '../src/lib/graph';
import type { Store } from '../src/lib/types';
import { reopen, vaultFixture } from './helpers';

// R5c: reference lines belong to one graph (a cell × type, or the row view × type; F100), styled like the zero line.
describe('reference lines', () => {
  const base = (): Store => ({ ...lib.emptyStore(), seqs: [{ id: 's', name: 'S', seq: '', group: '', desc: '', runs: [], extras: [], structures: [] }] });
  it('the graph key: a cell and its type, or the row view and its type', () => {
    expect([lineKey({ mode: 'cell', id: 's', s: 'ha' }, 'pmf'), lineKey({ mode: 'row', id: 's', s: 'ha' }, 'rdf')]).toEqual(['ha|pmf', '*|rdf']);
  });
  it('add (no duplicates), move, remove; an empty graph leaves no key', () => {
    let s = lib.addLine(base(), 's', 'ha|pmf', 'x', 0.5);
    s = lib.addLine(s, 's', 'ha|pmf', 'x', 0.5);
    s = lib.addLine(s, 's', 'ha|pmf', 'y', -3);
    s = lib.addLine(s, 's', '*|pmf', 'y', 1);
    expect(s.seqs[0].lines).toEqual({ 'ha|pmf': [{ axis: 'x', v: 0.5 }, { axis: 'y', v: -3 }], '*|pmf': [{ axis: 'y', v: 1 }] });
    s = lib.moveLine(s, 's', 'ha|pmf', 1, -2.5);
    s = lib.removeLine(lib.removeLine(s, 's', '*|pmf', 0), 's', 'ha|pmf', 0);
    expect(s.seqs[0].lines).toEqual({ 'ha|pmf': [{ axis: 'y', v: -2.5 }] });
    expect(lib.removeLine(s, 's', 'ha|pmf', 0).seqs[0].lines).toBeUndefined();
  });
  it('a clicked value is rounded to a thousandth of the axis, no finer', () => {
    expect([roundToAxis(1.98734, -7.48, 7.38), roundToAxis(60.0437, 0, 130), roundToAxis(310.0434, 305, 316), roundToAxis(-0.000123, -0.001, 0.001)]).toEqual([1.99, 60, 310.04, -0.000123]);
  });
  it('on macOS the key is ⌘, elsewhere Ctrl', () => {
    expect([modKeyLabel('MacIntel'), modKeyLabel('macOS'), modKeyLabel('Win32'), modKeyLabel('Linux x86_64')]).toEqual(['⌘', '⌘', 'Ctrl', 'Ctrl']);
  });
  it('survive reopening; the graph draws only its own, labelled with their value and unit', async () => {
    const b = await vaultFixture('formats/schema-3-vault'), { svc } = await reopen(b);
    const row = svc.store.seqs.find(q => q.name === 'WRWYCR')!;
    svc.commit(lib.addLine(lib.addLine(lib.addLine(svc.store, row.id, 'ha|pmf', 'x', 1.5), row.id, 'ha|pmf', 'y', -2), row.id, 'ha|rdf', 'x', 9)); await svc.flush();
    const store = (await reopen(b)).svc.store, r2 = store.seqs.find(q => q.id === row.id)!;
    expect(r2.lines).toEqual({ 'ha|pmf': [{ axis: 'x', v: 1.5 }, { axis: 'y', v: -2 }], 'ha|rdf': [{ axis: 'x', v: 9 }] });
    const m = buildGraph({ store, sel: { mode: 'cell', id: row.id, s: 'ha' }, cols: lib.pageCols(store, null), st: lib.mergeSettings({}, store.settings), tab: 'pmf', raw: false, fitWell: true, dark: false, domain: sharedDomain(store.seqs, lib.ENTROPY) })!;
    expect([m.lineKey, m.refLines]).toEqual(['ha|pmf', [{ at: 0, axis: 'x', v: 1.5, label: 'x = 1.50 nm' }, { at: 1, axis: 'y', v: -2, label: 'y = -2.00 kJ/mol' }]]);
  });
});
