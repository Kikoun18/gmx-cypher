import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as lib from '../src/lib/seq';
import { AREA, MIN } from '../src/lib/metrics';
import { groupRows, matrixData, matrixTiles } from '../src/lib/matrix';
import { matrixScene, matrixXvg, toPDF } from '../src/lib/export';
import { reopen, vaultFixture } from './helpers';

// The matrix export against the golden scenes made before batch 3 (test/fixtures/golden/README.md), through the same
// code the app uses: tiles from the metric (R4a), rows grouped as on screen.
const golden = (n: string) => readFileSync(new URL('./fixtures/golden/scenes/' + n, import.meta.url));

describe('matrix exports reproduce the golden scenes (Area and Min)', async () => {
  const store = (await reopen(await vaultFixture('formats/schema-3-vault'))).svc.store;
  const st = lib.mergeSettings({}, store.settings), cols = lib.pageCols(store, null), seqs = lib.pageSeqs(store, null);
  const skip: lib.SkipFn = st.hiddenOut ? (s, r) => store.vis[lib.slotKey(s.id, r.sacch, r.run)] === 'off' : null;
  it.each([['matrix-area', AREA], ['matrix-min', MIN]] as const)('%s', async (name, def) => {
    const tiles = matrixTiles(seqs, cols, def, st, skip), { glist, anyGroup } = groupRows(seqs, cols, tiles, false);
    const d = matrixData({ project: 'Sugar PMFs', page: null, def, st, pmfT: lib.ENTROPY, cols, glist, anyGroup, tiles });
    // Named changes since the golden scenes. R2 (F118): the subtitle names the PMF correction in use. R8 (F136): a tile
    // over several runs shows its spread under the value, as on screen.
    expect(d.sub.endsWith(' · ' + lib.TRANSFORMS.entropy.note)).toBe(true);
    const cells = d.groups.flatMap(g => g.rows.flatMap(r => r.cells)).filter(c => c != null);
    expect(cells.filter(c => c.n > 1).every(c => /^± \d/.test(c.spread || ''))).toBe(true);
    const sc = matrixScene(d), spreads = cells.flatMap(c => (c.spread ? [c.spread] : []));
    expect(spreads.length).toBeGreaterThan(0);
    expect(sc.items.filter(i => i.t === 'text' && spreads.includes(i.s)).length).toBe(spreads.length);
    const was = { ...d, sub: d.sub.slice(0, -(' · ' + lib.TRANSFORMS.entropy.note).length), groups: d.groups.map(g => ({ ...g, rows: g.rows.map(r => ({ ...r, cells: r.cells.map(c => c && { v: c.v, n: c.n }) })) })) };
    expect(matrixXvg(was).split('\n').slice(1).join('\n')).toBe(golden(name + '.xvg').toString().split('\n').slice(1).join('\n'));
    expect(new Uint8Array(await toPDF(matrixScene(was)).arrayBuffer())).toEqual(new Uint8Array(golden(name + '.pdf')));
  });
});

// Review fix (F137): a tile's number is written in the export as the screen writes it (three significant figures for
// metrics other than Area and Min), not rounded to two decimals.
describe('matrix exports write each value as its tile does', () => {
  it('order parameters and temperature: 0.293 and 310.04, as on screen', async () => {
    const { text, fixture } = await import('./helpers');
    const { tileText } = await import('../src/lib/metrics');
    const st = lib.mergeSettings({}, {});
    const files: lib.UploadFile[] = ['order_POPE.xvg', 'temperature.xvg'].map((n, i) => { const t = lib.parseTable(text(fixture('examples/' + n))); return { id: 'f' + i, file: n, table: t, head: t.head, sha256: 's' + i, parsed: lib.parseName(n, st.pattern) }; });
    const form: lib.UploadForm = { files, name: 'Examples', seq: '', group: '', desc: '', time: '', temp: '310.15', col: 'o26', run: 'auto', parse: false, tags: [], msg: '', err: false, ana: 'auto', onClash: 'replace' };
    const store = lib.addBatch(lib.emptyStore(), form, lib.planBatch(lib.emptyStore(), form, lib.getAnalyses(st), st)).store, cols = lib.getCols(store).filter(c => c.k === 'o26');
    const shown = ['order', 'temperature'].map(type => {
      const def = { id: 'm', label: 'mean', type, fn: { kind: 'builtin' as const, name: 'mean' }, agg: 'mean' as const, scale: { kind: 'minmax' as const } };
      const tiles = matrixTiles(store.seqs, cols, def, st, null), { glist, anyGroup } = groupRows(store.seqs, cols, tiles, false);
      const d = matrixData({ project: 'P', page: null, def, st, pmfT: lib.ENTROPY, cols, glist, anyGroup, tiles });
      return [tileText([...tiles.values()][0], def).main, matrixScene(d).items.flatMap(i => (i.t === 'text' && i.size === 12 ? [i.s] : []))[0]];
    });
    expect(shown).toEqual([['0.293', '0.293'], ['310.04', '310.04']]);
  });
});

// Review fix (F138): the export's subtitle names the transform the metric's tiles were made with.
describe('the matrix export names the metric’s own transform', () => {
  it('a PMF metric with its own "none" says no correction; a script transform names its file and values', async () => {
    const store = (await reopen(await vaultFixture('formats/schema-3-vault'))).svc.store;
    const st = lib.mergeSettings({}, store.settings), cols = lib.pageCols(store, null), seqs = lib.pageSeqs(store, null);
    const sub = (def: typeof AREA, scripts: { id: string; name: string; fileId: string; sha256: string; fns: Record<string, never> }[] = []) => {
      const tiles = matrixTiles(seqs, cols, def, st, null), { glist, anyGroup } = groupRows(seqs, cols, tiles, false);
      return matrixData({ project: 'P', page: null, def, st, pmfT: lib.ENTROPY, cols, glist, anyGroup, tiles, scripts }).sub;
    };
    expect(sub(AREA).endsWith(' · ' + lib.TRANSFORMS.entropy.note)).toBe(true);
    expect(sub({ ...AREA, transform: lib.NONE }).endsWith(' · ' + lib.TRANSFORMS.none.note)).toBe(true);
    const t = { kind: 'script' as const, script: 'k1', fn: 'shift', params: { by: 5 } };
    expect(sub({ ...AREA, transform: t }, [{ id: 'k1', name: 'shift.py', fileId: 'f1', sha256: '48962f66db26aaaa', fns: {} }]).endsWith(' · transformed by shift() from shift.py (SHA-256 48962f66db26…) · by = 5')).toBe(true);
  });
});
