import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { describeUpload, readLocal } from '../src/lib/storage/files';
import { sha256Hex } from '../src/lib/storage/json';
import { fixture, newVault, text, withPmf, withStructure } from './helpers';

const XVG = 'hmrfast6_ha_a_t200000.xvg';
const bytes = fixture(XVG);
const blob = (b: Uint8Array) => new Blob([b as Uint8Array<ArrayBuffer>]);

async function project() {
  const v = await newVault();
  const a = withPmf(v.svc.store, { name: 'WRWYCR', col: 'ha', slot: 'b', file: 'hmrfast6_ha_b_t200000.xvg', bytes, group: 'g' });
  const st = withStructure(a.store, a.rowId, 'test.pdb', fixture('test.pdb'), 'pdb');
  v.svc.commit(st.store, new Map([...a.uploads, ...st.uploads]));
  await v.svc.flush();
  return { ...v, rowId: a.rowId };
}

describe('readLocal: one read gives the text and the hash', () => {
  it('matches the file', async () => {
    const r = await readLocal(blob(bytes));
    expect(r.text).toBe(text(bytes));
    expect(r.sha256).toBe(await sha256Hex(bytes));
  });
  it('describeUpload reuses a supplied hash instead of reading again', async () => {
    const meta = await describeUpload('f1', { blob: blob(bytes), name: 'x.xvg', sha256: 'given' }, 'pmf-xvg', 'r1', 'dir', []);
    expect(meta.sha256).toBe('given');
  });
});

describe('ProjectService.findSame (R6)', () => {
  it('same bytes, different name → names the existing owner', async () => {
    const { svc } = await project();
    expect(await svc.findSame(await sha256Hex(bytes))).toBe('Identical to run 2 of WRWYCR × HA (hmrfast6_ha_b_t200000.xvg)');
    expect(await svc.findSame(await sha256Hex(fixture('test.pdb')))).toBe('Identical to the structure test.pdb of WRWYCR');
  });
  it('same name, different bytes → nothing', async () => {
    const { svc } = await project();
    expect(await svc.findSame(await sha256Hex(fixture('WTA.gro')))).toBeNull();
  });
  it('a placeholder with an empty sha256 is never reported', async () => {
    const { svc } = await project();
    expect(await svc.findSame('')).toBeNull();
  });
  it('a copy in the trash is reported separately', async () => {
    const { svc, rowId } = await project();
    svc.commit(lib.deleteSeq(svc.store, rowId));
    await svc.flush();
    expect(await svc.findSame(await sha256Hex(bytes))).toBe('A deleted copy is in the trash (Sequence WRWYCR)');
  });
  it('other projects are not searched', async () => {
    const { vault } = await project();
    const other = await vault.createProject('Other');
    const svc2 = await vault.openProject(other.id, { notes: 'eager' });
    expect(await svc2.findSame(await sha256Hex(bytes))).toBeNull();
  });
});

describe('planBatch: identical content', () => {
  const st = lib.mergeSettings({}, {});
  const table = lib.parseTable(text(bytes));
  const file = (id: string, name: string, sha: string, sameAs?: string): lib.UploadFile => ({ id, file: name, table, head: table.head, sha256: sha, sameAs });
  const form = (files: lib.UploadFile[], include?: Record<string, boolean>): lib.UploadForm => ({
    files, name: 'WRWYCR', seq: '', group: '', desc: '', time: '', temp: '300', col: 'ha', run: 'auto', parse: false, keepName: true,
    tags: [], msg: '', err: false, ana: 'auto', onClash: 'replace', include,
  });
  const types = lib.getAnalyses(st);
  it('a file identical to one in the project is excluded by default, and can be included', () => {
    const f = [file('f1', 'a.xvg', 's1', 'Identical to run 2 of WRWYCR × HA (b.xvg)')];
    const [p] = lib.planBatch(lib.emptyStore(), form(f), types, st);
    expect([p.ok, p.sameAs]).toEqual([false, 'Identical to run 2 of WRWYCR × HA (b.xvg)']);
    expect(lib.planBatch(lib.emptyStore(), form(f, { f1: true }), types, st)[0].ok).toBe(true);
  });
  it('a duplicate within one batch names the earlier file', () => {
    const plan = lib.planBatch(lib.emptyStore(), form([file('f1', 'a.xvg', 's1'), file('f2', 'b.xvg', 's1'), file('f3', 'c.xvg', 's2')]), types, st);
    expect(plan.map(p => [p.ok, p.sameAs || ''])).toEqual([[true, ''], [false, 'Identical to a.xvg in this upload'], [true, '']]);
  });
  it('the slot-clash flag (dup) is a separate thing', () => {
    const plan = lib.planBatch(lib.emptyStore(), form([file('f1', 'a.xvg', 's1'), file('f2', 'b.xvg', 's1')]), types, st);
    expect(plan[1].dup).toBe(false);
  });
});
