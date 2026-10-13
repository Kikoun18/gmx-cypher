import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { MemoryBackend } from '../src/lib/storage/backend/memory';
import { VaultIO } from '../src/lib/storage/io';
import { MIGRATIONS } from '../src/lib/storage/manifest';
import { Vault } from '../src/lib/storage/vault';
import { EXPORT_VERSION, exportDataset, importAsProject } from '../src/lib/storage/exchange';
import { SCHEMA_VERSION } from '../src/lib/storage/records';
import { fixture, newVault, reopen, vaultFixture, withPmf } from './helpers';

describe('project tag list (R2a)', () => {
  it('defaults to the four former methods, labels unchanged', () => {
    expect(lib.getTags(lib.mergeSettings({}, {}))).toEqual([
      { k: 'hmr', label: 'hmr' }, { k: 'fast', label: 'fast water' }, { k: 'prosecco75', label: 'prosecco75' }, { k: 'add', label: 'ADD' },
    ]);
  });
  it('new tags get a stable key derived from the label, unique in the list', () => {
    const list = lib.getTags(lib.mergeSettings({}, {}));
    expect(lib.newTag(list, 'Long run')).toEqual({ k: 'long-run', label: 'Long run' });
    expect(lib.newTag(list, 'HMR')).toEqual({ k: 'hmr-2', label: 'HMR' });
  });
  it('is saved in tags.json, not settings.json, and survives reopening', async () => {
    const { b, svc, pid } = await newVault();
    const tags = [{ k: 'hmr', label: 'HMR 4 fs' }, { k: 'long', label: 'long' }];
    svc.commit({ ...svc.store, settings: { ...svc.store.settings, tags } });
    await svc.flush();
    expect(JSON.parse(await b.readText('.matrix/settings/' + pid + '/tags.json'))).toEqual({ tags });
    expect(JSON.parse(await b.readText('.matrix/settings/' + pid + '/settings.json')).tags).toBeUndefined();
    expect((await reopen(b)).svc.store.settings?.tags).toEqual(tags);
  });
  it('a project without tags.json uses the defaults', async () => {
    const { b } = await newVault();
    expect(lib.getTags(lib.mergeSettings({}, (await reopen(b)).svc.store.settings))).toEqual(lib.DEFAULT_TAGS);
  });
});

describe('tags in use', () => {
  const XVG = 'hmrfast6_ha_a_t200000.xvg';
  const two = () => {
    const a = withPmf(lib.emptyStore(), { name: 'WRWYCR', col: 'ha', file: XVG, bytes: fixture(XVG) });
    return withPmf(a.store, { name: 'WRWYCR', col: 'ha', slot: 'b', file: 'b.xvg', bytes: fixture(XVG) }).store;
  };
  it('counts the runs that carry a tag', () => {
    expect([lib.tagUse(two(), 'add'), lib.tagUse(two(), 'hmr')]).toEqual([2, 0]);
  });
  it('deleting a tag in use removes it from those runs (F16)', () => {
    const s = lib.removeTagData(two(), 'add');
    expect(lib.tagUse(s, 'add')).toBe(0);
    expect(s.seqs[0].runs).toHaveLength(2);
  });
});

// --- R2b: runs carry tags; schema 1 → 2 ---------------------------------------------------------

const FROZEN = 'formats/schema-1-vault';
const PID = 'pmuvub51rumaol';
const ROWS = ['smuvub52s8fae4', 'smuvub52t68s6u'];
const rowPath = (id: string) => '.matrix/records/' + PID + '/rows/' + id + '.json';
type RunRecLike = { column: string; slot: string; tags?: string[]; methods?: unknown };

/** Every record and settings file, plus the backup's content files (trash folder names carry a time, so they're left out). */
async function snapshotVault(b: MemoryBackend) {
  const out: Record<string, string> = {};
  const walk = async (dir: string): Promise<void> => {
    for (const e of await b.list(dir)) {
      const p = dir + '/' + e.name;
      if (e.kind === 'dir') await walk(p);
      else out[p.replace(/^\.matrix\/trash\/[^/]+\//, 'TRASH/')] = await b.readText(p);
    }
  };
  for (const d of ['.matrix/records', '.matrix/settings', '.matrix/trash']) if (await b.stat(d)) await walk(d);
  out.schema = String(JSON.parse(await b.readText('.matrix/manifest.json')).schemaVersion);
  for (const k of Object.keys(out)) if (k.endsWith('trash-manifest.json')) out[k] = out[k].replace(/"deletedAt": "[^"]+"/, '');
  return out;
}

describe('schema 1 → 2: methods become tags (R2b)', () => {
  it('upgrades the frozen schema-1 vault, field by field, with a backup in the trash', async () => {
    const b = await vaultFixture(FROZEN);
    const before = Object.fromEntries(await Promise.all(ROWS.map(async id => [id, await b.readText(rowPath(id))])));
    const v = await Vault.open(b);
    // Batch 2 (F79): the vault now goes on to schema 3 in the same open; 2 → 3 changes no record.
    expect([v.manifest.schemaVersion, v.upgradedFrom]).toEqual([SCHEMA_VERSION, 1]);
    const runs = (id: string) => (JSON.parse(before[id]).runs as RunRecLike[]);
    for (const id of ROWS) {
      const old = JSON.parse(before[id]), now = JSON.parse(await b.readText(rowPath(id)));
      // Only the runs changed: methods → tags (true → tagged), nothing else.
      expect({ ...now, runs: null }).toEqual({ ...old, runs: null });
      expect(now.runs.map((r: RunRecLike) => { const { tags: _t, ...rest } = r; return rest; })).toEqual(runs(id).map(r => { const { methods: _m, ...rest } = r; return rest; }));
      expect(now.runs.every((r: RunRecLike) => !('methods' in r))).toBe(true);
    }
    const wr = JSON.parse(await b.readText(rowPath(ROWS[0]))).runs.map((r: RunRecLike) => [r.column, r.slot, r.tags]);
    expect(wr).toEqual([['ha', 'a', ['add', 'fast', 'hmr']], ['ha', 'b', ['fast', 'hmr']], ['pg', 'a', ['prosecco75']]]);
    expect(JSON.parse(await b.readText(rowPath(ROWS[1]))).runs.map((r: RunRecLike) => r.tags)).toEqual([[]]);
    expect(JSON.parse(await b.readText('.matrix/settings/' + PID + '/tags.json'))).toEqual({ tags: lib.DEFAULT_TAGS });
    const backup = (await v.listTrash()).find(t => t.manifest?.type === 'schema-backup' && t.manifest.id === 'v1')!; // the 1 → 2 backup (F79)
    for (const id of ROWS) expect(await b.readText(backup.dir + '/content/' + rowPath(id))).toBe(before[id]);
    // The app sees the same runs, now with tags, and the same labels.
    const [p] = await v.listProjects();
    const svc = await v.openProject(p.id, { notes: 'eager' });
    const r1 = svc.store.seqs.find(s => s.name === 'WRWYCR')!.runs.find(r => r.sacch === 'ha' && r.run === 'a')!;
    expect(lib.tagLabel(r1.tags, lib.getTags(lib.mergeSettings({}, svc.store.settings)))).toBe('hmr · fast water · ADD');
  });

  it('is safe to run again: the step on an upgraded record changes nothing', async () => {
    const b = await vaultFixture(FROZEN);
    await Vault.open(b);
    const writes = await MIGRATIONS[0].run(new VaultIO(b));
    expect(writes).toEqual([]);
  });

  it.each([
    ['before the commit point', (op: string, p: string) => op === 'write' && p.includes('/content/') && p.endsWith(ROWS[1] + '.json')],
    ['after the commit point', (op: string, p: string) => op === 'write' && p === rowPath(ROWS[1])],
  ])('a crash %s ends in the same state as a clean upgrade', async (_when, fault) => {
    const clean = await vaultFixture(FROZEN);
    await Vault.open(clean);
    const b = await vaultFixture(FROZEN);
    b.fault = fault;
    await expect(Vault.open(b)).rejects.toThrow();
    b.fault = null;
    const v = await Vault.open(b);
    expect(v.manifest.schemaVersion).toBe(SCHEMA_VERSION);
    expect(await snapshotVault(b)).toEqual(await snapshotVault(clean));
    // A rolled-back backup leaves no empty trash folder behind: exactly one backup item per step from 1 (F79; version-relative since F119).
    expect((await v.listTrash()).map(t => t.manifest?.type)).toEqual(Array(SCHEMA_VERSION - 1).fill('schema-backup'));
  });

  it('a vault newer than this app opens read-only and is not changed', async () => {
    const b = await vaultFixture(FROZEN);
    await Vault.open(b);
    const m = JSON.parse(await b.readText('.matrix/manifest.json'));
    await b.writeText('.matrix/manifest.json', JSON.stringify({ ...m, schemaVersion: SCHEMA_VERSION + 1 }));
    const before = await snapshotVault(b);
    const v = await Vault.open(b);
    expect([v.readOnly, v.upgradedFrom]).toEqual([true, null]);
    expect(await snapshotVault(b)).toEqual(before);
  });

  it('tags survive close → reopen, sorted, and unknown keys are kept', async () => {
    const { b, svc } = await newVault();
    const a = withPmf(svc.store, { name: 'WRWYCR', col: 'ha', file: 'x.xvg', bytes: fixture('hmrfast6_ha_a_t200000.xvg') });
    const s = { ...a.store, seqs: a.store.seqs.map(q => ({ ...q, runs: q.runs.map(r => ({ ...r, tags: ['zz-from-import', 'hmr'] })) })) };
    svc.commit(s, a.uploads);
    await svc.flush();
    const again = await reopen(b);
    const r = again.svc.store.seqs[0].runs[0];
    expect(r.tags).toEqual(['hmr', 'zz-from-import']);
    expect(lib.tagLabel(r.tags, lib.DEFAULT_TAGS)).toBe('hmr · zz-from-import');
  });

  it('renaming a tag label keeps the runs’ tags', async () => {
    const { b, svc } = await newVault();
    const a = withPmf(svc.store, { name: 'WRWYCR', col: 'ha', file: 'x.xvg', bytes: fixture('hmrfast6_ha_a_t200000.xvg') });
    svc.commit({ ...a.store, settings: { tags: [{ k: 'add', label: 'added by hand' }] } }, a.uploads);
    await svc.flush();
    const r = (await reopen(b)).svc.store.seqs[0].runs[0];
    expect([r.tags, lib.tagLabel(r.tags, [{ k: 'add', label: 'added by hand' }])]).toEqual([['add'], 'added by hand']);
  });

  it('old stores with methods (exports, legacy) load as tags', () => {
    const s = lib.normStore({ seqs: [{ id: 's1', name: 'A', seq: '', group: '', desc: '', extras: [], structures: [], runs: [{ id: 'r1', sacch: 'ha', run: 'a', time: '', temp: 300, methods: { hmr: true, fast: false, add: true }, file: '', added: '', x: [], y: [] } as never] }] });
    expect(s.seqs[0].runs[0]).toMatchObject({ tags: ['add', 'hmr'] });
    expect('methods' in s.seqs[0].runs[0]).toBe(false);
  });
});

// --- R2c: export v5, and the labels -------------------------------------------------------------

describe('dataset export v5 with tags (R2c)', () => {
  it('round-trips run tags (unknown ones too) and the project tag list', async () => {
    const { svc } = await newVault();
    const a = withPmf(svc.store, { name: 'WRWYCR', col: 'ha', file: 'x.xvg', bytes: fixture('hmrfast6_ha_a_t200000.xvg') });
    const tags = [{ k: 'hmr', label: 'HMR' }, { k: 'long', label: 'long run' }];
    const s = { ...a.store, settings: { tags }, seqs: a.store.seqs.map(q => ({ ...q, runs: q.runs.map(r => ({ ...r, tags: ['hmr', 'long', 'zz-unknown'] })) })) };
    svc.commit(s, a.uploads);
    await svc.flush();
    const { text } = await exportDataset(svc.store, { project: 'P', settings: lib.splitSettings(lib.mergeSettings({}, svc.store.settings)).project, src: { read: f => svc.readUpload(f), meta: f => svc.fileMeta(f) } });
    const raw = JSON.parse(text);
    expect([raw.version, raw.settings.tags, raw.seqs[0].runs[0].tags, 'methods' in raw.seqs[0].runs[0]]).toEqual([EXPORT_VERSION, tags, ['hmr', 'long', 'zz-unknown'], false]);
    const prep = await importAsProject(text);
    expect([prep.store.seqs[0].runs[0].tags, prep.store.settings?.tags]).toEqual([['hmr', 'long', 'zz-unknown'], tags]);
  });
  it('an export from a newer version is refused', async () => {
    await expect(importAsProject(JSON.stringify({ format: 'pmf-sequences', version: EXPORT_VERSION + 1, seqs: [] }))).rejects.toThrow(/newer version/);
  });
});

describe('new uploads start untagged (R2c)', () => {
  it('the upload form has no tags unless picked', () => {
    expect(lib.blankUploadForm(lib.mergeSettings({}, {}), lib.getCols(null)).tags).toEqual([]);
  });
});

describe('review fixes', () => {
  it('a row restored from a pre-upgrade trash item keeps its methods as tags', async () => {
    const { b, svc } = await newVault();
    const a = withPmf(svc.store, { name: 'WRWYCR', col: 'ha', file: 'x.xvg', bytes: fixture('hmrfast6_ha_a_t200000.xvg') });
    svc.commit(a.store, a.uploads);
    await svc.flush();
    svc.commit(lib.deleteSeq(svc.store, a.rowId));
    await svc.flush();
    // Make the trash manifest look like one written before R2 (schema 1: methods, no tags).
    const item = (await svc.listTrash())[0];
    const mp = item.dir + '/trash-manifest.json', m = JSON.parse(await b.readText(mp));
    m.records.row.runs = m.records.row.runs.map(({ tags: _t, ...r }: { tags: string[] }) => ({ ...r, methods: { add: true, hmr: true, fast: false } }));
    await b.writeText(mp, JSON.stringify(m));
    await svc.restore((await svc.listTrash())[0]);
    expect(svc.store.seqs[0].runs[0].tags).toEqual(['add', 'hmr']);
  });
});
