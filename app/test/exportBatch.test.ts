import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { batchGraphs } from '../src/lib/graph';
import { reopen, vaultFixture } from './helpers';

// R8c: hold E on the matrix and pick cells (or sequences); release exports each pick's graph (question 26).
describe('the graphs a batch export makes', () => {
  it('E: each pick’s PMF, or its first analysis when it has no runs; a sequence gives its all-columns graph', async () => {
    const store = (await reopen(await vaultFixture('formats/schema-3-vault'))).svc.store, types = lib.getAnalyses(lib.mergeSettings({}, store.settings));
    const W = store.seqs.find(s => s.name === 'WRWYCR')!, K = store.seqs.find(s => s.name === 'KRWYCR')!;
    const picks = [{ id: W.id, col: 'ha' }, { id: K.id, col: 'pg' }, { id: W.id, col: null }, { id: K.id, col: 'o26' }];
    expect(batchGraphs(store, picks, false, types)).toEqual([
      { sel: { mode: 'cell', id: W.id, s: 'ha' }, tab: 'pmf' },
      { sel: { mode: 'cell', id: K.id, s: 'pg' }, tab: 'pmf' },
      { sel: { mode: 'row', id: W.id, s: 'ha' }, tab: 'pmf' },
    ]);
    const noRuns = { ...store, seqs: store.seqs.map(s => (s.id === K.id ? { ...s, runs: s.runs.filter(r => r.sacch !== 'ha') } : s)) };
    expect(batchGraphs(noRuns, [{ id: K.id, col: 'ha' }], false, types)).toEqual([{ sel: { mode: 'cell', id: K.id, s: 'ha' }, tab: 'dist' }]);
  });
  it('Shift+E: every analysis of each pick too, in the tabs’ order', async () => {
    const store = (await reopen(await vaultFixture('formats/schema-3-vault'))).svc.store, types = lib.getAnalyses(lib.mergeSettings({}, store.settings));
    const W = store.seqs.find(s => s.name === 'WRWYCR')!, K = store.seqs.find(s => s.name === 'KRWYCR')!;
    expect(batchGraphs(store, [{ id: W.id, col: 'ha' }, { id: K.id, col: 'ha' }, { id: W.id, col: 'pg' }], true, types).map(j => j.sel.id.slice(0, 0) + (j.sel.id === W.id ? 'W' : 'K') + '×' + j.sel.s + ':' + j.tab))
      .toEqual(['W×ha:pmf', 'W×ha:hist', 'W×ha:rdf', 'K×ha:pmf', 'K×ha:dist', 'W×pg:pmf']);
  });
});
