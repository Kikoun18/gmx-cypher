import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { buildGraph, DASH, sharedDomain } from '../src/lib/graph';
import type { Store } from '../src/lib/types';
import { reopen, vaultFixture } from './helpers';

// R6: a chosen line style per curve and per PMF run, used by the screen, Compare and exports; "automatic" is today's rule.
const frozen = async () => { const { svc } = await reopen(await vaultFixture('formats/schema-3-vault')); for (const e of svc.store.seqs.flatMap(s => s.extras)) await svc.loadAnalysis(e.id); return svc.store; };
const graph = (s: Store, tab: string, bw = false) => {
  const row = s.seqs.find(q => q.name === 'WRWYCR')!;
  return buildGraph({ store: s, sel: { mode: 'cell', id: row.id, s: 'ha' }, cols: lib.pageCols(s, null), st: lib.mergeSettings({ bw }, s.settings), tab, raw: false, fitWell: true, dark: false, domain: sharedDomain(s.seqs, lib.ENTROPY) })!;
};

describe('line style per curve and run (R6)', () => {
  it('automatic is today’s rule: the dash follows the place', async () => {
    const m = graph(await frozen(), 'pmf');
    expect(m.series.map(s => s.dash)).toEqual([DASH[0], DASH[1]]);
    expect(m.dupDash).toEqual([]);
  });
  it('automatic dashes repeat past ten curves without a warning', async () => {
    const m = graph(await frozen(), 'hist');
    expect([new Set(m.series.map(x => x.dash)).size < m.series.length, m.dupDash]).toEqual([true, []]);
  });
  it('a run’s chosen dash is drawn and exported; null goes back to automatic', async () => {
    const s = await frozen(), row = s.seqs.find(q => q.name === 'WRWYCR')!, run = row.runs.find(r => r.sacch === 'ha' && r.run === 'a')!;
    const set = lib.updateRun(s, row.id, run.id, { dash: 5 });
    const m = graph(set, 'pmf');
    expect([m.series[0].dash, m.data.series[0].dash]).toEqual([DASH[5], DASH[5]]);
    const back = lib.updateRun(set, row.id, run.id, { dash: null });
    expect(back.seqs.find(q => q.id === row.id)!.runs.find(r => r.id === run.id)!.dash).toBeUndefined();
    expect(graph(back, 'pmf').series[0].dash).toBe(DASH[0]);
  });
  it('a curve’s chosen dash is drawn and exported', async () => {
    const s = await frozen(), row = s.seqs.find(q => q.name === 'WRWYCR')!, e = row.extras.find(x => x.type === 'rdf')!;
    const m = graph(lib.updateCurve(s, row.id, e.id, e.curves[1].id, { dash: 3 }), 'rdf');
    expect([m.series[1].dash, m.data.series[1].dash]).toEqual([DASH[3], DASH[3]]);
  });
  it('the same line style twice in one column is allowed, with a warning (F103); black and white warns across columns', async () => {
    const s = await frozen(), row = s.seqs.find(q => q.name === 'WRWYCR')!, e = row.extras.find(x => x.type === 'rdf')!;
    const m = graph(lib.updateCurve(s, row.id, e.id, e.curves[1].id, { dash: 0 }), 'rdf');
    expect(m.dupDash).toEqual([m.series[0].label, m.series[1].label]);
    const t = await frozen(), r2 = t.seqs.find(q => q.name === 'WRWYCR')!;
    const rowView = (st: Store, bw: boolean) => buildGraph({ store: st, sel: { mode: 'row', id: r2.id, s: 'o26' }, cols: lib.pageCols(st, null), st: lib.mergeSettings({ bw }, st.settings), tab: 'pmf', raw: false, fitWell: true, dark: false, domain: sharedDomain(st.seqs, lib.ENTROPY) })!;
    const ha = DASH.indexOf(rowView(t, true).series.find(x => x.k === 'ha')!.dash);
    const pg = r2.runs.find(r => r.sacch === 'pg')!, same = lib.updateRun(t, r2.id, pg.id, { dash: ha });
    expect([rowView(t, true).dupDash.length, rowView(same, false).dupDash.length, rowView(same, true).dupDash.length]).toEqual([0, 0, 2]);
  });
});
