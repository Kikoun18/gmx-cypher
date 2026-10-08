import { describe, expect, it } from 'vitest';
import { MemoryBackend } from '../src/lib/storage/backend/memory';
import { EXPORT_VERSION, exportDataset, importAsProject, importInto } from '../src/lib/storage/exchange';
import { sha256Hex } from '../src/lib/storage/json';
import * as lib from '../src/lib/seq';
import { fixture, newVault, text, withPmf, withStructure } from './helpers';

const XVG = 'hmrfast6_ha_a_t200000.xvg';

async function populated() {
  const v = await newVault(new MemoryBackend());
  const a = withPmf(v.svc.store, { name: 'WRWYCR', col: 'ha', file: XVG, bytes: fixture(XVG) });
  const st = withStructure(a.store, a.rowId, 'test.pdb', fixture('test.pdb'), 'pdb');
  v.svc.commit({ ...st.store, notes: { row: { [a.rowId]: 'row note' }, cell: {} } }, new Map([...a.uploads, ...st.uploads]));
  await v.svc.flush();
  return v;
}

describe('dataset JSON', () => {
  it('v5 export → import as a new project keeps every original byte-identical', async () => {
    const v = await populated();
    const { text: json, missing } = await exportDataset(v.svc.store, { project: 'Sugar PMFs', settings: {}, src: { read: f => v.svc.readUpload(f), meta: f => v.svc.fileMeta(f) } });
    expect(missing).toEqual([]);
    expect(JSON.parse(json).version).toBe(EXPORT_VERSION); // was 5; batch 2 moved it to 6 (F79)

    const prep = await importAsProject(json);
    const p = await v.vault.createProject(prep.name, { cols: prep.store.cols });
    const svc = await v.vault.openProject(p.id, { notes: 'eager' });
    svc.commit(prep.store, prep.uploads);
    await svc.flush();
    const run = svc.store.seqs[0].runs[0], struct = svc.store.seqs[0].structures[0];
    expect(await sha256Hex(await svc.readUpload(run.src!.fileId))).toBe(await sha256Hex(fixture(XVG)));
    expect(await sha256Hex(await svc.readUpload(struct.fileId!))).toBe(await sha256Hex(fixture('test.pdb')));
    expect(svc.fileMeta(run.src!.fileId)!.origin).toBe('upload');
    expect(svc.store.notes.row[svc.store.seqs[0].id]).toBe('row note');
    // IDs are kept (they don't collide in the new project)
    expect(run.src!.fileId).toBe(v.svc.store.seqs[0].runs[0].src!.fileId);
    expect(svc.store.seqs[0].id).toBe(v.svc.store.seqs[0].id);
  });

  it('a v3 export (no originals) imports with reconstructed files and its structure text', async () => {
    const v = await newVault(new MemoryBackend());
    const t = lib.parseTable(text(fixture(XVG)));
    const { x, y } = lib.runFromTable(t, 1, 2);
    const res = lib.addRun(lib.emptyStore(), { name: 'P1', seq: '', group: '', desc: '', sacch: 'o26', run: 'a', time: '', temp: 300, tags: [], file: 'old.xvg', x, y });
    const s = lib.addStructure(res.store, res.rowId, { id: 'st1', name: 'm.pdb', format: 'pdb', added: '2026-01-01', size: 5, atoms: 1, note: '' });
    const v3 = JSON.stringify({ format: 'pmf-sequences', version: 3, project: 'Old', ...s, structData: { st1: 'ATOM  ' } });
    const prep = await importInto(v3, v.svc.store);
    expect(prep.dropped).toEqual([]);
    v.svc.commit(prep.store, prep.uploads);
    await v.svc.flush();
    const run = v.svc.store.seqs[0].runs[0];
    const meta = v.svc.fileMeta(run.src!.fileId)!;
    expect(meta.origin).toBe('reconstructed');
    expect(meta.path.endsWith('old.reconstructed.xvg')).toBe(true);
    expect(run.x).toEqual(x);
    expect(await (await v.svc.readUpload(v.svc.store.seqs[0].structures[0].fileId!)).text()).toBe('ATOM  ');
  });

  it('importing into the same project again gives colliding files fresh IDs; unsafe IDs are replaced', async () => {
    const v = await populated();
    const { text: json } = await exportDataset(v.svc.store, { project: 'X', settings: {}, src: { read: f => v.svc.readUpload(f), meta: f => v.svc.fileMeta(f) } });
    const before = v.svc.store.seqs[0].runs[0].src!.fileId;
    const prep = await importInto(json, v.svc.store);
    expect([...prep.uploads.keys()]).not.toContain(before);
    const raw = JSON.parse(json);
    raw.seqs[0].id = '../evil'; raw.notes.row = { '../evil': 'n' };
    const p2 = await importAsProject(JSON.stringify(raw));
    expect(p2.store.seqs[0].id).toMatch(/^s[a-z0-9]+$/);
    expect(p2.store.notes.row[p2.store.seqs[0].id]).toBe('n');
  });

  it('refuses something that is not an export', async () => {
    await expect(importAsProject('{"hello":1}')).rejects.toThrow(/Not a PMF/);
  });
});
