import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { buildGraph, sharedDomain } from '../src/lib/graph';
import { matrixTiles } from '../src/lib/matrix';
import { AREA, tileProvenance } from '../src/lib/metrics';
import { graphScene, gridPlace, gridScene, legendExtra, toPDF, type GraphData } from '../src/lib/export';
import { EXPORT_DEFAULTS, cleanExport, exportLayout } from '../src/lib/exportPrefs';
import type { Store } from '../src/lib/types';
import { reopen, vaultFixture } from './helpers';

// R8d: the legend of marks and the matrix value, where it goes, and several graphs in one file.
async function marked(): Promise<{ store: Store; d: GraphData; m: NonNullable<ReturnType<typeof buildGraph>> }> {
  const { svc } = await reopen(await vaultFixture('formats/schema-3-vault'));
  const row = svc.store.seqs.find(s => s.name === 'WRWYCR')!, run = row.runs.find(r => r.sacch === 'ha')!;
  const store = lib.addMark(svc.store, row.id, run.id, run.x[100]!);
  const m = buildGraph({ store, sel: { mode: 'cell', id: row.id, s: 'ha' }, cols: lib.pageCols(store, null), st: lib.mergeSettings({}, store.settings), tab: 'pmf', raw: false, fitWell: true, dark: false, domain: sharedDomain(store.seqs, lib.ENTROPY) })!;
  return { store, d: m.data, m };
}
const texts = (sc: ReturnType<typeof graphScene>) => sc.items.flatMap(i => (i.t === 'text' ? [i] : []));

describe('the legend', () => {
  it('settings: marks and the matrix value by default, below; several graphs make one PDF of 2-column grids', () => {
    expect(EXPORT_DEFAULTS).toMatchObject({ legendMarks: true, legendValue: true, legendAt: 'below', layout: 'pdf', gridCols: 2 });
    expect(cleanExport({ legendMarks: 1, legendAt: 'top', layout: 'zip', gridCols: 2.5 })).toEqual(EXPORT_DEFAULTS);
    expect(cleanExport({ legendMarks: false, legendValue: false, legendAt: 'inside', layout: 'grid', gridCols: 3 })).toMatchObject({ legendMarks: false, legendValue: false, legendAt: 'inside', layout: 'grid', gridCols: 3 });
    expect(exportLayout(EXPORT_DEFAULTS).legend).toEqual({ marks: true, at: 'below' });
  });
  it('contents: each mark’s value with its units and curve, then the matrix value lines', async () => {
    const { d, m } = await marked(), mk = m.marks[0];
    const v = { ...d, values: ['Area: -0.45 ± 0.14 kJ·nm/mol (SD, n = 2) · integrated well · entropy correction'] };
    expect(legendExtra(v, true)).toEqual([
      { s: m.series[mk.series].label + ': ' + mk.label + ' kJ/mol at x = ' + lib.fmtValue(mk.x) + ' nm', color: d.series[mk.series].color },
      { s: v.values[0] },
    ]);
    expect(legendExtra(v, false)).toEqual([{ s: v.values[0] }]);
  });
  it('the matrix value: the tile’s value, spread, unit, function and transform, without the data details', async () => {
    const { store } = await marked(), st = lib.mergeSettings({}, store.settings), cols = lib.pageCols(store, null), row = store.seqs.find(s => s.name === 'WRWYCR')!;
    const tile = matrixTiles(store.seqs, cols, AREA, st, null).get(row.id + '|ha')!;
    const short = tileProvenance(row, 'ha', AREA, tile, { st, skip: null, short: true }), full = tileProvenance(row, 'ha', AREA, tile, { st, skip: null });
    // The value, then the function (unless it only repeats the metric's name) and the transform.
    const parts = full.split(' · '), upTo = parts.indexOf(lib.TRANSFORMS.entropy.label);
    expect(short).toBe(AREA.label + ': ' + [parts[0], ...parts.slice(1, upTo + 1).filter(x => x !== AREA.label)].join(' · '));
    expect(short).toContain('kJ·nm/mol');
    expect(short).toContain(lib.TRANSFORMS.entropy.label);
    expect(short).not.toMatch(/points|runs? \d/);
  });
  it('below, right or inside the plot; a graph without marks or values exports as before', async () => {
    const { d } = await marked(), v = { ...d, values: ['Area: -0.45'] };
    const plain = graphScene(d), axis = (sc: typeof plain) => sc.items.find(i => i.t === 'line' && i.sw === 2 && i.y1 === i.y2) as { x1: number; x2: number; y1: number };
    expect(graphScene({ ...d, pins: undefined }, exportLayout(EXPORT_DEFAULTS))).toEqual(graphScene({ ...d, pins: undefined }));
    const below = graphScene(v, { legend: { marks: true, at: 'below' } }), right = graphScene(v, { legend: { marks: true, at: 'right' } }), inside = graphScene(v, { legend: { marks: true, at: 'inside' } });
    const at = (sc: typeof plain, s: string) => texts(sc).find(t => t.s === s)!;
    expect(at(below, 'Area: -0.45').y).toBeGreaterThan(axis(below).y1);
    expect(axis(right).x2).toBeLessThan(axis(plain).x2 - 100);
    expect(at(right, 'Area: -0.45').x).toBeGreaterThan(axis(right).x2);
    const ins = at(inside, 'Area: -0.45');
    expect(ins.x > axis(inside).x1 && ins.x < axis(inside).x2 && ins.y < axis(inside).y1).toBe(true);
    expect(inside.items.some(i => i.t === 'rect' && i.stroke && i.fill === '#ffffff')).toBe(true);
    // Mark lines only when asked; the matrix value is in the data only when the settings ask for it (the caller adds it).
    const markLine = (sc: typeof plain) => texts(sc).some(t => / at x = /.test(t.s));
    expect([markLine(graphScene(v)), markLine(below)]).toEqual([false, true]);
  });
});

describe('several graphs in one file', () => {
  it('a multi-page PDF: one page per graph, each its own size; one page is the single-graph PDF', async () => {
    const { d } = await marked(), a = graphScene(d), b = graphScene(d, { w: 600 }), c = graphScene(d, { title: false });
    const one = new TextDecoder('latin1').decode(await toPDF([a]).arrayBuffer());
    expect(one).toBe(new TextDecoder('latin1').decode(await toPDF(a).arrayBuffer()));
    const pdf = new TextDecoder('latin1').decode(await toPDF([a, b, c]).arrayBuffer());
    expect(pdf).toContain('/Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3');
    expect([...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map(m => [+m[1], +m[2]])).toEqual([a, b, c].map(s => [+s.w.toFixed(2), +s.h.toFixed(2)]));
  });
  it('a grid figure: columns as wide as the widest graph, each row as tall as its tallest', async () => {
    expect(gridPlace([{ w: 100, h: 50 }, { w: 100, h: 80 }, { w: 90, h: 60 }], 2, 24)).toEqual({ at: [{ x: 0, y: 0 }, { x: 124, y: 0 }, { x: 0, y: 104 }], w: 224, h: 164 });
    const { d } = await marked(), a = graphScene(d), g = gridScene([a, a, a], 2);
    expect([g.w, g.h, g.items.length]).toEqual([a.w * 2 + 24, a.h * 2 + 24, a.items.length * 3]);
    const t0 = texts(a)[0], shifted = texts(g).filter(t => t.s === t0.s);
    expect(shifted.map(t => [t.x - t0.x, t.y - t0.y])).toEqual([[0, 0], [a.w + 24, 0], [0, a.h + 24]]);
  });
});

describe('long legend lines', () => {
  it('wrap to the legend’s width instead of being cut', async () => {
    const { d } = await marked(), long = 'Area: -0.45 ± 0.14 kJ·nm/mol (SD, n = 2) · integrated well — depth × width · entropy correction · and a little more to say';
    const sc = graphScene({ ...d, values: [long] }, { legend: { marks: false, at: 'right' } }), lines = sc.items.flatMap(i => (i.t === 'text' && long.includes(i.s) && i.s.length > 3 ? [i] : []));
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.map(t => t.s).join(' ')).toBe(long);
    expect(new Set(lines.map(t => t.x)).size).toBe(1);
  });
});

// Review fix (F138): in a PDF the text rise belongs to the page's state, so a label ending in a superscript must not
// leave the next text raised.
describe('PDF text after a superscript', () => {
  it('starts back on its line', async () => {
    const sc = { w: 200, h: 100, bg: '#ffffff', items: [
      { t: 'text' as const, x: 10, y: 20, s: 'kg m^{-3}', size: 10, fill: '#000000', anchor: 'start' as const, bold: false },
      { t: 'text' as const, x: 10, y: 40, s: 'plain', size: 10, fill: '#000000', anchor: 'start' as const, bold: false },
    ] };
    const pdf = new TextDecoder('latin1').decode(await toPDF(sc).arrayBuffer()), second = pdf.slice(pdf.indexOf('(plain)') - 120, pdf.indexOf('(plain)'));
    expect(second.slice(second.lastIndexOf('BT'))).toMatch(/ 0 Ts/);
  });
});
