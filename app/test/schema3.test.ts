import { describe, expect, it } from 'vitest';
import type { MemoryBackend } from '../src/lib/storage/backend/memory';
import { VaultIO } from '../src/lib/storage/io';
import { MIGRATIONS } from '../src/lib/storage/manifest';
import { SCHEMA_VERSION } from '../src/lib/storage/records';
import { Vault } from '../src/lib/storage/vault';
import { EXPORT_VERSION, exportDataset, importAsProject } from '../src/lib/storage/exchange';
import type { Store } from '../src/lib/types';
import { reopen, vaultFixture } from './helpers';
import { readFileSync } from 'node:fs';

// Batch 2, R4e: each curve's visibility and shade live on its record (F64). Schema 3, export v6.
const FROZEN = 'formats/schema-2-vault', PID = 'pmux8q7cs3ypk8', ROW = '.matrix/records/' + PID + '/rows/smux8q7bk29dtx.json';

async function files(b: MemoryBackend) {
  const out: Record<string, string> = {};
  const walk = async (dir: string): Promise<void> => {
    for (const e of await b.list(dir)) {
      const p = dir + '/' + e.name;
      if (e.kind === 'dir') await walk(p);
      else out[p.replace(/^\.matrix\/trash\/[^/]+\//, 'TRASH/')] = (await b.readText(p)).replace(/"deletedAt": "[^"]+"/, '');
    }
  };
  for (const d of ['.matrix/records', '.matrix/settings', '.matrix/trash']) if (await b.stat(d)) await walk(d);
  out.schema = String(JSON.parse(await b.readText('.matrix/manifest.json')).schemaVersion);
  return out;
}
const rdf = (s: Store) => s.seqs.flatMap(q => q.extras).find(e => e.type === 'rdf')!;
const display = (s: Store) => rdf(s).curves.map(c => [c.label, c.vis ?? null, c.shade ?? null]);

describe('schema 2 → 3: curve display on the record (R4e)', () => {
  it('versions moved together', () => expect([SCHEMA_VERSION, EXPORT_VERSION]).toEqual([3, 6]));

  it('upgrades the frozen schema-2 vault without changing a record, with a backup', async () => {
    const b = await vaultFixture(FROZEN), before = await files(b);
    const v = await Vault.open(b);
    expect([v.upgradedFrom, v.manifest.schemaVersion]).toEqual([2, 3]);
    const after = await files(b);
    for (const [p, t] of Object.entries(before)) if (p !== 'schema') expect([p, after[p]]).toEqual([p, t]);
    expect((await v.listTrash()).map(t => t.manifest?.type)).toEqual(['schema-backup']);
  });

  it('the step changes nothing and is safe to run again', async () => {
    const step = MIGRATIONS.find(m => m.from === 2)!;
    expect(step.to).toBe(3);
    const b = await vaultFixture(FROZEN);
    expect(await step.run(new VaultIO(b))).toEqual([]);
    await Vault.open(b);
    expect(await step.run(new VaultIO(b))).toEqual([]);
  });

  it.each([
    ['before the commit point', (op: string, p: string) => op === 'write' && p.startsWith('.matrix/trash/')],
    ['after the commit point', (op: string, p: string) => op === 'write' && p === '.matrix/manifest.json'],
  ])('an upgrade interrupted %s ends in the same state as a clean one', async (_when, fault) => {
    const clean = await vaultFixture(FROZEN);
    await Vault.open(clean);
    const b = await vaultFixture(FROZEN);
    b.fault = fault;
    await expect(Vault.open(b)).rejects.toThrow();
    b.fault = null;
    const v = await Vault.open(b);
    expect(v.manifest.schemaVersion).toBe(3);
    expect(await files(b)).toEqual(await files(clean));
  });

  it('a schema-4 vault (newer than this app) opens read-only and is not changed', async () => {
    const b = await vaultFixture(FROZEN);
    await Vault.open(b);
    const m = JSON.parse(await b.readText('.matrix/manifest.json'));
    await b.writeText('.matrix/manifest.json', JSON.stringify({ ...m, schemaVersion: 4 }));
    const before = await files(b);
    const v = await Vault.open(b);
    expect([v.readOnly, v.upgradedFrom]).toEqual([true, null]);
    expect(await files(b)).toEqual(before);
  });

  it('visibility and shade survive close → reopen; odd values are cleaned on write', async () => {
    const b = await vaultFixture(FROZEN);
    const { svc } = await reopen(b);
    const e = rdf(svc.store);
    const set = (patch: (i: number) => object) => ({ ...svc.store, seqs: svc.store.seqs.map(q => ({ ...q, extras: q.extras.map(x => (x.id !== e.id ? x : { ...x, curves: x.curves.map((c, i) => ({ ...c, ...patch(i) })) })) })) });
    svc.commit(set(i => (i ? { vis: 'off', shade: -2 } : { vis: 'dim', shade: 3 })));
    await svc.flush();
    expect(display((await reopen(b)).svc.store)).toEqual([['Protein', 'dim', 3], ['second sugar', 'off', -2]]);
    const rec = JSON.parse(await b.readText(ROW)).analyses.find((a: { type: string }) => a.type === 'rdf').curves;
    expect(rec.map((c: { vis?: string; shade?: number }) => [c.vis, c.shade])).toEqual([['dim', 3], ['off', -2]]);
    svc.commit(set(i => (i ? { vis: 'bogus', shade: 9.4 } : { vis: undefined, shade: 0 })));
    await svc.flush();
    expect(display((await reopen(b)).svc.store)).toEqual([['Protein', null, null], ['second sugar', null, 3]]);
  });

  it('export v6 → import keeps visibility and shade', async () => {
    const b = await vaultFixture(FROZEN);
    const { svc } = await reopen(b);
    const e = rdf(svc.store);
    svc.commit({ ...svc.store, seqs: svc.store.seqs.map(q => ({ ...q, extras: q.extras.map(x => (x.id !== e.id ? x : { ...x, curves: x.curves.map((c, i) => (i ? { ...c, vis: 'dim' as const, shade: 1 } : c)) })) })) });
    await svc.flush();
    const { text } = await exportDataset(svc.store, { project: 'P', settings: {}, src: { read: f => svc.readUpload(f), meta: f => svc.fileMeta(f) } });
    expect(JSON.parse(text).version).toBe(6);
    const prep = await importAsProject(text);
    expect(display(prep.store)).toEqual([['Protein', null, null], ['second sugar', 'dim', 1]]);
  });

  it.each(['export-v5.json', 'export-v4.json', 'export-v3.json'])('%s still imports', async name => {
    const prep = await importAsProject(readFileSync(new URL('./fixtures/formats/' + name, import.meta.url), 'utf8'));
    expect(prep.store.seqs.flatMap(s => s.runs)).toHaveLength(4);
    expect(prep.store.seqs.flatMap(s => s.extras).flatMap(e => e.curves).every(c => c.vis === undefined && c.shade === undefined)).toBe(true);
  });
});
