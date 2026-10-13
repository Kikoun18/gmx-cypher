import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { snapPoint } from '../src/lib/interact';
import { buildGraph, sharedDomain } from '../src/lib/graph';
import type { Store } from '../src/lib/types';
import { reopen, vaultFixture } from './helpers';

// R5b: a click near a curve marks its nearest data point; a mark stores its curve and x, never y (F100).
const geo = (series: { x: (number | null)[]; y: (number | null)[] }[]) => lib.buildPlotMulti(series, { w: 640, h: 400, domain: { lo: 0, hi: 10 }, yStep: null });

describe('snapping (in pixels, on the full data)', () => {
  const a = { rx: [0, 1, 2, 3, 4], ry: [1, 1, 1, 1, 1] }, b = { rx: [0, 1, 2, 3, 4], ry: [9, 8, null, 6, 5] };
  const g = geo([{ x: a.rx, y: a.ry }, { x: b.rx, y: b.ry }]);
  it('the nearest point of the nearest curve, within 12 px', () => {
    expect(snapPoint([a, b], g, g.sx(1.05), g.sy(1) - 5)).toEqual({ series: 0, i: 1 });
    expect(snapPoint([a, b], g, g.sx(3.05), g.sy(6) + 3)).toEqual({ series: 1, i: 3 });
    expect(snapPoint([a, b], g, g.sx(2), g.sy(4))).toBeNull();
  });
  it('a gap is never marked; a steep curve snaps by distance, not by x alone', () => {
    expect(snapPoint([b], g, g.sx(2), g.sy(7))).toBeNull();
    // x = 1.005 is nearest to the point at x = 1 (y = 5, far below) but on screen it is next to the one at x = 1.02.
    const steep = { rx: [0, 1, 1.02, 10], ry: [0, 5, 10, 0] }, g2 = geo([{ x: steep.rx, y: steep.ry }]);
    expect(snapPoint([steep], g2, g2.sx(1.005), g2.sy(9.8))).toEqual({ series: 0, i: 2 });
  });
});

describe('marks in the store', () => {
  const base = (): Store => ({ ...lib.emptyStore(), seqs: [{ id: 's', name: 'S', seq: '', group: '', desc: '', runs: [], extras: [], structures: [] }] });
  it('add (no duplicates), move, remove', () => {
    let s = lib.addMark(base(), 's', 'c1', 1.5);
    s = lib.addMark(s, 's', 'c1', 1.5);
    s = lib.addMark(s, 's', 'c2', -2);
    expect(s.seqs[0].marks).toEqual([{ curve: 'c1', x: 1.5 }, { curve: 'c2', x: -2 }]);
    s = lib.moveMark(s, 's', 0, 1.75);
    s = lib.removeMark(s, 's', 1);
    expect(s.seqs[0].marks).toEqual([{ curve: 'c1', x: 1.75 }]);
    expect(lib.removeMark(s, 's', 0).seqs[0].marks).toBeUndefined();
  });
  it('survive reopening; the graph draws them with y from the data, and flags one whose curve is gone', async () => {
    const b = await vaultFixture('formats/schema-3-vault'), { svc } = await reopen(b);
    const row = svc.store.seqs.find(q => q.name === 'WRWYCR')!, run = row.runs.find(r => r.sacch === 'ha')!;
    const i = 100, x = run.x[i]!;
    svc.commit(lib.addMark(lib.addMark(svc.store, row.id, run.id, x), row.id, 'gone', 1)); await svc.flush();
    const again = (await reopen(b)).svc.store, r2 = again.seqs.find(q => q.id === row.id)!;
    expect(r2.marks).toEqual([{ curve: run.id, x }, { curve: 'gone', x: 1 }]);
    const st = lib.mergeSettings({}, again.settings), cols = lib.pageCols(again, null);
    const m = buildGraph({ store: again, sel: { mode: 'cell', id: row.id, s: 'ha' }, cols, st, tab: 'pmf', raw: false, fitWell: true, dark: false, domain: sharedDomain(again.seqs, lib.ENTROPY) })!;
    const k = m.series.findIndex(q => q.src === run.id);
    expect(m.marks).toEqual([
      // A PMF graph isn't smoothed, so its value and its drawn height are the same (v added in F138).
      { at: 0, curve: run.id, series: k, x, y: m.series[k].ry[i], v: m.series[k].ry[i], color: m.series[k].color, label: lib.fmtValue(m.series[k].ry[i]!) },
      { at: 1, curve: 'gone', series: -1, x: 1, flagged: 'its curve is no longer here' },
    ]);
  });
  it('a mark whose x is no longer a data point is flagged, not moved', async () => {
    const { svc } = await reopen(await vaultFixture('formats/schema-3-vault'));
    const row = svc.store.seqs.find(q => q.name === 'WRWYCR')!, run = row.runs.find(r => r.sacch === 'ha')!;
    const store = lib.addMark(svc.store, row.id, run.id, run.x[100]! + 0.0001);
    const m = buildGraph({ store, sel: { mode: 'cell', id: row.id, s: 'ha' }, cols: lib.pageCols(store, null), st: lib.mergeSettings({}, store.settings), tab: 'pmf', raw: false, fitWell: true, dark: false, domain: sharedDomain(store.seqs, lib.ENTROPY) })!;
    expect(m.marks[0]).toMatchObject({ curve: run.id, flagged: 'no data point at x = ' + lib.fmtValue(run.x[100]! + 0.0001) });
  });
});

// Review fix (F138): on a smoothed graph a mark sits on the drawn curve, but its value is the data's (before smoothing).
describe('marks on a smoothed curve', () => {
  it('the value is read before smoothing; the dot stays on the drawn curve', async () => {
    const { svc } = await reopen(await vaultFixture('formats/schema-3-vault'));
    for (const e of svc.store.seqs.flatMap(s => s.extras)) await svc.loadAnalysis(e.id);
    const row = svc.store.seqs.find(s => s.name === 'WRWYCR')!, hist = row.extras.find(e => e.type === 'hist')!, c = hist.curves[0];
    const view = (store: Store) => buildGraph({ store, sel: { mode: 'cell', id: row.id, s: 'ha' }, cols: lib.pageCols(store, null), st: lib.mergeSettings({}, store.settings), tab: 'hist', raw: false, fitWell: true, dark: false, domain: sharedDomain(store.seqs, lib.ENTROPY) })!;
    const plain = view(svc.store), k = plain.series.findIndex(q => q.src === c.id), q = plain.series[k];
    expect(q.uy).toBeDefined();
    const i = q.ry.findIndex((v, j) => v != null && q.uy![j] != null && Math.abs(v - q.uy![j]!) > 1e-6);
    const m = view(lib.addMark(svc.store, row.id, c.id, q.rx[i]!)), mk = m.marks[0];
    expect([mk.v, mk.y, mk.label]).toEqual([q.uy![i], q.ry[i], lib.fmtValue(q.uy![i]!)]);
    expect(m.data.pins!.marks[0]).toMatchObject({ y: q.ry[i], label: lib.fmtValue(q.uy![i]!) });
  });
});
