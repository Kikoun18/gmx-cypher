import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { buildGraph, sharedDomain } from '../src/lib/graph';
import { graphScene } from '../src/lib/export';
import type { Store } from '../src/lib/types';
import { fixture, withAnalysis } from './helpers';

// R1c-2: display styles per type (points, bars, auto) and decimation for drawing only.
const coords = (d: string) => (d.match(/[ML][^ML]*/g) || []).map(t => t.slice(1).trim().split(' ').map(Number));

describe('decimate: drawing a large curve', () => {
  const n = 25001, x = Array.from({ length: n }, (_, i) => i * 2), y = x.map((v, i) => Math.sin(v / 900) * 50 + ((i * 7919) % 101) - 50 + (i === 12345 ? 400 : 0));
  const g = lib.buildPlotMulti([{ x, y }], { w: 720, h: 450, pad: { l: 58, r: 14, t: 14, b: 36 } });
  const pts = coords(g.paths[0]), cols = (720 - 58 - 14) * 2;
  it('draws at most four points per half-pixel column', () => expect(pts.length).toBeLessThanOrEqual(4 * cols));
  it('keeps every column’s minimum and maximum, the first and last point, and the spike', () => {
    const byCol = new Map<number, number[]>();
    x.forEach((v, i) => { const c = Math.floor((g.sx(v) - g.plotL) * 2); const sy = +g.sy(y[i]).toFixed(1); const m = byCol.get(c) || [Infinity, -Infinity]; byCol.set(c, [Math.min(m[0], sy), Math.max(m[1], sy)]); });
    const drawn = new Map<number, number[]>();
    for (const [px, py] of pts) { const c = Math.floor((px - g.plotL) * 2); drawn.set(c, (drawn.get(c) || []).concat(py)); }
    const near = (c: number) => [c - 1, c, c + 1].flatMap(k => drawn.get(k) || []);
    let worst = 0;
    for (const [c, [lo, hi]] of byCol) worst = Math.max(worst, ...[lo, hi].map(v => Math.min(...near(c).map(p => Math.abs(p - v)))));
    expect(worst).toBeLessThan(0.11);
    expect([pts[0], pts.at(-1)]).toEqual([[+g.sx(0).toFixed(1), +g.sy(y[0]).toFixed(1)], [+g.sx(x[n - 1]).toFixed(1), +g.sy(y[n - 1]).toFixed(1)]]);
    expect(Math.min(...pts.map(p => p[1]))).toBe(+g.sy(Math.max(...y)).toFixed(1));
  });
  it('keeps gaps, and leaves a curve that fits untouched', () => {
    const yy = y.map((v, i) => (i > 1000 && i < 2000 ? null : v));
    expect((lib.buildPlotMulti([{ x, y: yy }], { w: 720, h: 450 }).paths[0].match(/M/g) || []).length).toBe(2);
    const small = { x: x.slice(0, 5000), y: y.slice(0, 5000) };
    expect(coords(lib.buildPlotMulti([small], { w: 720, h: 450 }).paths[0])).toHaveLength(5000);
  });
});

describe('display styles', () => {
  const ana = (s: Store, type: string, file: string, bytes = fixture('examples/' + file)) => withAnalysis(s, { name: 'POPC', col: 'ha', type, file, bytes }).store;
  const graph = (s: Store, tab: string) => buildGraph({ store: s, sel: { mode: 'cell', id: s.seqs[0].id, s: 'ha' }, cols: lib.pageCols(s, null), st: lib.mergeSettings({}, s.settings), tab, raw: false, fitWell: true, dark: false, domain: sharedDomain(s.seqs, lib.ENTROPY) })!;
  it('order parameters are points, one shape per curve, never joined', () => {
    const m = graph(ana(lib.emptyStore(), 'order', 'order_POPE.xvg'), 'order');
    expect(m.series.map(s => [s.style, s.shape])).toEqual([['points', 0], ['points', 1], ['points', 2]]);
    expect(m.lines.every(l => l.d === '')).toBe(true);
    expect(m.g.points[0]).toHaveLength(32);
    const items = graphScene(m.data).items;
    expect([items.filter(i => i.t === 'poly' && i.segs.length).length, items.filter(i => i.t === 'shape').length > 32]).toEqual([0, true]);
  });
  it('Data is drawn as points when its x are consecutive whole numbers, else as a line (F85)', () => {
    const steps = new TextEncoder().encode(Array.from({ length: 10 }, (_, i) => i + 1 + ' ' + (i % 3)).join('\n'));
    expect(graph(ana(lib.emptyStore(), 'data', 'steps.dat', steps), 'data').series[0].style).toBe('points');
    expect(graph(ana(lib.emptyStore(), 'data', 'membrane_thickness.dat'), 'data').series[0].style).toBe('line');
  });
  it('bars are grouped side by side from zero', () => {
    const s = ana(lib.emptyStore(), 'order', 'order_POPE.xvg');
    const t = { ...lib.DEFAULT_ANALYSES.find(a => a.k === 'order')!, style: 'bars' as const };
    const m = graph({ ...s, settings: { analyses: lib.DEFAULT_ANALYSES.map(a => (a.k === 'order' ? t : a)) } }, 'order');
    const [a, b] = [m.g.bars[0][0], m.g.bars[1][0]];
    expect(a.y + a.h).toBeCloseTo(m.g.inRangeZero ? m.g.zeroY : m.g.plotB, 0);
    expect([b.x - (a.x + a.w) >= -0.01, b.x - (a.x + a.w) < 0.5]).toEqual([true, true]);
    expect(graphScene(m.data).items.filter(i => i.t === 'rect' && i.fill && i.fill !== '#ec3013').length).toBe(96);
  });
});
