import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { runStats } from '../src/lib/pmf';
import { fixture, text } from './helpers';

describe('curveExtreme: the marked point (R3a)', () => {
  const x = [0, 1, 2, 3, 4, 5];
  it.each([
    // y, kind, expected {i, x, y} or null
    [[1, 3, 2, 3, 0, 1], 'max', { i: 1, x: 1, y: 3 }],          // tie: the first wins
    [[1, 3, 2, 3, 0, 0], 'min', { i: 4, x: 4, y: 0 }],
    [[null, 5, NaN, 7, Infinity, 2], 'max', { i: 3, x: 3, y: 7 }], // null and non-finite skipped
    [[NaN, null, -1, -Infinity, 4, 4], 'min', { i: 2, x: 2, y: -1 }],
    [[null, null, null, null, null, null], 'max', null],          // no finite point: no marker
    [[NaN, NaN, NaN, NaN, NaN, NaN], 'min', null],
  ] as const)('%j %s', (y, kind, want) => expect(lib.curveExtreme(x, [...y], kind)).toEqual(want));
  it('one point', () => expect(lib.curveExtreme([2.5], [0.7], 'max')).toEqual({ i: 0, x: 2.5, y: 0.7 }));
  it('a point without an x is skipped', () => expect(lib.curveExtreme([0, null, 2], [1, 9, 2], 'max')).toEqual({ i: 2, x: 2, y: 2 }));
  it('smoothing on and off: the marker sits on the curve that is drawn', () => {
    const t = lib.parseTable(text(fixture('gmx/07.md_rdf_protein_sugar.xvg'))), X = t.cols[0], Y = t.cols[1];
    const raw = lib.curveExtreme(X, Y, 'max')!, sm = lib.curveExtreme(X, lib.smoothY(Y, 4), 'max')!;
    expect(raw.y).toBe(Math.max(...Y.filter(Number.isFinite)));
    expect(sm.y).toBe(Math.max(...(lib.smoothY(Y, 4) as number[]).filter(Number.isFinite)));
    expect(sm.y).toBeLessThan(raw.y);
  });
  it('the PMF minimum marker is where it was (runStats)', () => {
    const r = lib.runFromTable(lib.parseTable(text(fixture('hmrfast6_ha_a_t200000.xvg'))), 1, 2);
    const rs = runStats(r.y), m = lib.curveExtreme(r.x, r.y, 'min')!;
    expect([m.i, m.x, m.y]).toEqual([rs.at, r.x[rs.at], rs.min]);
  });
});

describe('marker setting per analysis type (R3b)', () => {
  const types = lib.getAnalyses({});
  it.each([['rdf', 'max'], ['rmsf', 'max'], ['hist', 'none'], ['rmsd', 'none'], ['rg', 'none'], ['hbond', 'none'], ['dist', 'none'], ['energy', 'none']])('default for %s: %s (F57)', (k, want) => {
    expect(lib.markerOf(types.find(t => t.k === k)!)).toBe(want);
  });
  it('a new analysis has none; a set value wins; the label defaults to none', () => {
    const t = lib.newAnalysis(types, 'Mine');
    expect([lib.markerOf(t), lib.markerOf({ ...t, marker: 'min' }), lib.markerLabelOf(t), lib.markerLabelOf({ ...t, markerLabel: 'x' })]).toEqual(['none', 'min', 'none', 'x']);
  });
});

describe('the marker keys in analyses.json (additive, F30 precedent)', () => {
  it('round-trip, and survive an edit by the code path an older app uses', async () => {
    const { newVault, reopen } = await import('./helpers');
    const { b, svc, pid } = await newVault();
    const analyses = lib.DEFAULT_ANALYSES.map(a => (a.k === 'rdf' ? { ...a, marker: 'min' as const, markerLabel: 'y' as const } : a));
    svc.commit({ ...svc.store, settings: { ...svc.store.settings, analyses } });
    await svc.flush();
    expect(JSON.parse(await b.readText('.matrix/settings/' + pid + '/analyses.json')).analyses.find((a: { k: string }) => a.k === 'rdf')).toMatchObject({ marker: 'min', markerLabel: 'y' });
    // An older app reads analyses.json whole and edits by spreading the existing object ({ ...a, ...patch }), as before batch 2.
    const again = await reopen(b);
    const old = again.svc.store.settings!.analyses!.map(a => (a.k === 'rdf' ? { ...a, smooth: 2 } : a));
    again.svc.commit({ ...again.svc.store, settings: { ...again.svc.store.settings, analyses: old } });
    await again.svc.flush();
    const rdf = (await reopen(b)).svc.store.settings!.analyses!.find(a => a.k === 'rdf')!;
    expect([rdf.marker, rdf.markerLabel, rdf.smooth]).toEqual(['min', 'y', 2]);
  });
  it('travel with a dataset export', async () => {
    const { exportDataset, importAsProject } = await import('../src/lib/storage/exchange');
    const analyses = lib.DEFAULT_ANALYSES.map(a => (a.k === 'rdf' ? { ...a, marker: 'none' as const, markerLabel: 'x' as const } : a));
    const { text: json } = await exportDataset(lib.emptyStore(), { project: 'P', settings: { analyses }, src: { read: async () => new Blob(), meta: () => undefined } });
    expect((await importAsProject(json)).store.settings!.analyses!.find(a => a.k === 'rdf')).toMatchObject({ marker: 'none', markerLabel: 'x' });
  });
});

describe('markers on screen and in exports (R3c)', () => {
  const t = lib.parseTable(text(fixture('gmx/07.md_rdf_protein_sugar.xvg'))), X = t.cols[0], Y = t.cols[1];
  it('curveMark: the extreme, with the chosen label; none gives no mark', () => {
    expect(lib.curveMark([0, 1, 2], [1, 3, 2], 'max', 'none')).toEqual({ x: 1, y: 3, halo: true });
    expect(lib.curveMark([0, 1.25, 2], [1, 3.14159, 2], 'max', 'y')).toEqual({ x: 1.25, y: 3.14159, halo: true, label: '3.14' });
    expect(lib.curveMark([0, 1.25, 2], [1, 3.14159, 2], 'max', 'x')!.label).toBe('1.25');
    expect(lib.curveMark([0, 1, 2], [1, 3, 2], 'none', 'y')).toBeUndefined();
    expect(lib.curveMark([0, 1], [null, null], 'max', 'y')).toBeUndefined();
  });
  it('plotMarkers: one per shown curve that has a mark, dimmed with its curve, none off the plot', () => {
    const series = [
      { k: 'a', x: X, y: Y, color: '#111111', op: 1, mark: lib.curveMark(X, Y, 'max', 'none') },
      { k: 'b', x: X, y: Y.map(v => (v == null ? v : v * 0.8)), color: '#222222', op: 0.3, mark: lib.curveMark(X, Y.map(v => (v == null ? v : v * 0.8)), 'max', 'x') },
      { k: 'c', x: X, y: Y, color: '#333333', op: 1 },
    ];
    const g = lib.buildPlotMulti(series, { w: 600, h: 400 });
    const m = lib.plotMarkers(series, g);
    expect(m.map(x => [x.k, x.op, x.color, x.label])).toEqual([['a', 1, '#111111', undefined], ['b', 0.3, '#222222', String(+series[1].mark!.x.toPrecision(3))]]);
    expect(m[0]).toMatchObject({ x: g.sx(series[0].mark!.x), y: g.sy(series[0].mark!.y), halo: true });
    expect(lib.plotMarkers(series, lib.buildPlotMulti(series, { w: 600, h: 400, domain: { lo: -1, hi: 0.5 } }))).toEqual([]);
  });
  it('the export scene draws the same marks as the screen: on the drawn curve, with the label', async () => {
    const { graphScene } = await import('../src/lib/export');
    const sm = lib.smoothY(Y, 4), mark = lib.curveMark(X, sm, 'max', 'y')!;
    const sc = graphScene({ file: 'x', title: 'T', xLabel: 'x', yLabel: 'y', series: [{ x: X, y: sm, mark, label: 'run 1', color: '#1a7a4c' }] });
    const circles = sc.items.filter(i => i.t === 'circle') as { cx: number; cy: number; fill: string }[];
    const poly = sc.items.find(i => i.t === 'poly') as { segs: number[][][] };
    expect(circles.map(c => c.fill)).toEqual(['#ffffff', '#1a7a4c']); // halo, then the dot
    // The dot sits on a vertex of the drawn (smoothed) curve: the same point the screen marks.
    expect(poly.segs.flat().some(([x, y]) => Math.abs(x - circles[1].cx) < 0.06 && Math.abs(y - circles[1].cy) < 0.06)).toBe(true);
    expect(sc.items.some(i => i.t === 'text' && i.s === mark.label)).toBe(true);
  });
  it('a dimmed curve\'s label is drawn in its dimmed colour, not full ink (review, batch 2)', async () => {
    const { graphScene } = await import('../src/lib/export');
    const mark = { ...lib.curveMark([0, 1, 2], [1, 3, 2], 'max', 'y')!, dim: true };
    const sc = graphScene({ file: 'x', title: 'T', xLabel: 'x', yLabel: 'y', series: [{ x: [0, 1, 2], y: [1, 3, 2], mark, label: 'run 1', color: '#b8b3b0' }] });
    expect((sc.items.find(i => i.t === 'text' && i.s === mark.label) as { fill: string }).fill).toBe('#b8b3b0');
  });
  it('screen and export write a label on the left of its dot at the same edge', () => {
    expect([lib.labelLeft(600, 700), lib.labelLeft(650, 700)]).toEqual([false, true]);
  });
  it('the PMF minimum keeps its plain dot (no halo)', () => {
    const r = lib.runFromTable(lib.parseTable(text(fixture('hmrfast6_ha_a_t200000.xvg'))), 1, 2);
    expect(lib.curveMark(r.x, r.y, 'min', 'none', false)).toMatchObject({ halo: false });
  });
});
