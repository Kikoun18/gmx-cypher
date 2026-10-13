import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { buildGraph, sharedDomain } from '../src/lib/graph';
import { graphScene } from '../src/lib/export';
import { exportKeyAction, keyTaken } from '../src/lib/keys';
import { reopen, vaultFixture } from './helpers';

// R8b: the export key exports the open graph exactly as shown, in the default format; R8c: held on the matrix, it picks.
describe('the export key', () => {
  const st = { laserKey: 'k', compareKey: 'c', exportKey: 'e' };
  const press = (key: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; repeat: boolean }> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...o });
  it('in a graph (or Compare) it exports; never while typing, with Ctrl, ⌘ or Alt, or when held down', () => {
    expect([exportKeyAction(press('e'), false, st, 'graph'), exportKeyAction(press('E'), false, st, 'graph')]).toEqual(['export', 'export']);
    expect([exportKeyAction(press('e'), true, st, 'graph'), exportKeyAction(press('e', { ctrlKey: true }), false, st, 'graph'), exportKeyAction(press('e', { metaKey: true }), false, st, 'graph'), exportKeyAction(press('e', { altKey: true }), false, st, 'graph'), exportKeyAction(press('e', { repeat: true }), false, st, 'graph')]).toEqual([null, null, null, null, null]);
    expect([exportKeyAction(press('k'), false, st, 'graph'), exportKeyAction(press('x'), false, { ...st, exportKey: 'x' }, 'graph'), exportKeyAction(press('e'), false, st, 'other')]).toEqual([null, 'export', null]);
  });
  it('on the matrix, holding it picks cells (R8c); Shift doesn’t change the key, and typing still wins', () => {
    expect([exportKeyAction(press('e'), false, st, 'matrix'), exportKeyAction(press('E'), false, st, 'matrix'), exportKeyAction(press('e'), true, st, 'matrix'), exportKeyAction(press('e', { repeat: true }), false, st, 'matrix')]).toEqual(['pick', 'pick', null, null]);
  });
  it('a key that moves the focus or the cursor, or that another key has, can’t be chosen', () => {
    expect(['ArrowLeft', 'Tab', 'Enter', 'Escape'].map(k => keyTaken(k, 'exportKey', st))).toEqual(['ArrowLeft is taken — it moves between cells or fields', 'Tab is taken — it moves between cells or fields', 'Enter is taken — it moves between cells or fields', 'Escape is taken — it closes dialogs']);
    expect([keyTaken('C', 'exportKey', st), keyTaken('k', 'exportKey', st), keyTaken('e', 'laserKey', st)]).toEqual(['C is already the compare key', 'K is already the laser pointer key', 'E is already the export key']);
    expect([keyTaken('e', 'exportKey', st), keyTaken('x', 'exportKey', st)]).toEqual([null, null]);
  });
});

describe('the exported graph is the one on screen', () => {
  it('curves, dashes, hidden curves, marks and reference lines', async () => {
    const { svc } = await reopen(await vaultFixture('formats/schema-3-vault'));
    for (const e of svc.store.seqs.flatMap(s => s.extras)) await svc.loadAnalysis(e.id);
    const row = svc.store.seqs.find(s => s.name === 'WRWYCR')!, run = row.runs.filter(r => r.sacch === 'ha');
    // One run hidden, a mark on the other, a line, a chosen dash.
    let store = { ...svc.store, vis: { ...svc.store.vis, [lib.slotKey(row.id, 'ha', run[1].run)]: 'off' as const } };
    store = lib.addLine(lib.addMark(store, row.id, run[0].id, run[0].x[120]!), row.id, 'ha|pmf', 'y', -0.25);
    const m = buildGraph({ store, sel: { mode: 'cell', id: row.id, s: 'ha' }, cols: lib.pageCols(store, null), st: lib.mergeSettings({}, store.settings), tab: 'pmf', raw: false, fitWell: true, dark: false, domain: sharedDomain(store.seqs, lib.ENTROPY) })!;
    const sc = graphScene(m.data), polys = sc.items.filter(i => i.t === 'poly') as { dash?: string; stroke: string }[];
    expect(polys.map(p => p.dash)).toEqual(m.lines.map(l => l.dash));
    expect(polys.length).toBe(m.series.length);
    expect(m.data.series.map(s => s.label)).toEqual(m.series.map(s => s.label));
    expect(m.data.pins!.marks.map(k => [k.x, k.y, k.label])).toEqual(m.marks.map(k => [k.x, k.y, k.label]));
    expect(m.data.pins!.lines.map(l => l.label)).toEqual(m.refLines.map(l => l.label));
    const texts = sc.items.flatMap(i => (i.t === 'text' ? [i.s] : []));
    expect(texts).toEqual(expect.arrayContaining([m.marks[0].label, m.refLines[0].label]));
  });
});
