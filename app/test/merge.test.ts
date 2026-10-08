import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import type { Slot, Store } from '../src/lib/types';
import { fixture, newVault, text, withPmf, withAnalysis, rdfFixture } from './helpers';
import { sha256Hex } from '../src/lib/storage/json';

const xy = lib.runFromTable(lib.parseTable(text(fixture('hmrfast6_ha_a_t200000.xvg'))), 1, 2);

/** WRWYCR (the twin) and WRWYCR-TYPO, both in method g. Runs and analyses are given as "col:slot". */
function rows(twin: string[], typo: string[], o: { twinEx?: string[]; typoEx?: string[] } = {}) {
  let s: Store = lib.emptyStore();
  const ids: Record<string, string> = {};
  const add = (name: string, cells: string[], ex: string[] = []) => {
    let rowId = '';
    for (const c of cells) {
      const [col, slot] = c.split(':');
      const r = lib.addRun(s, { name, seq: '', group: 'g', desc: '', sacch: col, run: slot as Slot, time: name + c, temp: 300, tags: [], file: name + c + '.xvg', ...xy });
      s = r.store; rowId = r.rowId;
      ids[name + ' run ' + c] = s.seqs.find(q => q.id === r.rowId)!.runs.find(x => x.sacch === col && x.run === slot)!.id;
    }
    for (const c of ex) {
      const [col, slot] = c.split(':');
      const r = lib.addExtra(s, { name, seq: '', group: 'g', desc: '', type: 'rdf', sacch: col, run: slot as Slot, time: '', file: 'rdf.xvg', curves: [{ id: 'c' + name + c, x: [0, 1], y: [1, 2], label: 'g', file: 'rdf.xvg' }] });
      s = r.store; rowId = r.rowId;
      ids[name + ' rdf ' + c] = s.seqs.find(q => q.id === r.rowId)!.extras.find(x => x.sacch === col && x.run === slot)!.id;
    }
    return rowId;
  };
  const twinId = add('WRWYCR', twin, o.twinEx), typoId = add('WRWYCR-TYPO', typo, o.typoEx);
  return { s, ids, twinId, typoId };
}
const allIds = (s: Store) => new Set(s.seqs.flatMap(q => [...q.runs.map(r => r.id), ...q.extras.map(e => e.id)]));
const rename = { group: 'g', name: 'WRWYCR', seq: '', desc: '' };

describe('editRow: the preview lists exactly what the save drops (R5)', () => {
  const cases: { name: string; twin: string[]; typo: string[]; twinEx?: string[]; typoEx?: string[]; edit: Partial<lib.RowEdit>; drops: string[] }[] = [
    { name: 'no clash', twin: ['ha:a'], typo: ['ha:b', 'pg:a'], edit: {}, drops: [] },
    { name: 'run clash', twin: ['ha:a', 'ha:b'], typo: ['ha:a', 'ha:b', 'ha:c'], edit: {}, drops: ['WRWYCR-TYPO run ha:a', 'WRWYCR-TYPO run ha:b'] },
    { name: 'analysis clash', twin: ['ha:a'], typo: ['pg:a'], twinEx: ['ha:a'], typoEx: ['ha:a'], edit: {}, drops: ['WRWYCR-TYPO rdf ha:a'] },
    { name: 'mixed', twin: ['ha:a'], typo: ['ha:a', 'pg:a'], twinEx: ['pg:a'], typoEx: ['pg:a', 'ha:b'], edit: {}, drops: ['WRWYCR-TYPO run ha:a', 'WRWYCR-TYPO rdf pg:a'] },
    // Renumbering applies to the edited row before the merge: its run 1 becomes run 3, which is free on the twin.
    { name: 'merge + renumber', twin: ['ha:a'], typo: ['ha:a'], edit: { col: 'ha', order: ['c', 'b', 'a'] as (Slot | null)[] }, drops: [] },
    // The cell moves to PG first (no clash there on the edited row), then merges into the twin's PG run 1.
    { name: 'merge + column move', twin: ['pg:a'], typo: ['ha:a', 'ha:b'], edit: { col: 'ha', to: 'pg' }, drops: ['WRWYCR-TYPO run ha:a'] },
  ];
  it.each(cases)('$name', c => {
    const { s, ids, typoId } = rows(c.twin, c.typo, { twinEx: c.twinEx, typoEx: c.typoEx });
    const res = lib.editRow(s, typoId, { ...rename, ...c.edit });
    expect(res.error).toBeUndefined();
    const expected = c.drops.map(d => ids[d]).sort();
    expect(res.dropped.map(d => d.id).sort()).toEqual(expected);
    // Independently: exactly those ids are gone from the saved store.
    const after = allIds(res.store);
    expect([...allIds(s)].filter(id => !after.has(id)).sort()).toEqual(expected);
  });

  it('describes dropped items by their place before the save', () => {
    const { s, typoId } = rows(['ha:a'], ['ha:a'], { twinEx: ['ha:a'], typoEx: ['ha:a'] });
    expect(lib.editRow(s, typoId, rename).dropped.map(d => [d.kind, d.col, d.run, d.type])).toEqual([['run', 'ha', 'a', undefined], ['analysis', 'ha', 'a', 'rdf']]);
  });

  it('renumbering refers to the edited row, not the merged one', () => {
    const { s, ids, twinId, typoId } = rows(['ha:a'], ['ha:a'], {});
    const res = lib.editRow(s, typoId, { ...rename, col: 'ha', order: ['c', 'b', 'a'] as (Slot | null)[] });
    const twin = res.store.seqs.find(q => q.id === twinId)!;
    expect(twin.runs.find(r => r.run === 'a')!.id).toBe(ids['WRWYCR run ha:a']);
    expect(twin.runs.find(r => r.run === 'c')!.id).toBe(ids['WRWYCR-TYPO run ha:a']);
  });

  it('a hidden run stays hidden after it moves to the twin', () => {
    const { s, twinId, typoId } = rows(['ha:a'], ['ha:b']);
    const res = lib.editRow({ ...s, vis: { [lib.slotKey(typoId, 'ha', 'b')]: 'off' } }, typoId, rename);
    expect(res.store.vis).toEqual({ [lib.slotKey(twinId, 'ha', 'b')]: 'off' });
  });

  it('different descriptions are joined, not replaced', () => {
    const { s, twinId, typoId } = rows(['ha:a'], ['ha:b']);
    const s2 = { ...s, seqs: s.seqs.map(q => ({ ...q, desc: q.id === twinId ? 'twin text' : 'typo text' })) };
    expect(lib.editRow(s2, typoId, { ...rename, desc: 'typo text' }).store.seqs.find(q => q.id === twinId)!.desc).toBe('twin text\n\ntypo text');
  });

  it('a move into a full column is an error, with nothing changed', () => {
    const { s, typoId } = rows(['ha:a'], ['ha:a', ...lib.SLOTS.map(k => 'pg:' + k)]);
    const res = lib.editRow(s, typoId, { ...rename, col: 'ha', to: 'pg' });
    expect(res.error).toMatch(/No free run slot/);
    expect(res.store).toBe(s);
    expect(res.dropped).toEqual([]);
  });
});

describe('vault: originals dropped by a merge', () => {
  it('go to the trash and can be restored', async () => {
    const { b, svc } = await newVault();
    const XVG = 'hmrfast6_ha_a_t200000.xvg';
    const a = withPmf(svc.store, { name: 'WRWYCR', col: 'ha', file: XVG, bytes: fixture(XVG), group: 'g' });
    const t = withPmf(a.store, { name: 'WRWYCR-TYPO', col: 'ha', file: 'typo.xvg', bytes: fixture(XVG), group: 'g' });
    const r = withAnalysis(t.store, { name: 'WRWYCR-TYPO', col: 'ha', type: 'rdf', file: 'rdf.xvg', bytes: rdfFixture, group: 'g' });
    svc.commit(r.store, new Map([...a.uploads, ...t.uploads, ...r.uploads]));
    await svc.flush();
    const typoFile = svc.fileMeta(t.fileId)!.path;
    const res = lib.editRow(svc.store, t.rowId, { group: 'g', name: 'WRWYCR', seq: 'WRWYCR', desc: '' });
    expect(res.dropped.map(d => d.kind)).toEqual(['run']);
    svc.commit(res.store);
    await svc.flush();
    expect(await b.stat(typoFile)).toBeNull();
    // The merged-away row's trash item holds its cell folder, with the dropped run's original.
    const item = (await svc.listTrash()).find(x => (x.manifest?.originalPaths || []).some(p => typoFile.startsWith(p + '/')))!;
    expect(item.manifest!.type).toBe('row');
    await svc.restore(item);
    const back = (await b.stat(typoFile)) ? typoFile : svc.report.untracked.find(p => p.endsWith('/typo.xvg'));
    expect(back).toBeTruthy();
    expect(await sha256Hex(await b.readBytes(back!))).toBe(await sha256Hex(fixture(XVG)));
  });
});

describe('review fixes', () => {
  it('a hidden run stays hidden when it merges into a slot where the twin has only an analysis', () => {
    const { s, twinId, typoId } = rows([], ['ha:a'], { twinEx: ['ha:a'] });
    const res = lib.editRow({ ...s, vis: { [lib.slotKey(typoId, 'ha', 'a')]: 'off' } }, typoId, rename);
    expect(res.store.vis).toEqual({ [lib.slotKey(twinId, 'ha', 'a')]: 'off' });
  });
});
