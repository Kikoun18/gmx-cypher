import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import type { Curve, Store, Vis } from '../src/lib/types';

const row = { name: 'P1', seq: 'P1', group: '', desc: '' };
const curve = (id: string, y: number[], vis?: Curve['vis']): Curve => ({ id, x: y.map((_, i) => i), y, label: id, ...(vis ? { vis } : {}) });
const withRun = (s: Store, run: 'a' | 'b') => lib.addRun(s, { ...row, sacch: 'ha', run, time: '', temp: 300, tags: [], file: run + '.xvg', x: [0, 1], y: [1, 2] }).store;

describe('per-curve visibility (R4c)', () => {
  it.each([
    // run, curve, shown as
    ['on', undefined, 'on'], ['on', 'dim', 'dim'], ['on', 'off', 'off'],
    ['dim', undefined, 'dim'], ['dim', 'dim', 'dim'], ['dim', 'off', 'off'],
    ['off', undefined, 'off'], ['off', 'dim', 'off'],
  ] as const)('run %s, curve %s → %s', (rv, cv, want) => expect(lib.curveVis(rv as Vis, curve('c', [1], cv))).toBe(want));

  it('shownCurves leaves out hidden curves, every curve of a hidden run, and curves without data; dimmed ones count', () => {
    const e = { curves: [curve('c1', [1, 5]), curve('c2', [9, 9], 'off'), curve('c3', [2, 7], 'dim'), { ...curve('c4', [0]), state: 'pending' as const }] };
    expect(lib.shownCurves(e, 'on').map(s => [s.c.id, s.vis])).toEqual([['c1', 'on'], ['c3', 'dim']]);
    expect(lib.shownCurves(e, 'dim').map(s => [s.c.id, s.vis])).toEqual([['c1', 'dim'], ['c3', 'dim']]);
    expect(lib.shownCurves(e, 'off')).toEqual([]);
  });

  it('markers come only from shown curves: a hidden curve never wins the maximum', () => {
    const e = { curves: [curve('c1', [1, 5]), curve('c2', [9, 9], 'off'), curve('c3', [2, 7], 'dim')] };
    const marks = lib.shownCurves(e, 'on').map(s => lib.curveMark(s.c.x, s.c.y, 'max', 'none')!);
    expect(marks.map(m => m.y)).toEqual([5, 7]);
  });

  it('updateCurve stores the cycle; "on" is no flag', () => {
    let s = lib.addExtra(withRun(lib.emptyStore(), 'a'), { ...row, type: 'rdf', sacch: 'ha', run: 'a', time: '', file: 'r.xvg', curves: [curve('c1', [1])] }).store;
    const id = () => s.seqs[0].extras[0].id, vis = () => s.seqs[0].extras[0].curves[0].vis;
    s = lib.updateCurve(s, s.seqs[0].id, id(), 'c1', { vis: lib.nextVis(vis() || 'on') === 'on' ? undefined : lib.nextVis(vis() || 'on') as Curve['vis'] });
    expect(vis()).toBe('dim');
    expect(lib.nextVis('dim')).toBe('off');
    expect(lib.nextVis('off')).toBe('on');
  });
});

describe('run visibility follows the run (backlog items, F65)', () => {
  it('moving a hidden run in the run editor moves its flag; the slot it left is shown again', () => {
    let s = withRun(withRun(lib.emptyStore(), 'a'), 'b');
    const rid = s.seqs[0].id, run = s.seqs[0].runs.find(r => r.run === 'a')!;
    s = { ...s, vis: { [lib.slotKey(rid, 'ha', 'a')]: 'off', [lib.slotKey(rid, 'ha', 'b')]: 'dim' } };
    const moved = lib.updateRun(s, rid, run.id, { run: 'c' });
    expect(moved.vis).toEqual({ [lib.slotKey(rid, 'ha', 'c')]: 'off', [lib.slotKey(rid, 'ha', 'b')]: 'dim' });
    // Onto an occupied slot: the run there is replaced, and so is its flag.
    const onto = lib.updateRun(s, rid, run.id, { run: 'b' });
    expect(onto.vis).toEqual({ [lib.slotKey(rid, 'ha', 'b')]: 'off' });
  });
  it('a shown run moved onto a hidden slot arrives shown', () => {
    let s = withRun(withRun(lib.emptyStore(), 'a'), 'b');
    const rid = s.seqs[0].id, run = s.seqs[0].runs.find(r => r.run === 'a')!;
    s = { ...s, vis: { [lib.slotKey(rid, 'ha', 'b')]: 'off' } };
    expect(lib.updateRun(s, rid, run.id, { run: 'b' }).vis).toEqual({});
  });
  it('deleting a hidden run drops its flag when the slot is left empty, and keeps it while an analysis stays', () => {
    let s = withRun(withRun(lib.emptyStore(), 'a'), 'b');
    s = lib.addExtra(s, { ...row, type: 'rdf', sacch: 'ha', run: 'b', time: '', file: 'r.xvg', curves: [curve('c1', [1])] }).store;
    const rid = s.seqs[0].id, ka = lib.slotKey(rid, 'ha', 'a'), kb = lib.slotKey(rid, 'ha', 'b');
    s = { ...s, vis: { [ka]: 'off', [kb]: 'off' } };
    const runA = s.seqs[0].runs.find(r => r.run === 'a')!, runB = s.seqs[0].runs.find(r => r.run === 'b')!;
    expect(lib.deleteRun(s, rid, runA.id).vis).toEqual({ [kb]: 'off' });
    expect(lib.deleteRun(s, rid, runB.id).vis).toEqual({ [ka]: 'off', [kb]: 'off' });
  });
});

describe('imported curve display fields are cleaned (review, batch 2)', () => {
  it('odd vis and shade from a JSON file never reach the screen', () => {
    const raw = { seqs: [{ id: 's1', name: 'P1', runs: [], structures: [], extras: [{ id: 'x1', type: 'rdf', sacch: 'ha', run: 'a', curves: [
      { id: 'c1', x: [0], y: [1], label: 'a', vis: 'x', shade: '2' }, { id: 'c2', x: [0], y: [1], label: 'b', vis: 'off', shade: 1e9 }, { id: 'c3', x: [0], y: [1], label: 'c', vis: 'dim', shade: -1.4 },
    ] }] }] };
    const cs = lib.normStore(raw as never).seqs[0].extras[0].curves;
    expect(cs.map(c => [c.id, c.vis ?? null, c.shade ?? null])).toEqual([['c1', null, null], ['c2', 'off', 3], ['c3', 'dim', -1]]);
  });
});
