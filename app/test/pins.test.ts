import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { pinY, snapX } from '../src/lib/interact';
import { buildGraph, marksOn, sharedDomain } from '../src/lib/graph';
import { graphScene, graphXvg } from '../src/lib/export';
import { reopen, vaultFixture } from './helpers';

// R5d: marks and lines are listed, edited and removed under the graph, and drawn in Compare (marks only, F100) and exports.
describe('marks and lines outside the dialog', () => {
  it('a mark reads its y at its exact x; editing x snaps to the curve’s nearest data point', () => {
    const rx = [0, 0.5, 1, 1.5], ry = [3, null, 5, 6];
    expect([pinY(rx, ry, 1), pinY(rx, ry, 0.5), pinY(rx, ry, 1.2)]).toEqual([5, null, null]);
    expect([snapX(rx, ry, 0.6), snapX(rx, ry, 1.3), snapX(rx, ry, 99)]).toEqual([1, 1.5, 1.5]);
  });
  it('the graph export draws them and the xvg lists them; without any, nothing changes', async () => {
    const { svc } = await reopen(await vaultFixture('formats/schema-3-vault'));
    const row = svc.store.seqs.find(q => q.name === 'WRWYCR')!, run = row.runs.find(r => r.sacch === 'ha')!;
    const view = (store: typeof svc.store) => buildGraph({ store, sel: { mode: 'cell', id: row.id, s: 'ha' }, cols: lib.pageCols(store, null), st: lib.mergeSettings({}, store.settings), tab: 'pmf', raw: false, fitWell: true, dark: false, domain: sharedDomain(store.seqs, lib.ENTROPY) })!;
    const plain = view(svc.store);
    expect(plain.data.pins).toBeUndefined();
    const store = lib.addLine(lib.addMark(lib.addMark(svc.store, row.id, run.id, run.x[100]!), row.id, 'gone', 1), row.id, 'ha|pmf', 'x', 1.5);
    const m = view(store), k = m.series.findIndex(q => q.src === run.id), y = m.series[k].ry[100]!;
    expect(m.data.pins).toEqual({
      marks: [{ x: run.x[100], y, color: m.series[k].color, label: lib.fmtValue(y), curve: m.series[k].label }],
      lines: [{ axis: 'x', v: 1.5, label: 'x = 1.50 nm' }],
    });
    const before = graphScene(plain.data).items.length, sc = graphScene(m.data);
    expect(sc.items.length).toBe(before + 5);
    expect(sc.items.filter(i => i.t === 'text').map(i => (i as { s: string }).s)).toEqual(expect.arrayContaining([lib.fmtValue(y), 'x = 1.50 nm']));
    const xvg = graphXvg(m.data).split('\n');
    expect(xvg.filter(l => /^# (mark|line):/.test(l))).toEqual(['# mark: ' + m.series[k].label + ' at x = ' + lib.fmtValue(run.x[100]!) + ', y = ' + lib.fmtValue(y), '# line: x = 1.50 nm']);
  });
  it('Compare draws a run’s marks where it draws the run (lines stay with their graph)', () => {
    const row = { id: 's', name: 'S', seq: '', group: '', desc: '', runs: [], extras: [], structures: [], marks: [{ curve: 'r1', x: 2 }, { curve: 'r1', x: 9 }, { curve: 'r2', x: 1 }] };
    expect(marksOn(row, 'r1', [1, 2, 3], [-1, -4, -2])).toEqual([{ x: 2, y: -4, label: lib.fmtValue(-4) }]);
  });
});
