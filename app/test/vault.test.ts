import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pjoin } from 'node:path';
import { MemoryBackend } from '../src/lib/storage/backend/memory';
import { NodeBackend } from '../scripts/node-backend';
import { Vault, NotEmptyError } from '../src/lib/storage/vault';
import { sha256Hex } from '../src/lib/storage/json';
import { vaultPaths } from '../src/lib/storage/path';
import type { SchemaMigration } from '../src/lib/storage/manifest';
import { SCHEMA_VERSION } from '../src/lib/storage/records';
import * as lib from '../src/lib/seq';
import { fixture, newVault, reopen, snapshot, withAnalysis, withPmf, withStructure, sharedLocks, rdfFixture } from './helpers';

const XVG = 'hmrfast6_ha_a_t200000.xvg';
const tmpDirs: string[] = [];
afterEach(() => { for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const nodeVaultDir = () => { const d = mkdtempSync(pjoin(tmpdir(), 'pmf-vault-')); tmpDirs.push(d); return d; };

/** Snapshot with every analysis loaded (they load on demand after a reopen). */
async function full(svc: Awaited<ReturnType<typeof newVault>>['svc']) {
  for (const row of svc.store.seqs) for (const e of row.extras) await svc.loadAnalysis(e.id);
  return snapshot(svc.store);
}

/** A small project: one PMF run, a structure (pdb + gro), an analysis, notes, literature, a page. */
async function populate(svc: Awaited<ReturnType<typeof newVault>>['svc']) {
  let s = svc.store;
  const a = withPmf(s, { name: 'WRWYCR', col: 'ha', file: XVG, bytes: fixture(XVG), group: 'hmrfast6' });
  s = a.store;
  const p = withStructure(s, a.rowId, 'test.pdb', fixture('test.pdb'), 'pdb'); s = p.store;
  const g = withStructure(s, a.rowId, 'WTA.gro', fixture('WTA.gro'), 'gro'); s = g.store;
  const r = withAnalysis(s, { name: 'WRWYCR', col: 'ha', type: 'rdf', file: 'rdf.xvg', bytes: rdfFixture, group: 'hmrfast6' }); s = r.store;
  s = { ...s, notes: { row: { [a.rowId]: 'Row note **bold**' }, cell: { ['ha_' + a.rowId]: 'Cell note\nline 2' } } };
  s = lib.saveLit(s, lib.litKey('ha', a.rowId), { ...lib.blankLit(), id: 'l1', title: 'CD44–HA', doi: '10.1038/nsmb1201', year: '2007' });
  s = lib.addPage(s, { ...lib.newPage('Aromatic set', [a.rowId]), id: 'pg1' });
  s = { ...s, vis: { [a.rowId + '|ha|a']: 'dim' } };
  svc.commit(s, new Map([...a.uploads, ...p.uploads, ...g.uploads, ...r.uploads]));
  await svc.flush();
  return { rowId: a.rowId, pmfId: a.fileId, pdbId: p.fileId, groId: g.fileId, rdfId: r.fileId, extraId: s.seqs[0].extras[0].id };
}

describe('create → save → close → reopen', () => {
  it('gives an identical project (memory backend)', async () => {
    const { b, svc, vault } = await newVault();
    const ids = await populate(svc);
    await svc.loadAnalysis(ids.extraId);
    const before = snapshot(svc.store);
    await vault.close();
    const { svc: again } = await reopen(b);
    await again.loadAnalysis(ids.extraId);
    expect(await full(again)).toBe(before);
    expect(again.store.seqs[0].runs[0].state).toBeUndefined();
  });

  it('refuses a non-empty folder for a new vault but ignores OS clutter', async () => {
    const b = new MemoryBackend();
    await b.writeText('.DS_Store', 'x');
    await expect(Vault.create(b, { projectName: 'X' })).resolves.toBeTruthy();
    const c = new MemoryBackend();
    await c.writeText('notes.txt', 'mine');
    await expect(Vault.create(c, { projectName: 'X' })).rejects.toBeInstanceOf(NotEmptyError);
  });

  it('writes .matrix/.gitignore with cache/ and never a root .gitignore', async () => {
    const { b } = await newVault();
    expect(await b.readText(vaultPaths.gitignore)).toBe('cache/\n');
    expect(await b.stat('.gitignore')).toBeNull();
  });
});

describe('original uploaded files', () => {
  for (const kind of ['memory', 'node'] as const) {
    it('are byte-identical (same SHA-256) after upload → save → close → reopen → read (' + kind + ')', async () => {
      const b = kind === 'memory' ? new MemoryBackend() : new NodeBackend(nodeVaultDir());
      const { svc, vault } = await newVault(b);
      const ids = await populate(svc);
      await vault.close();
      const { svc: again } = await reopen(b);
      for (const [id, name] of [[ids.pmfId, XVG], [ids.pdbId, 'test.pdb'], [ids.groId, 'WTA.gro']] as const) {
        const blob = await again.readUpload(id);
        expect(await sha256Hex(blob)).toBe(await sha256Hex(fixture(name)));
        const meta = again.fileMeta(id)!;
        expect(meta.name).toBe(name);
        expect(meta.sha256).toBe(await sha256Hex(fixture(name)));
        expect(meta.size).toBe(fixture(name).byteLength);
        expect(meta.origin).toBe('upload');
        // An ordinary, visible file under its original name.
        expect(meta.path.startsWith('.matrix')).toBe(false);
        expect(meta.path.endsWith('/' + name)).toBe(true);
      }
    });
  }

  it('get a suffix instead of overwriting on a name clash', async () => {
    const { svc } = await newVault();
    let s = svc.store;
    const a = withPmf(s, { name: 'P1', col: 'ha', slot: 'a', file: XVG, bytes: fixture(XVG) }); s = a.store;
    const c = withPmf(s, { name: 'P1', col: 'ha', slot: 'b', file: XVG, bytes: fixture(XVG) }); s = c.store;
    svc.commit(s, new Map([...a.uploads, ...c.uploads]));
    await svc.flush();
    const paths = [svc.fileMeta(a.fileId)!.path, svc.fileMeta(c.fileId)!.path].map(p => p.split('/').pop()).sort();
    expect(paths).toEqual(['hmrfast6_ha_a_t200000 (2).xvg', 'hmrfast6_ha_a_t200000.xvg']);
  });

  it('replacing a run moves the previous original to the trash', async () => {
    const { svc } = await newVault();
    const a = withPmf(svc.store, { name: 'P1', col: 'ha', file: XVG, bytes: fixture(XVG) });
    svc.commit(a.store, a.uploads); await svc.flush();
    const old = svc.fileMeta(a.fileId)!.path;
    const c = withPmf(svc.store, { name: 'P1', col: 'ha', file: 'new.xvg', bytes: fixture(XVG) }); // same slot → replaces
    svc.commit(c.store, c.uploads); await svc.flush();
    expect(await svc.io.backend.stat(old)).toBeNull();
    const trash = await svc.listTrash();
    expect(trash.some(t => t.manifest?.type === 'run' && t.manifest.originalPaths.includes(old))).toBe(true);
  });
});

describe('rename', () => {
  it('keeps the id, updates the folder slug, and the loader resolves folders by id', async () => {
    const { b, svc, vault } = await newVault();
    const ids = await populate(svc);
    const rowDirBefore = svc.state.rows.get(ids.rowId)!.dirs.row!;
    expect(rowDirBefore).toMatch(/_sequences\/wrwycr--/);
    const renamed = lib.updateSeq(svc.store, ids.rowId, { name: 'Renamed peptide' });
    expect(renamed.rowId).toBe(ids.rowId);
    svc.commit(renamed.store); await svc.flush();
    const r = svc.state.rows.get(ids.rowId)!;
    expect(r.dirs.row).toMatch(/_sequences\/renamed-peptide--/);
    expect(r.dirs.row!.endsWith('--' + ids.rowId)).toBe(true);
    expect(Object.values(r.dirs.cells).every(p => p.includes('renamed-peptide--' + ids.rowId))).toBe(true);
    expect(await b.stat(rowDirBefore)).toBeNull();
    // Notes and originals followed.
    expect(await b.readText(r.dirs.row + '/note.md')).toContain('Row note **bold**');
    expect(await sha256Hex(await svc.readUpload(ids.pdbId))).toBe(await sha256Hex(fixture('test.pdb')));
    await vault.close();

    // The user renames the folder by hand to a stale slug: found again by its id.
    await b.move(r.dirs.row!, r.dirs.row!.replace('renamed-peptide', 'whatever-i-typed'));
    const { svc: again } = await reopen(b);
    expect(again.report.relinked.length).toBe(1);
    expect(again.state.rows.get(ids.rowId)!.dirs.row).toContain('whatever-i-typed--' + ids.rowId);
    expect(again.store.notes.row[ids.rowId]).toBe('Row note **bold**');
    expect(await sha256Hex(await again.readUpload(ids.groId))).toBe(await sha256Hex(fixture('WTA.gro')));
  });

  it('renaming a column renames its folder; moving a cell moves its files', async () => {
    const { b, svc } = await newVault();
    const ids = await populate(svc);
    svc.commit(lib.updateColumn(svc.store, 'ha', { label: 'Hyaluronan' })); await svc.flush();
    expect(svc.state.columns.get('ha')!.dir).toMatch(/\/hyaluronan--ha$/);
    const moved = lib.moveCell(svc.store, ids.rowId, 'ha', 'pg');
    svc.commit(moved.store); await svc.flush();
    const meta = svc.fileMeta(ids.pmfId)!;
    expect(meta.path).toContain('/pg--pg/');
    expect(await b.stat(meta.path)).toBeTruthy();
    expect(svc.state.rows.get(ids.rowId)!.dirs.cells.ha).toBeUndefined();
  });
});

describe('interrupted operations (journal)', () => {
  it('a rename that crashes mid-way is rolled back on reopen', async () => {
    const b = new MemoryBackend();
    const { svc, vault } = await newVault(b);
    const ids = await populate(svc);
    const before = snapshot(svc.store);
    const dirBefore = svc.state.rows.get(ids.rowId)!.dirs.row!;
    let moves = 0;
    b.fault = (op) => op === 'move' && ++moves === 2; // first folder moved, then "crash"
    // Simulate the crash: the in-process rollback is disabled by failing it too.
    const realRemove = b.remove.bind(b);
    let crashed = false;
    b.remove = async (p, o) => { if (crashed && p.startsWith('.matrix/journal')) throw new Error('crash'); return realRemove(p, o); };
    svc.commit(lib.updateSeq(svc.store, ids.rowId, { name: 'Other' }).store);
    crashed = true;
    await svc.flush().catch(() => {});
    b.fault = null; b.remove = realRemove;
    await vault.close();
    const { svc: again, vault: v2 } = await reopen(b);
    expect(v2.recovered.length + (await b.list('.matrix/journal')).length).toBeGreaterThanOrEqual(0);
    expect((await b.list('.matrix/journal')).length).toBe(0);
    expect(again.state.rows.get(ids.rowId)!.dirs.row).toBe(dirBefore);
    expect(await b.stat(dirBefore + '/note.md')).toBeTruthy();
    expect(await full(again)).toBe(before);
  });

  it('a commit that crashes after the commit point is completed on reopen', async () => {
    const b = new MemoryBackend();
    const { svc, vault } = await newVault(b);
    const ids = await populate(svc);
    // Crash while applying the after-steps (trash moves) of a delete.
    let armed = false;
    b.fault = (op, p) => armed && op === 'move' && p.includes('_sequences');
    const next = lib.deleteSeq(svc.store, ids.rowId);
    armed = true;
    svc.commit(next);
    await svc.flush().catch(() => {});
    b.fault = null;
    await vault.close();
    const { svc: again, vault: v2 } = await reopen(b);
    expect(v2.recovered.map(r => r.action)).toContain('completed');
    expect(again.store.seqs.length).toBe(0);
    const trash = await again.listTrash();
    expect(trash.some(t => t.manifest?.type === 'row' && t.manifest.id === ids.rowId)).toBe(true);
    expect((await b.list('.matrix/journal')).length).toBe(0);
  });
});

describe('trash', () => {
  it('delete → trash → restore puts everything back', async () => {
    const { b, svc } = await newVault();
    const ids = await populate(svc);
    const before = snapshot(svc.store);
    const rowDir = svc.state.rows.get(ids.rowId)!.dirs.row!;
    svc.commit(lib.deleteSeq(svc.store, ids.rowId)); await svc.flush();
    expect(await b.stat(rowDir)).toBeNull();
    const [item] = (await svc.listTrash()).filter(t => t.manifest?.type === 'row');
    expect(item.name).toMatch(/^\d{8}T\d{6}Z--row--/);
    expect(item.manifest!.originalPaths).toContain(rowDir);
    const res = await svc.restore(item);
    expect(res.where).toBe('original');
    expect(await b.stat(rowDir + '/note.md')).toBeTruthy();
    expect(await full(svc)).toBe(before);
    expect((await svc.listTrash()).length).toBe(0);
  });

  it('restores to _restored/ when the original place is occupied', async () => {
    const { b, svc } = await newVault();
    const ids = await populate(svc);
    const rowDir = svc.state.rows.get(ids.rowId)!.dirs.row!;
    svc.commit(lib.deleteSeq(svc.store, ids.rowId)); await svc.flush();
    await b.writeText(rowDir + '/someone-elses.txt', 'occupied');
    const [item] = (await svc.listTrash()).filter(t => t.manifest?.type === 'row');
    const res = await svc.restore(item);
    expect(res.where).toBe('fallback');
    expect(res.message).toContain('_restored');
    expect(svc.store.seqs.length).toBe(0);
    expect(svc.report.untracked.some(p => p.includes('/_restored/') && p.endsWith('test.pdb'))).toBe(true);
  });

  it('restores a single deleted structure, and permanent deletion empties the trash', async () => {
    const { svc } = await newVault();
    const ids = await populate(svc);
    const sid = svc.store.seqs[0].structures[0].id;
    svc.commit(lib.removeStructure(svc.store, ids.rowId, sid)); await svc.flush();
    const item = (await svc.listTrash()).find(t => t.manifest?.type === 'structure')!;
    expect((await svc.restore(item)).where).toBe('original');
    expect(svc.store.seqs[0].structures.some(x => x.id === sid)).toBe(true);
    svc.commit(lib.removeStructure(svc.store, ids.rowId, sid)); await svc.flush();
    const it2 = (await svc.listTrash()).find(t => t.manifest?.type === 'structure')!;
    await svc.deleteTrash(it2);
    expect((await svc.listTrash()).length).toBe(0);
  });

  it('a deleted page, column and project can be restored', async () => {
    const { svc, vault, pid } = await newVault();
    await populate(svc);
    svc.commit(lib.deletePage(svc.store, 'pg1')); await svc.flush();
    await svc.restore((await svc.listTrash()).find(t => t.manifest?.type === 'page')!);
    expect(svc.store.pages.map(p => p.id)).toEqual(['pg1']);
    svc.commit(lib.removeColumn(svc.store, 'ha')); await svc.flush();
    expect(svc.store.seqs.length).toBe(1); // the row keeps its structures
    await svc.restore((await svc.listTrash()).find(t => t.manifest?.type === 'column')!);
    expect(svc.store.cols.map(c => c.k)).toContain('ha');
    expect(svc.store.seqs[0].runs.length).toBe(1);
    await vault.deleteProject(pid);
    expect(await vault.listProjects()).toEqual([]);
    const item = (await vault.listTrash()).find(t => t.manifest?.type === 'project')!;
    expect((await vault.restoreProject(item)).where).toBe('original');
    expect((await vault.listProjects()).map(p => p.id)).toEqual([pid]);
  });
});

describe('cache and index', () => {
  it('deleting .matrix/cache entirely and reopening gives an identical project', async () => {
    const { b, svc, vault } = await newVault();
    await populate(svc);
    const before = snapshot(svc.store);
    await vault.close();
    await b.remove('.matrix/cache', { recursive: true });
    const { svc: again } = await reopen(b);
    expect(await full(again)).toBe(before);
  });

  it('a corrupt or stale cache and a missing index are rebuilt', async () => {
    const { b, svc, vault, pid } = await newVault();
    const ids = await populate(svc);
    const before = snapshot(svc.store);
    await vault.close();
    await b.writeText('.matrix/cache/' + pid + '/pmf.json', '{ broken json');
    await b.remove('.matrix/cache/index.json');
    const { svc: again } = await reopen(b);
    expect(await full(again)).toBe(before);
    expect(await b.stat('.matrix/cache/index.json')).toBeTruthy();
    expect(JSON.parse(await b.readText('.matrix/cache/' + pid + '/pmf.json')).kind).toBe('pmf-series');
    // Stale entry: right key format, wrong parser version → ignored, recomputed.
    const pmf = JSON.parse(await b.readText('.matrix/cache/' + pid + '/pmf.json'));
    for (const e of Object.values(pmf.entries) as { source: { parser: string }; y: number[] }[]) { e.source.parser = 'pmf-xy@0'; e.y = e.y.map(() => 999); }
    await b.writeText('.matrix/cache/' + pid + '/pmf.json', JSON.stringify(pmf));
    const { svc: third } = await reopen(b);
    expect(await full(third)).toBe(before);
    void ids;
  });
});

describe('external modifications', () => {
  it('an outside edit to a note is detected and never overwritten', async () => {
    const { b, svc } = await newVault();
    const ids = await populate(svc);
    const path = svc.state.rows.get(ids.rowId)!.dirs.row + '/note.md';
    await new Promise(r => setTimeout(r, 5));
    await (b as MemoryBackend).touch(path, '---\nid: x\ntype: row-note\nowner: ' + ids.rowId + '\n---\nEdited in my text editor\n');
    // A local edit to the same note now must not clobber the outside edit.
    svc.commit({ ...svc.store, notes: { ...svc.store.notes, row: { [ids.rowId]: 'Local edit' } } });
    await svc.flush();
    expect(await b.readText(path)).toContain('Edited in my text editor');
    const copies = (await b.list(svc.state.rows.get(ids.rowId)!.dirs.row!)).map(e => e.name).filter(n => n.startsWith('note.conflict-'));
    expect(copies.length).toBe(1);
    expect(await b.readText(svc.state.rows.get(ids.rowId)!.dirs.row + '/' + copies[0])).toContain('Local edit');
    expect(svc.store.notes.row[ids.rowId]).toBe('Edited in my text editor');
    expect(svc.getStatus().notices.join(' ')).toMatch(/changed outside the app/);
  });

  it('with no local change, an outside note edit is simply reloaded on focus', async () => {
    const { b, svc } = await newVault();
    const ids = await populate(svc);
    const path = svc.state.rows.get(ids.rowId)!.dirs.row + '/note.md';
    await (b as MemoryBackend).touch(path, 'No frontmatter any more\n');
    expect(await svc.checkExternal()).toBe('notes');
    expect(svc.store.notes.row[ids.rowId]).toBe('No frontmatter any more');
    // Frontmatter is repaired (same id) only when the note is next saved.
    expect(await b.readText(path)).toBe('No frontmatter any more\n');
    const id = svc.state.notes.get('row:' + ids.rowId)!.id;
    svc.commit({ ...svc.store, notes: { ...svc.store.notes, row: { [ids.rowId]: 'Saved again' } } });
    await svc.flush();
    expect(await b.readText(path)).toBe('---\nid: ' + id + '\ntype: row-note\nowner: ' + ids.rowId + '\n---\nSaved again\n');
  });

  it('an outside edit to a record stops writing and keeps both versions', async () => {
    const { b, svc, pid } = await newVault();
    const ids = await populate(svc);
    const rec = '.matrix/records/' + pid + '/rows/' + ids.rowId + '.json';
    const edited = (await b.readText(rec)).replace('"WRWYCR"', '"WRWYCR (hand-edited)"');
    await (b as MemoryBackend).touch(rec, edited);
    svc.commit(lib.updateSeq(svc.store, ids.rowId, { desc: 'local change' }).store);
    await svc.flush();
    expect(await b.readText(rec)).toBe(edited);
    expect(svc.getStatus().save).toBe('error');
    // Ours is kept as a conflict copy next to it, which the loader never reads as a record.
    const copies = (await b.list('.matrix/records/' + pid + '/rows')).map(e => e.name).filter(n => n.includes('.conflict-'));
    expect(copies.length).toBe(1);
    expect(await b.readText('.matrix/records/' + pid + '/rows/' + copies[0])).toContain('local change');
    await svc.reload({ discard: true });
    expect(svc.store.seqs[0].name).toBe('WRWYCR (hand-edited)');
  });
});

describe('load states', () => {
  it('a record pointing at a missing file shows it as missing; the record is kept', async () => {
    const { b, svc, vault, pid } = await newVault();
    const ids = await populate(svc);
    const path = svc.fileMeta(ids.pdbId)!.path;
    await vault.close();
    await b.remove(path);
    const { svc: again } = await reopen(b);
    expect(again.report.missing.map(m => m.fileId)).toContain(ids.pdbId);
    expect(again.store.seqs[0].structures.find(s => s.fileId === ids.pdbId)!.state).toBe('missing');
    expect(await b.readText('.matrix/records/' + pid + '/rows/' + ids.rowId + '.json')).toContain(ids.pdbId);
  });

  it('a missing PMF original is shown as missing and left out of the value', async () => {
    const { b, svc, vault } = await newVault();
    const ids = await populate(svc);
    await vault.close();
    await b.remove(svc.fileMeta(ids.pmfId)!.path);
    await b.remove('.matrix/cache', { recursive: true });
    const { svc: again } = await reopen(b);
    const run = again.store.seqs[0].runs[0];
    expect(run.state).toBe('missing');
    expect(lib.cellValue(again.store.seqs[0], 'ha', 'area', null, lib.ENTROPY)).toBeNull(); // R2: takes the transform
  });

  it('a file dropped into the folder by hand is listed as untracked, and can be ignored', async () => {
    const { b, svc, vault } = await newVault();
    const ids = await populate(svc);
    const cell = svc.state.rows.get(ids.rowId)!.dirs.cells.ha;
    await b.writeText(cell + '/handmade.xvg', '0 1\n1 2\n2 3\n3 4\n');
    await b.writeText(cell + '/half-written.xvg.crswap', 'x');
    await vault.close();
    const { svc: again } = await reopen(b);
    expect(again.report.untracked).toEqual([cell + '/handmade.xvg']);
    await again.setIgnored([cell + '/handmade.xvg']);
    expect(again.report.untracked).toEqual([]);
    expect(await b.stat(cell + '/handmade.xvg')).toBeTruthy();
  });

  it('two folders with the same id are reported as a conflict and saving pauses', async () => {
    const { b, svc, vault } = await newVault();
    const ids = await populate(svc);
    const dir = svc.state.rows.get(ids.rowId)!.dirs.row!;
    await vault.close();
    await b.mkdir(dir.replace(/[^/]+$/, 'copy--' + ids.rowId));
    const { svc: again } = await reopen(b);
    expect(again.report.conflicts.length).toBe(1);
    expect(again.getStatus().save).toBe('error');
  });

  it('an untracked file can be attached (moved, not copied)', async () => {
    const { b, svc } = await newVault();
    const ids = await populate(svc);
    await b.writeBytes(svc.projectDir + '/model-by-hand.pdb', fixture('test.pdb'));
    await svc.verify();
    const { fileId, upload } = await svc.adoptUntracked(svc.projectDir + '/model-by-hand.pdb');
    const s = lib.addStructure(svc.store, ids.rowId, { id: 'stx', name: 'model-by-hand.pdb', format: 'pdb', added: '', size: 0, atoms: 0, fileId });
    svc.commit(s, new Map([[fileId, upload]])); await svc.flush();
    expect(await b.stat(svc.projectDir + '/model-by-hand.pdb')).toBeNull();
    expect(await sha256Hex(await svc.readUpload(fileId))).toBe(await sha256Hex(fixture('test.pdb')));
  });
});

describe('schema versions and locking', () => {
  it('an older vault is upgraded by explicit steps, backing up the .matrix files first', async () => {
    const { b, vault } = await newVault();
    await vault.close();
    const m = JSON.parse(await b.readText('.matrix/manifest.json'));
    await b.writeText('.matrix/manifest.json', JSON.stringify({ ...m, schemaVersion: 0 }));
    await b.writeText('.matrix/old-thing.json', '{"legacy":true}');
    // Steps return their record writes (F19); the vault backs up exactly those paths and applies them at the commit point.
    const step: SchemaMigration = { from: 0, to: 1, describe: 'test', run: async () => [{ path: '.matrix/old-thing.json', text: null }] };
    const real = (await import('../src/lib/storage/manifest')).MIGRATIONS;
    const v = await Vault.open(b, { migrations: [step, ...real] });
    expect(v.manifest.schemaVersion).toBe(SCHEMA_VERSION);
    expect(v.upgradedFrom).toBe(0);
    expect(await b.stat('.matrix/old-thing.json')).toBeNull();
    const backup = (await v.listTrash()).find(t => t.manifest?.type === 'schema-backup' && t.manifest.id === 'v0')!;
    expect(await b.readText(backup.dir + '/content/.matrix/old-thing.json')).toBe('{"legacy":true}');
  });

  it('a newer vault opens read-only and explains why', async () => {
    const { b, vault } = await newVault();
    await vault.close();
    const m = JSON.parse(await b.readText('.matrix/manifest.json'));
    await b.writeText('.matrix/manifest.json', JSON.stringify({ ...m, schemaVersion: 99 }));
    const v = await Vault.open(b);
    expect(v.readOnly).toBe(true);
    expect(v.readOnlyReason).toMatch(/newer version/);
    const [p] = await v.listProjects();
    const svc = await v.openProject(p.id);
    svc.commit(lib.addColumn(svc.store, 'X', 'x').store);
    await svc.flush();
    expect(svc.getStatus().save).toBe('read-only');
    expect(JSON.parse(await b.readText('.matrix/manifest.json')).schemaVersion).toBe(99);
  });

  it('a second tab opens the same vault read-only', async () => {
    const locks = sharedLocks();
    const { b } = await newVault(new MemoryBackend(), locks);
    const second = await Vault.open(b, { lock: locks });
    expect(second.readOnly).toBe(true);
    expect(second.readOnlyReason).toMatch(/another tab/);
  });
});

describe('write failures', () => {
  it('a failed write keeps the change in memory and saves it after retry', async () => {
    const b = new MemoryBackend();
    const { svc } = await newVault(b);
    const ids = await populate(svc);
    b.fault = (op) => op === 'write';
    svc.commit(lib.updateSeq(svc.store, ids.rowId, { desc: 'kept in memory' }).store);
    await svc.flush().catch(() => {});
    expect(svc.getStatus().save).toBe('error');
    expect(svc.hasPendingWrites()).toBe(true);
    b.fault = null;
    await svc.retry();
    expect(svc.getStatus().save).toBe('saved');
    const { svc: again } = await reopen(b);
    expect(again.store.seqs[0].desc).toBe('kept in memory');
  });
});
