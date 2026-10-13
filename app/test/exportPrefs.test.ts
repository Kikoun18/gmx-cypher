import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { buildGraph, sharedDomain } from '../src/lib/graph';
import { matrixData, matrixTiles, groupRows } from '../src/lib/matrix';
import { AREA } from '../src/lib/metrics';
import { graphScene, matrixScene, toPDF, toSVG } from '../src/lib/export';
import { EXPORT_DEFAULTS, cleanExport, exportLayout, exportName, pngDpi } from '../src/lib/exportPrefs';
import { insideVault, openDest, saveToFolder } from '../src/lib/folders';
import type { Store } from '../src/lib/types';
import { reopen, vaultFixture } from './helpers';

// R8a: export settings (this browser's), the layout they give, and file names.
describe('export settings', () => {
  it('missing or bad values fall back to the defaults, which export as before', () => {
    expect(cleanExport(undefined)).toEqual(EXPORT_DEFAULTS);
    expect(EXPORT_DEFAULTS).toMatchObject({ format: 'pdf', w: 0, h: 0, unit: 'px', scale: 2, theme: 'light', font: 11, title: true, grid: true, name: '{column}_{sequence}_{tab}', dest: 'downloads' });
    expect(cleanExport({ format: 'gif', w: -5, h: 'tall', unit: 'in', scale: 99, theme: 'neon', font: 0, title: 'yes', grid: null, name: '', dest: 'cloud' })).toEqual(EXPORT_DEFAULTS);
    expect(cleanExport({ format: 'svg', w: 85, h: 60, unit: 'mm', scale: 300 / 72, theme: 'print', font: 8, title: false, grid: false, name: '{sequence}', dest: 'folder' }))
      .toEqual({ ...EXPORT_DEFAULTS, format: 'svg', w: 85, h: 60, unit: 'mm', scale: 300 / 72, theme: 'print', font: 8, title: false, grid: false, name: '{sequence}', dest: 'folder' });
  });
  it('layout: automatic size is today’s; mm become points; the font size scales the drawing', () => {
    // R8d added the legend settings (marks below by default; nothing to draw without marks).
    expect(exportLayout(EXPORT_DEFAULTS)).toEqual({ k: 1, theme: 'light', title: true, grid: true, legend: { marks: true, at: 'below' } });
    const mm = exportLayout(cleanExport({ w: 85, h: 60, unit: 'mm', font: 8 })), k = 8 / 11;
    expect(mm.k).toBeCloseTo(k, 12);
    expect(mm.w! * k).toBeCloseTo(85 * 72 / 25.4, 9);
    expect(mm.h! * k).toBeCloseTo(60 * 72 / 25.4, 9);
    expect(mm.fit).toBeCloseTo(85 * 72 / 25.4, 9);
    expect(exportLayout(cleanExport({ w: 1200, unit: 'px' }))).toMatchObject({ k: 1, w: 1200, fit: 1200 });
    expect([pngDpi(cleanExport({ w: 85, unit: 'mm', scale: 300 / 72 })), pngDpi(cleanExport({ w: 85, unit: 'mm', scale: 2 })), pngDpi(EXPORT_DEFAULTS)]).toEqual([300, 144, null]);
  });
  it('file names: the template’s fields, an empty field takes its separator along, and collisions get -2, -3', () => {
    const f = { column: 'HA', sequence: 'POPE', tab: 'order-parameters', project: 'Membranes', page: '', date: '2026-10-11' };
    const taken = new Set<string>();
    expect(exportName('{column}_{sequence}_{tab}', f, 'pdf', taken)).toBe('HA_POPE_order-parameters.pdf');
    expect(exportName('{column}_{sequence}_{tab}', f, 'pdf', taken)).toBe('HA_POPE_order-parameters-2.pdf');
    expect(exportName('{column}_{sequence}_{tab}', { ...f, column: 'ha' }, 'PDF', taken)).toBe('ha_POPE_order-parameters-3.PDF');
    expect(exportName('{project}_{page}_{sequence} {date}', f, 'png', taken)).toBe('Membranes_POPE_2026-10-11.png');
    expect(exportName('{page}-{sequence}/{colum}', f, 'svg', new Set())).toBe('POPE_colum.svg');
    expect(exportName('{page}', f, 'xvg', new Set())).toBe('export.xvg');
  });
});

async function frozen(): Promise<Store> {
  const { svc } = await reopen(await vaultFixture('formats/schema-3-vault'));
  for (const e of svc.store.seqs.flatMap(s => s.extras)) await svc.loadAnalysis(e.id);
  return svc.store;
}
const view = (store: Store, o: { tab?: string; theme?: 'light' | 'dark' | 'print'; bw?: boolean } = {}) => {
  const row = store.seqs.find(s => s.name === 'WRWYCR')!;
  return buildGraph({ store, sel: { mode: 'cell', id: row.id, s: 'ha' }, cols: lib.pageCols(store, null), st: lib.mergeSettings({ bw: !!o.bw }, store.settings), tab: o.tab || 'rdf', raw: false, fitWell: true, dark: false, domain: sharedDomain(store.seqs, lib.ENTROPY), theme: o.theme })!;
};
const texts = (sc: ReturnType<typeof graphScene>) => sc.items.flatMap(i => (i.t === 'text' ? [i.s] : []));

describe('the graph scene follows the settings', () => {
  it('the default settings give today’s scene, byte for byte', async () => {
    const d = view(await frozen()).data;
    expect(graphScene(d, exportLayout(EXPORT_DEFAULTS))).toEqual(graphScene(d));
    expect(new Uint8Array(await toPDF(graphScene(d, exportLayout(EXPORT_DEFAULTS))).arrayBuffer())).toEqual(new Uint8Array(await toPDF(graphScene(d)).arrayBuffer()));
  });
  it('a width and height lay the graph out to fill them; the font size scales the output', async () => {
    const d = view(await frozen()).data, o = exportLayout(cleanExport({ w: 85, h: 100, unit: 'mm', font: 8 })), sc = graphScene(d, o);
    expect(sc.w).toBe(o.w);
    expect(sc.h).toBeCloseTo(o.h!, 6);
    expect(sc.k).toBe(o.k);
    const svg = toSVG(sc), pt = (v: number) => String(+(v).toFixed(2));
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="' + pt(85 * 72 / 25.4) + '" height="' + pt(100 * 72 / 25.4) + '" viewBox="0 0 ' + sc.w + ' ' + sc.h + '">')).toBe(true);
    const pdf = new TextDecoder('latin1').decode(await toPDF(sc).arrayBuffer());
    expect(pdf).toContain('/MediaBox [0 0 ' + pt(85 * 72 / 25.4) + ' ' + pt(100 * 72 / 25.4) + ']');
    expect(pdf).toContain(+o.k!.toFixed(6) + ' 0 0 ' + +o.k!.toFixed(6) + ' 0 0 cm');
    // Too low for the title, legend and note: the plot keeps 80 units and the figure is taller than asked.
    const low = graphScene(d, exportLayout(cleanExport({ w: 85, h: 30, unit: 'mm', font: 8 }))), plot = (sc: typeof low) => sc.items.find(i => i.t === 'line' && i.sw === 2 && i.x1 === i.x2) as { y1: number; y2: number };
    expect(plot(low).y2 - plot(low).y1).toBe(80);
    expect(low.h).toBeGreaterThan(30 * 72 / 25.4 / o.k!);
  });
  it('without the title block the title and kicker go; without the grid only the tick marks stay', async () => {
    const d = view(await frozen()).data, full = graphScene(d);
    const bare = graphScene(d, { title: false, grid: false });
    expect(texts(full)).toContain(d.title.toUpperCase());
    expect(texts(bare)).not.toContain(d.title.toUpperCase());
    expect(texts(bare).some(s => s.includes(d.kicker!.toUpperCase().slice(0, 6)))).toBe(false);
    expect(texts(bare).filter(s => s !== d.title.toUpperCase() && !s.startsWith(d.kicker!.toUpperCase().slice(0, 6)) && s !== d.sub)).toEqual(texts(full).filter(s => s !== d.title.toUpperCase() && !s.startsWith(d.kicker!.toUpperCase().slice(0, 6)) && s !== d.sub));
    const long = (sc: typeof full) => sc.items.filter(i => i.t === 'line' && i.stroke === '#dcd8d6' && Math.max(Math.abs(i.x2 - i.x1), Math.abs(i.y2 - i.y1)) > 20).length;
    expect(long(full)).toBeGreaterThan(5);
    expect(long(bare)).toBe(0);
  });
  it('dark: the dark page, and each curve in its dark-screen colour; print: greys with dashes on white', async () => {
    const store = await frozen(), light = view(store), dark = view(store, { theme: 'dark' }), screenDark = buildGraph({ ...viewArgs(store), dark: true })!;
    const sc = graphScene(dark.data, { theme: 'dark' });
    expect(sc.bg).toBe('#141312');
    expect(dark.data.series.map(s => s.color)).toEqual(screenDark.series.map(s => s.color));
    expect(dark.data.series.map(s => s.color)).not.toEqual(light.data.series.map(s => s.color));
    const print = view(store, { theme: 'print' }), bw = view(store, { bw: true });
    expect(print.data.series.map(s => [s.color, s.dash])).toEqual(bw.data.series.map(s => [s.color, s.dash]));
    const ps = graphScene(print.data, { theme: 'print' });
    expect([ps.bg, ps.items.filter(i => i.t === 'text').every(i => ['#000000', '#555555'].includes((i as { fill: string }).fill))]).toEqual(['#ffffff', true]);
  });
  it('a mark is drawn in its curve’s exported colour, even from a dark screen', async () => {
    const store = await frozen(), row = store.seqs.find(s => s.name === 'WRWYCR')!, run = row.runs.find(r => r.sacch === 'ha')!;
    const m = buildGraph({ ...viewArgs(lib.addMark(store, row.id, run.id, run.x[100]!)), tab: 'pmf', dark: true })!, k = m.series.findIndex(q => q.src === run.id);
    expect(m.data.pins!.marks[0].color).toBe(m.data.series[k].color);
    expect(m.data.series[k].color).not.toBe(m.series[k].color);
  });
});
const viewArgs = (store: Store) => {
  const row = store.seqs.find(s => s.name === 'WRWYCR')!;
  return { store, sel: { mode: 'cell' as const, id: row.id, s: 'ha' }, cols: lib.pageCols(store, null), st: lib.mergeSettings({}, store.settings), tab: 'rdf', raw: false, fitWell: true, dark: false, domain: sharedDomain(store.seqs, lib.ENTROPY) };
};

describe('the matrix scene follows the settings', () => {
  const data = async () => {
    const store = await frozen(), cols = lib.pageCols(store, null), st = lib.mergeSettings({}, store.settings), tiles = matrixTiles(store.seqs, cols, AREA, st, null);
    const { glist, anyGroup } = groupRows(store.seqs, cols, tiles, false);
    return matrixData({ project: 'P', page: null, def: AREA, st, pmfT: lib.ENTROPY, cols, glist, anyGroup, tiles });
  };
  it('a width scales the whole matrix to it (the font follows); without one it keeps its size', async () => {
    const d = await data(), natural = matrixScene(d);
    expect(matrixScene(d, exportLayout(EXPORT_DEFAULTS))).toEqual(natural);
    const fit = matrixScene(d, exportLayout(cleanExport({ w: 85, unit: 'mm' })));
    expect([fit.w, fit.h]).toEqual([natural.w, natural.h]);
    expect(fit.w * fit.k!).toBeCloseTo(85 * 72 / 25.4, 9);
  });
  it('dark: dark page and tiles; print: grey tiles, black titles', async () => {
    const d = await data(), dk = matrixScene(d, { theme: 'dark' }), pr = matrixScene(d, { theme: 'print' });
    const tiles = (sc: typeof dk) => sc.items.filter(i => i.t === 'rect' && i.w === 56 && i.h === 56 && i.fill).map(i => (i as { fill: string }).fill);
    expect(dk.bg).toBe('#141312');
    expect(tiles(dk)).toEqual(d.groups.flatMap(g => g.rows.flatMap(r => r.cells.flatMap(c => (c ? [d.scale!.color(c.v, true)] : [])))));
    expect(tiles(pr).every(f => /^#([0-9a-f]{2})\1\1$/.test(f))).toBe(true);
    expect(pr.items.filter(i => i.t === 'text').every(i => ['#000000', '#555555', '#ffffff'].includes((i as { fill: string }).fill))).toBe(true);
  });
});


describe('the export folder', () => {
  const fakeDir = (names: string[]) => {
    const files = new Map(names.map(n => [n, '']));
    return { name: 'figures', files, getFileHandle: async (n: string, o?: { create?: boolean }) => {
      if (!files.has(n) && !o?.create) throw new DOMException('', 'NotFoundError');
      return { createWritable: async () => ({ write: async (b: Blob) => { files.set(n, await b.text()); }, close: async () => {} }) };
    } };
  };
  it('a name already in the folder gets -2, -3; nothing there is overwritten', async () => {
    const dir = fakeDir(['a.pdf', 'a-2.pdf']);
    const names = await saveToFolder(dir as unknown as FileSystemDirectoryHandle, [{ name: 'a.pdf', blob: new Blob(['new']) }, { name: 'b.svg', blob: new Blob(['b']) }]);
    expect(names).toEqual(['a-3.pdf', 'b.svg']);
    expect([...dir.files]).toEqual([['a.pdf', ''], ['a-2.pdf', ''], ['a-3.pdf', 'new'], ['b.svg', 'b']]);
  });
  it('the vault folder and folders inside it are refused; downloads need nothing', async () => {
    const inside = {}, outside = {}, vault = { resolve: async (d: object) => (d === inside || d === vault ? ['x'] : null) } as unknown as FileSystemDirectoryHandle;
    const h = (o: object) => o as FileSystemDirectoryHandle;
    expect([await insideVault(h(inside), vault), await insideVault(vault, vault), await insideVault(h(outside), vault), await insideVault(h(inside), null)]).toEqual([true, true, false, false]);
    expect(await openDest('downloads', vault)).toEqual({ dir: null, why: '' });
  });
});
