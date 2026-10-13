import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importAsProject } from '../src/lib/storage/exchange';
import { SCHEMA_VERSION } from '../src/lib/storage/records';
import { reopen, vaultFixture } from './helpers';

// Frozen old formats (spec §1.3): made once with the code at 29cd410, never regenerated.
const frozen = (name: string) => readFileSync(new URL('./fixtures/formats/' + name, import.meta.url), 'utf8');
const runTags = (seqs: { name: string; runs: { sacch: string; run: string; tags: string[] }[] }[]) =>
  seqs.flatMap(s => s.runs.map(r => [s.name, r.sacch, r.run, r.tags])).sort((a, b) => String(a).localeCompare(String(b)));

describe('frozen old-format fixtures', () => {
  it('the schema-1 vault opens (upgraded to the current format)', async () => {
    const { vault, svc } = await reopen(await vaultFixture('formats/schema-1-vault'));
    expect([vault.upgradedFrom, vault.manifest.schemaVersion]).toEqual([1, SCHEMA_VERSION]);
    expect(svc.store.seqs.map(s => s.name).sort()).toEqual(['KRWYCR', 'WRWYCR']);
    expect(svc.store.seqs.flatMap(s => s.runs)).toHaveLength(4);
  });
  it.each(['export-v4.json', 'export-v3.json'])('%s imports', async name => {
    const prep = await importAsProject(frozen(name));
    expect(prep.version).toBe(name === 'export-v4.json' ? 4 : 3);
    expect(prep.store.seqs.flatMap(s => s.structures.map(m => m.name))).toEqual(['test.pdb']);
    expect(prep.store.seqs.flatMap(s => s.runs)).toHaveLength(4);
  });
  it('all three give the same runs, their methods now tags (R2)', async () => {
    const { svc } = await reopen(await vaultFixture('formats/schema-1-vault'));
    const want = runTags(svc.store.seqs);
    expect(want).toEqual([
      ['KRWYCR', 'ha', 'a', []],
      ['WRWYCR', 'ha', 'a', ['add', 'fast', 'hmr']],
      ['WRWYCR', 'ha', 'b', ['fast', 'hmr']],
      ['WRWYCR', 'pg', 'a', ['prosecco75']],
    ]);
    for (const f of ['export-v4.json', 'export-v3.json']) expect(runTags((await importAsProject(frozen(f))).store.seqs)).toEqual(want);
  });
});

// Second frozen set (batch 2, R4-0): made once with the code at 4e0dd0d, never regenerated.
const curvesOf = (seqs: { extras: { type: string; curves: { label: string; custom?: boolean }[] }[] }[]) =>
  seqs.flatMap(s => s.extras).map(e => [e.type, e.curves.length, e.curves.filter(c => c.custom).map(c => c.label)]).sort((a, b) => String(a).localeCompare(String(b)));

describe('frozen batch-2 fixtures (schema 2, export v5)', () => {
  it('the schema-2 vault opens with its multi-curve analyses and tags', async () => {
    const { vault, svc } = await reopen(await vaultFixture('formats/schema-2-vault'));
    expect(vault.manifest.schemaVersion).toBe(SCHEMA_VERSION);
    expect(runTags(svc.store.seqs)).toEqual([
      ['KRWYCR', 'ha', 'a', ['prosecco75']],
      ['WRWYCR', 'ha', 'a', ['add', 'hmr']],
      ['WRWYCR', 'ha', 'b', ['fast']],
      ['WRWYCR', 'pg', 'a', []],
    ]);
    expect(curvesOf(svc.store.seqs)).toEqual([['hist', 21, []], ['rdf', 2, ['second sugar']]]);
  });
  it('export-v5.json imports with the same rows and curves', async () => {
    const prep = await importAsProject(frozen('export-v5.json'));
    expect(prep.version).toBe(5);
    expect(prep.store.seqs.flatMap(s => s.structures.map(m => m.name))).toEqual(['test.pdb']);
    const { svc } = await reopen(await vaultFixture('formats/schema-2-vault'));
    expect(runTags(prep.store.seqs)).toEqual(runTags(svc.store.seqs));
    expect(curvesOf(prep.store.seqs)).toEqual(curvesOf(svc.store.seqs));
  });
});

// Third frozen set (batch 3, F-0): made once with the code at 3de24e2, never regenerated.
const looksOf = (seqs: { extras: { type: string; curves: { vis?: string; shade?: number }[] }[] }[]) =>
  seqs.flatMap(s => s.extras).flatMap(e => e.curves.map((c, j) => [e.type, j, c.vis, c.shade]).filter(r => r[2] || r[3]));

describe('frozen batch-3 fixtures (schema 3, export v6)', () => {
  it('the schema-3 vault opens with its runs, curve looks, page, notes and reference', async () => {
    const { vault, svc } = await reopen(await vaultFixture('formats/schema-3-vault'));
    expect(vault.manifest.schemaVersion).toBe(SCHEMA_VERSION);
    const s = svc.store;
    expect(runTags(s.seqs)).toEqual([
      ['KRWYCR', 'ha', 'a', ['prosecco75']],
      ['KRWYCR', 'pg', 'a', []],
      ['WRWYCR', 'ha', 'a', ['add', 'hmr']],
      ['WRWYCR', 'ha', 'b', ['fast', 'long']],
      ['WRWYCR', 'pg', 'a', []],
    ]);
    expect(curvesOf(s.seqs)).toEqual([['dist', 1, []], ['hist', 21, []], ['rdf', 2, ['second sugar']]]);
    expect(looksOf(s.seqs)).toEqual([['rdf', 0, undefined, 2], ['hist', 0, undefined, -1], ['hist', 3, 'off', undefined], ['hist', 5, 'dim', undefined]]);
    expect(Object.values(s.vis).sort()).toEqual(['dim', 'off']);
    expect(s.pages.map(p => [p.name, p.rows.length, p.cols])).toEqual([['Favourites', 2, ['ha', 'pg']]]);
    expect(Object.values(s.lit).flat().map(r => r.title)).toEqual(['A frozen reference']);
    expect(Object.keys(s.notes.cell)).toHaveLength(1);
    expect(s.seqs.find(q => q.name === 'KRWYCR')!.runs.find(r => r.sacch === 'pg')!.x[0]).toBe(-7.479);
    expect([s.settings?.rowAll, s.settings?.hiddenOut, s.settings?.analyses?.find(a => a.k === 'hist')?.smooth]).toEqual([true, true, 2]);
  });
  it('export-v6.json imports with the same rows, curves and looks', async () => {
    const prep = await importAsProject(frozen('export-v6.json'));
    expect(prep.version).toBe(6);
    const { svc } = await reopen(await vaultFixture('formats/schema-3-vault'));
    expect(runTags(prep.store.seqs)).toEqual(runTags(svc.store.seqs));
    expect(curvesOf(prep.store.seqs)).toEqual(curvesOf(svc.store.seqs));
    expect(looksOf(prep.store.seqs)).toEqual(looksOf(svc.store.seqs));
    expect(prep.store.pages.map(p => p.name)).toEqual(['Favourites']);
  });
});
