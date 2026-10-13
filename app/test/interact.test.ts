import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { dataToPx, nearestIndex, pxToData, readout, stepIndex } from '../src/lib/interact';
import { buildGraph, sharedDomain } from '../src/lib/graph';
import { reopen, vaultFixture } from './helpers';

// R5a: the hover readout reads the full data (never the decimated drawing), at the nearest data point (F101).
describe('nearest data point', () => {
  it('binary search on ascending x; gaps are skipped; outside the data, the end', () => {
    const x = [0, 1, 2, 3, 4, 5], y = [1, 2, null, 4, NaN, 6];
    expect([1.4, 1.6, 2.1, 3.9, 4.6, -10, 99].map(v => nearestIndex(x, y, v))).toEqual([1, 1, 3, 3, 5, 0, 5]);
  });
  it('descending and unsorted x work too; no point with a value gives -1', () => {
    expect(nearestIndex([5, 4, 3, 2], [1, 1, 1, 1], 3.2)).toBe(2);
    expect(nearestIndex([0, 3, 1, 2], [1, 1, 1, 1], 2.9)).toBe(1);
    expect(nearestIndex([0, 1], [null, NaN], 0)).toBe(-1);
  });
  it('agrees with a plain scan on random data with gaps in x and y, both directions', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 300; n++) {
      const len = 1 + Math.floor(rnd() * 30), xs: (number | null)[] = [], ys: (number | null)[] = [];
      let v = rnd() * 10;
      for (let i = 0; i < len; i++) { v += rnd() * 2; xs.push(rnd() < 0.15 ? null : v); ys.push(rnd() < 0.2 ? null : rnd()); }
      if (rnd() < 0.5) xs.reverse();
      const q = rnd() * 80 - 10, got = nearestIndex(xs, ys, q);
      const ok = (i: number) => xs[i] != null && ys[i] != null, dist = (i: number) => Math.abs((xs[i] as number) - q);
      const all = xs.map((_, i) => i).filter(ok);
      if (!all.length) { expect(got).toBe(-1); continue; }
      expect(ok(got)).toBe(true);
      expect(dist(got)).toBe(Math.min(...all.map(dist)));
    }
  });
  it('25,001 points in well under a millisecond per lookup', () => {
    const x = Array.from({ length: 25001 }, (_, i) => i * 2), y = x.map(v => Math.sin(v));
    const t0 = performance.now();
    for (let k = 0; k < 2000; k++) nearestIndex(x, y, (k * 25.3) % 50000);
    expect((performance.now() - t0) / 2000).toBeLessThan(0.2);
  });
  it('stepping with the keyboard skips points without a value and stops at the ends', () => {
    const y = [1, null, 3, NaN, 5];
    expect([stepIndex(y, 0, 1), stepIndex(y, 2, 1), stepIndex(y, 4, 1), stepIndex(y, 2, -1), stepIndex(y, 0, -1)]).toEqual([2, 4, 4, 0, 0]);
  });
});

describe('pixels and data on linear axes', () => {
  it('round trip through the plot geometry', () => {
    const g = lib.buildPlotMulti([{ x: [0, 10], y: [-5, 5] }], { w: 640, h: 400, domain: { lo: -5, hi: 5 }, yStep: null });
    const p = dataToPx(g, 2.5, 1);
    expect(p).toEqual({ px: g.sx(2.5), py: g.sy(1) });
    const d = pxToData(g, p.px, p.py);
    expect([d.x, d.y].map(v => Number(v.toFixed(9)))).toEqual([2.5, 1]);
    expect(pxToData(g, g.plotL, g.plotT)).toEqual({ x: 0, y: 5 });
  });
});

describe('the readout: each visible curve at the nearest point, with units; smoothed and raw when smoothing is on', () => {
  it('a PMF cell: both runs, in the graph’s units', async () => {
    const store = (await reopen(await vaultFixture('formats/schema-3-vault'))).svc.store, cols = lib.pageCols(store, null), row = store.seqs[0];
    const st = lib.mergeSettings({}, store.settings);
    const m = buildGraph({ store, sel: { mode: 'cell', id: row.id, s: 'ha' }, cols, st, tab: 'pmf', raw: false, fitWell: true, dark: false, domain: sharedDomain(store.seqs, lib.ENTROPY) })!;
    const r = readout(m.series, 1.5, m.xLabel, m.yLabel);
    expect(r.map(q => q.label)).toEqual(m.series.map(s => s.label));
    const s0 = m.series[0], i = nearestIndex(s0.rx, s0.ry, 1.5);
    expect(r[0]).toMatchObject({ x: s0.rx[i], y: s0.ry[i], xUnit: 'nm', yUnit: 'kJ/mol' });
    expect(r[0].text).toBe(r[0].label + ': x = ' + lib.fmtValue(s0.rx[i]!) + ' nm, y = ' + lib.fmtValue(s0.ry[i]!) + ' kJ/mol');
  });
  it('units with super- and subscripts read as plain text', () => {
    const series = [{ label: 'P', color: '#000', rx: [0, 1], ry: [120.8, 3] }];
    expect(readout(series, 0, 'z (nm)', 'Density (kg m^{-3})')[0].text).toBe('P: x = 0.00 nm, y = 120.80 kg m⁻³');
  });
  it('with smoothing, the smoothed value and the raw one at the same point', () => {
    const series = [{ label: 'RDF · run 1', color: '#000', rx: [0, 1, 2], ry: [1, 2, 3], uy: [1.5, 2.5, 3.5] }];
    expect(readout(series, 1.2, 'r (nm)', 'g(r)')[0]).toMatchObject({ x: 1, y: 2, raw: 2.5, text: 'RDF · run 1: x = 1.00 nm, y = 2.00 (smoothed; 2.50 before smoothing)' });
  });
});
