import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { DEFAULT_COLS, FORMER_COLS } from '../src/lib/pmf';
import { MemoryBackend } from '../src/lib/storage/backend/memory';
import { Vault } from '../src/lib/storage/vault';
import { reopen } from './helpers';

// What a new project starts with: one column, COL1, and no tags. The three sugar columns and the four tags it used to
// start with are only what older data means (FORMER_COLS, FORMER_TAGS).
describe('a new project starts with COL1 and no tags', () => {
  it('the default column, from an empty store and from a store that has none', () => {
    expect(DEFAULT_COLS.map(c => [c.k, c.label, c.name])).toEqual([['col1', 'COL1', 'COL1']]);
    expect(lib.emptyStore().cols).toEqual(DEFAULT_COLS);
    expect(lib.getCols(null)).toEqual(DEFAULT_COLS);
    expect(lib.getCols({ cols: [] })).toEqual(DEFAULT_COLS);
    // Taking the last column away leaves the default one, as the matrix always has a column.
    expect(lib.getCols(lib.removeColumn(lib.emptyStore(), 'col1')).map(c => c.k)).toEqual(['col1']);
  });

  it('a new vault’s first project has COL1 and an empty tag list on disk, and reopens so', async () => {
    const b = new MemoryBackend();
    const { projectId } = await Vault.create(b, { projectName: 'My project' });
    expect(JSON.parse(await b.readText('.matrix/settings/' + projectId + '/tags.json'))).toEqual({ tags: [] });
    const { svc } = await reopen(b);
    expect(svc.store.cols.map(c => c.k)).toEqual(['col1']);
    expect(lib.getTags(lib.mergeSettings({}, svc.store.settings))).toEqual([]);
  });

  it('a project made with columns and settings of its own keeps them; {} keeps none, as before (former tags)', async () => {
    const { vault } = await Vault.create(new MemoryBackend());
    const copy = await vault.createProject('Copy', { cols: FORMER_COLS, settings: { tags: lib.FORMER_TAGS } });
    expect((await vault.openProject(copy.id)).store.cols.map(c => c.k)).toEqual(['o26', 'pg', 'ha']);
    expect(lib.getTags((await vault.openProject(copy.id)).store.settings ?? {})).toEqual(lib.FORMER_TAGS);
    const older = await vault.createProject('Older', { settings: {} });
    expect(lib.getTags((await vault.openProject(older.id)).store.settings ?? {})).toEqual(lib.FORMER_TAGS);
    const fresh = await vault.createProject('Fresh');
    expect(lib.getTags((await vault.openProject(fresh.id)).store.settings ?? {})).toEqual([]);
  });
});

describe('data saved before columns were its own', () => {
  const run = { id: 'r1', sacch: 'o26', run: 'a', time: '', temp: 300, tags: [], file: 'x.xvg', added: '2020-01-01', curves: [], x: [0, 1], y: [0, 1] };
  it('with runs in it, means the three former columns; empty, the default one', () => {
    const seq = { id: 's1', name: 'S', runs: [run] };
    expect(lib.normStore({ seqs: [seq as never] }).cols.map(c => c.k)).toEqual(['o26', 'pg', 'ha']);
    expect(lib.normStore({ seqs: [] }).cols.map(c => c.k)).toEqual(['col1']);
    expect(lib.normStore({ seqs: [seq as never], cols: [{ k: 'x', label: 'X', short: 'X', name: 'X', dark: '#fff', light: '#000' }] }).cols.map(c => c.k)).toEqual(['x']);
  });
});

describe('a column COL1 is a column like any other', () => {
  it('a file name or path says it, by label, and a name that matches none adds a column', () => {
    const cols = lib.getCols(null);
    expect(lib.matchCol(cols, 'col1')?.k).toBe('col1');
    expect(lib.matchCol(cols, 'COL1')?.k).toBe('col1');
    expect(lib.matchCol(cols, 'ha')).toBeNull();
    const added = lib.addColumn(lib.emptyStore(), 'COL2', 'Second');
    expect(lib.getCols(added.store).map(c => c.k)).toEqual(['col1', 'col2']);
  });
});
