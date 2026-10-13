import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { buildGraph, sharedDomain } from '../src/lib/graph';
import { graphScene, graphXvg, textW, toPDF, toSVG, type Scene } from '../src/lib/export';
import { exportDataset } from '../src/lib/storage/exchange';
import type { Store } from '../src/lib/types';
import { fixture, newVault, reopen, withAnalysis } from './helpers';

// R1c-1: labels from the file (F82), drawn with super- and subscripts; units keep their case (F109); row names as x ticks (F113).
describe('label helpers', () => {
  it('labelParts splits ^{…} and _{…}', () => {
    expect(lib.labelParts('Density (kg m^{-3})')).toEqual([{ t: 'Density (kg m', v: 0 }, { t: '-3', v: 1 }, { t: ')', v: 0 }]);
    expect(lib.labelParts('R_{g} (nm)')).toEqual([{ t: 'R', v: 0 }, { t: 'g', v: -1 }, { t: ' (nm)', v: 0 }]);
    expect(lib.labelParts('plain')).toEqual([{ t: 'plain', v: 0 }]);
  });
  it.each([
    ['Density (kg m^{-3})', ['Density ', '(kg m^{-3})']],
    ['free energy difference [kJ mol^{-1}]', ['free energy difference ', '[kJ mol^{-1}]']],
    ['(bar)', ['', '(bar)']],
    ['g(r)', ['g(r)', '']],
    ['-Sch', ['-Sch', '']],
  ])('splitUnit(%s)', (s, want) => expect(lib.splitUnit(s)).toEqual(want));
  it('toGrace writes the markup back the way the parser reads it', () => {
    expect(lib.toGrace('Density (kg m^{-3})')).toBe('Density (kg m\\S-3\\N)');
    expect(lib.toGrace('ξ (nm) · ΔG')).toBe('\\xx\\f{} (nm) · \\xD\\f{}G');
    for (const s of ['Density (kg m^{-3})', 'R_{g} ξ (nm)', 'plain (nm)']) expect(lib.parseTable('@ xaxis label "' + lib.toGrace(s) + '"\n1 2\n2 3\n').head.xLabel).toBe(s);
  });
});

describe('rich text in exports', () => {
  const scene = (s: string): Scene => ({ w: 100, h: 40, bg: '#ffffff', items: [{ t: 'text', x: 90, y: 20, s, size: 10, fill: '#000000', anchor: 'end', bold: false }] });
  it('SVG draws super- and subscripts as smaller, shifted tspans', () => {
    expect(toSVG(scene('kg m^{-3}'))).toContain('kg m<tspan dy="-3.5" font-size="7">-3</tspan>');
    expect(toSVG(scene('plain'))).toContain('>plain</text>');
  });
  it('PDF uses a text rise, and the Symbol font only when a Greek letter needs it', async () => {
    const pdf = async (s: string) => new TextDecoder('latin1').decode(await toPDF(scene(s)).arrayBuffer());
    const a = await pdf('kg m^{-3}'), b = await pdf('ξ (nm)'), c = await pdf('plain');
    expect(a).toMatch(/\(kg m\) Tj \/F1 7 Tf 3\.5 Ts \(-3\) Tj/);
    expect([a.includes('/Symbol'), b.includes('/Symbol'), c.includes('/Symbol')]).toEqual([false, true, false]);
    expect(b).toMatch(/\/F3 10 Tf 0 Ts \(x\) Tj/);
  });
  it('text width counts super- and subscripts at their smaller size', () => {
    expect(textW('m^{2}', 10)).toBeLessThan(textW('m2', 10));
    expect(textW('plain', 10)).toBe(textW('plain', 10));
  });
});

describe('graph labels and row names', () => {
  const ana = (s: Store, type: string, file: string, col = 'ha', slot: 'a' | 'b' = 'a') => withAnalysis(s, { name: 'POPC', col, slot, type, file, bytes: fixture('examples/' + file) }).store;
  const graph = (s: Store, tab: string, col = 'ha') => {
    const st = lib.mergeSettings({}, s.settings), cols = lib.pageCols(s, null);
    return buildGraph({ store: s, sel: { mode: 'cell', id: s.seqs[0].id, s: col }, cols, st, tab, raw: false, fitWell: true, dark: false, domain: sharedDomain(s.seqs, lib.ENTROPY) })!;
  };
  it.each([
    ['density', 'phosphorus.xvg', 'Relative position from center (nm)', 'Density (kg m^{-3})'],
    ['free-energy', 'translocation_free_energy.dat', 'distance from the transmembrane state [nm]', 'free energy difference [kJ mol^{-1}]'],
    ['data', 'membrane_thickness.dat', 'radial distance from the protein center [nm]', 'average membrane thickness [nm]'],
    ['order', 'order_POPE.xvg', 'Atom', '-Sch'],
    ['temperature', 'temperature.xvg', 'Time (ps)', '(K)'],
  ])('%s from %s takes the file’s labels', (type, file, x, y) => {
    const m = graph(ana(lib.emptyStore(), type, file), type);
    expect([m.xLabel, m.yLabel, m.data.xLabel, m.data.yLabel]).toEqual([x, y, x, y]);
  });
  it('files that disagree fall back to the type’s labels, axis by axis', () => {
    const s = ana(ana(lib.emptyStore(), 'energy', 'temperature.xvg'), 'energy', 'pressure.xvg', 'ha', 'b');
    expect([graph(s, 'energy').xLabel, graph(s, 'energy').yLabel]).toEqual(['Time (ps)', 'kJ/mol']);
  });
  it('a file without labels keeps the type’s', () => {
    const s = withAnalysis(lib.emptyStore(), { name: 'P', col: 'ha', type: 'data', file: 'x.dat', bytes: new TextEncoder().encode('1 2\n2 3\n3 5\n') }).store;
    expect([graph(s, 'data').xLabel, graph(s, 'data').yLabel]).toEqual(['x', 'y']);
  });
  it('order parameters name their x ticks by carbon, thinned to fit, and the xvg keeps the names', () => {
    const m = graph(ana(lib.emptyStore(), 'order', 'order_POPE.xvg'), 'order');
    expect(m.data.xTicks!.slice(0, 3)).toEqual([{ v: 1, label: 'C22' }, { v: 3, label: 'C23' }, { v: 5, label: 'C25' }]);
    expect(m.g.xticks.map(t => t.label).slice(0, 2)).toEqual(['C22', 'C23']);
    const xvg = graphXvg(m.data);
    expect(xvg).toContain('# Atom C22\n      1.0000         0.1337');
    expect(graphScene(m.data).items.some(i => i.t === 'text' && i.s === 'C22')).toBe(true);
  });
  it('labels and row names come back when a vault reopens, and never reach the record or the export', async () => {
    const { b, svc } = await newVault();
    const r = withAnalysis(lib.emptyStore(), { name: 'POPC', col: 'ha', type: 'order', file: 'order_POPE.xvg', bytes: fixture('examples/order_POPE.xvg') });
    svc.commit(r.store, r.uploads); await svc.flush();
    const { svc: again, pid } = await reopen(b);
    await again.loadAnalysis(again.store.seqs[0].extras[0].id);
    const c = again.store.seqs[0].extras[0].curves[0];
    expect([c.axis, c.names?.[0]]).toEqual([{ x: 'Atom', y: '-Sch' }, 'Atom C22']);
    const rec = await b.readText('.matrix/records/' + pid + '/rows/' + again.store.seqs[0].id + '.json');
    const { text } = await exportDataset(again.store, { project: 'P', settings: {}, src: { read: f => again.readUpload(f), meta: f => again.fileMeta(f) } });
    expect([rec.includes('"axis"') || rec.includes('"names"'), text.includes('"axis"') || text.includes('"names"')]).toEqual([false, false]);
  });
});
