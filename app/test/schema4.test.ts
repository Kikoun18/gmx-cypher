import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { MemoryBackend } from '../src/lib/storage/backend/memory';
import { VaultIO } from '../src/lib/storage/io';
import { MIGRATIONS } from '../src/lib/storage/manifest';
import { SCHEMA_VERSION } from '../src/lib/storage/records';
import { Vault } from '../src/lib/storage/vault';
import { EXPORT_VERSION, exportDataset, importAsProject, importInto } from '../src/lib/storage/exchange';
import type { Store } from '../src/lib/types';
import * as lib from '../src/lib/seq';
import { fixture, reopen, text, vaultFixture } from './helpers';

// Batch 3, F-1: one on-disk step for the batch (Phase 0 §7): schema 4, export v7. Fields only; features follow.
const FROZEN = 'formats/schema-3-vault', PID = 'pmv3ncwehsvzci', WR = 'smv3ncwdcs8nwt';
const ROW = '.matrix/records/' + PID + '/rows/' + WR + '.json';

async function files(b: MemoryBackend) {
  const out: Record<string, string> = {};
  const walk = async (dir: string): Promise<void> => {
    for (const e of await b.list(dir)) { const p = dir + '/' + e.name; if (e.kind === 'dir') await walk(p); else out[p] = await b.readText(p); }
  };
  for (const d of ['.matrix/records', '.matrix/settings']) if (await b.stat(d)) await walk(d);
  return out;
}

/** The frozen store with one of every new field set (and a few bad values that must be cleaned away). */
function withFields(s: Store): Store {
  const seqs = s.seqs.map(q => (q.id !== WR ? q : {
    ...q,
    runs: q.runs.map((r, i) => (i === 0 ? { ...r, dash: 3, typeFrom: 'header' as const } : i === 1 ? { ...r, dash: 12 as number, typeFrom: 'guess' as never } : r)),
    extras: q.extras.map(e => (e.type !== 'rdf' ? e : { ...e, typeFrom: 'changed' as const, curves: e.curves.map((c, i) => (i ? { ...c, dash: 0 } : { ...c, dash: 7 })) })),
    marks: [{ curve: q.extras[0].curves[0].id, x: 0.47 }, { curve: 'c-bad', x: NaN }],
    lines: { 'ha|rdf': [{ axis: 'y' as const, v: 1 }, { axis: 'z' as never, v: 2 }], '*|pmf': [{ axis: 'x' as const, v: 1.2 }] },
  }));
  return {
    ...s, seqs, pages: s.pages.map(p => ({ ...p, metric: 'mean-temperature' })),
    settings: { ...s.settings, metric: 'area', metrics: [{ id: 'mean-temperature', label: 'Mean T', type: 'temperature', fn: { kind: 'builtin', name: 'mean' }, agg: 'mean', unit: 'K', scale: { kind: 'minmax' } }] },
  };
}
const picked = (s: Store) => {
  const q = s.seqs.find(x => x.id === WR)!, rdf = q.extras.find(e => e.type === 'rdf')!;
  return { runs: q.runs.map(r => [r.dash ?? null, r.typeFrom ?? null]), rdf: [rdf.typeFrom ?? null, rdf.curves.map(c => c.dash ?? null)], marks: q.marks, lines: q.lines, page: s.pages[0].metric, metric: s.settings?.metric, metrics: s.settings?.metrics?.map(m => m.id) };
};
const WANT = {
  runs: [[3, 'header'], [null, null], [null, null]], rdf: ['changed', [7, 0]],
  marks: [{ curve: expect.any(String), x: 0.47 }], lines: { 'ha|rdf': [{ axis: 'y', v: 1 }], '*|pmf': [{ axis: 'x', v: 1.2 }] },
  page: 'mean-temperature', metric: 'area', metrics: ['mean-temperature'],
};

describe('schema 3 → 4 (F-1)', () => {
  it('versions moved together', () => expect([SCHEMA_VERSION, EXPORT_VERSION]).toEqual([4, 7]));

  it('upgrades the frozen schema-3 vault without changing a record, with a backup', async () => {
    const b = await vaultFixture(FROZEN), before = await files(b);
    const v = await Vault.open(b);
    expect([v.upgradedFrom, v.manifest.schemaVersion]).toEqual([3, 4]);
    expect(await files(b)).toEqual(before);
    expect((await v.listTrash()).map(t => t.manifest?.type)).toEqual(['schema-backup']);
  });

  it('the step changes nothing and is safe to run again', async () => {
    const step = MIGRATIONS.find(m => m.from === 3)!;
    expect(step.to).toBe(4);
    const b = await vaultFixture(FROZEN);
    expect(await step.run(new VaultIO(b))).toEqual([]);
    await Vault.open(b);
    expect(await step.run(new VaultIO(b))).toEqual([]);
  });

  it('every new field survives close → reopen; bad values are cleaned on write', async () => {
    const b = await vaultFixture(FROZEN);
    const { svc } = await reopen(b);
    svc.commit(withFields(svc.store));
    await svc.flush();
    const again = (await reopen(b)).svc.store;
    expect(picked(again)).toEqual(WANT);
    const rec = JSON.parse(await b.readText(ROW));
    expect([rec.runs[1].dash, rec.runs[1].typeFrom, rec.marks.length, rec.lines['ha|rdf'].length]).toEqual([undefined, undefined, 1, 1]);
    expect(JSON.parse(await b.readText('.matrix/settings/' + PID + '/metrics.json')).metrics[0].id).toBe('mean-temperature');
  });

  it('a project without metrics writes no metrics.json, and settings.json keeps only what is set', async () => {
    const b = await vaultFixture(FROZEN);
    const { svc } = await reopen(b);
    svc.commit({ ...svc.store, notes: { ...svc.store.notes, row: { ...svc.store.notes.row, [WR]: 'touched' } } });
    await svc.flush();
    expect(await b.stat('.matrix/settings/' + PID + '/metrics.json')).toBeNull();
    expect(Object.keys(JSON.parse(await b.readText('.matrix/settings/' + PID + '/settings.json')))).not.toContain('metric');
  });

  it('the project record keeps its scripts list through other edits', async () => {
    const b = await vaultFixture(FROZEN);
    await Vault.open(b);
    const p = '.matrix/records/' + PID + '/project.json', rec = JSON.parse(await b.readText(p));
    const scripts = [{ id: 'kfns', file: { id: 'ffns', kind: 'script', name: 'functions.py', path: 'sugar-pmfs--' + PID + '/_scripts/functions.py', size: 977, sha256: 'x', uploaded: '2026-10-11', mime: 'text/x-python', owner: PID, origin: 'upload' }, fns: { calc_mean: { role: 'metric', unit: 'nm' } } }];
    await b.writeText(p, JSON.stringify({ ...rec, scripts }));
    const { svc } = await reopen(b);
    svc.commit({ ...svc.store, notes: { ...svc.store.notes, row: { ...svc.store.notes.row, [WR]: 'touched' } } });
    await svc.flush();
    expect(JSON.parse(await b.readText(p)).scripts).toEqual(scripts);
  });

  it('export v7 → import keeps every new field', async () => {
    const { svc } = await reopen(await vaultFixture(FROZEN));
    const s = withFields(svc.store);
    const { text } = await exportDataset(s, { project: 'P', settings: s.settings!, src: { read: f => svc.readUpload(f), meta: f => svc.fileMeta(f) } });
    expect(JSON.parse(text).version).toBe(7);
    expect(picked((await importAsProject(text)).store)).toEqual(WANT);
  });

  // Review fix (F137): importing into the project that already has the row merges its marks and lines, as it merges runs.
  it('export v7 → import into a project with the same rows keeps the file’s marks and lines', async () => {
    const { svc } = await reopen(await vaultFixture(FROZEN));
    const s = withFields(svc.store);
    const { text } = await exportDataset(s, { project: 'P', settings: s.settings!, src: { read: f => svc.readUpload(f), meta: f => svc.fileMeta(f) } });
    // The file's marks and lines as exported (its bad values cleaned away, WANT), joined to the row's own line.
    const local = lib.addLine(svc.store, WR, 'ha|pmf', 'y', -2), merged = (await importInto(text, local)).store.seqs.find(q => q.id === WR)!;
    expect(merged.marks).toEqual(WANT.marks);
    expect(merged.lines).toEqual({ 'ha|pmf': [{ axis: 'y', v: -2 }], ...WANT.lines });
    // Importing the same file again adds nothing twice.
    const twice = (await importInto(text, (await importInto(text, local)).store)).store.seqs.find(q => q.id === WR)!;
    expect([twice.marks, twice.lines]).toEqual([merged.marks, merged.lines]);
  });

  it.each(['export-v6.json', 'export-v5.json', 'export-v4.json', 'export-v3.json'])('%s still imports, with none of the new fields', async name => {
    const prep = await importAsProject(readFileSync(new URL('./fixtures/formats/' + name, import.meta.url), 'utf8'));
    expect(prep.store.seqs.flatMap(s => s.runs).length).toBeGreaterThan(3);
    expect(prep.store.seqs.some(s => s.marks || s.lines || s.runs.some(r => r.dash != null || r.typeFrom))).toBe(false);
  });
});

describe('uploads keep where their type came from (F114, F-1)', () => {
  it('header, file-name words, no match, the form and the name pattern', async () => {
    const st = lib.mergeSettings({}, {}), types = lib.getAnalyses({});
    const file = (id: string, name: string, from: string) => { const t = lib.parseTable(text(fixture(from))); return { id, file: name, table: t, head: t.head }; };
    const form = (files: ReturnType<typeof file>[], o: Partial<lib.UploadForm> = {}): lib.UploadForm => ({ ...lib.blankUploadForm(st, lib.getCols(null)), name: 'P', parse: false, ...o, files });
    const plan = (f: lib.UploadForm) => lib.addBatch(lib.emptyStore(), f, lib.planBatch(lib.emptyStore(), f, types, st)).store;
    const a = plan(form([file('f1', 'x.xvg', 'gmx/07.md_rdf_protein_sugar.xvg'), file('f2', 'translocation_free_energy.dat', 'examples/translocation_free_energy.dat'), file('f3', 'plain.dat', 'examples/membrane_thickness.dat')]));
    expect(a.seqs.flatMap(q => q.extras).map(e => [e.type, e.typeFrom]).sort()).toEqual([['data', 'generic'], ['free-energy', 'header'], ['rdf', 'header']]);
    const b = plan(form([file('f1', 'total_energy.xvg', 'examples/membrane_thickness.dat')]));
    expect(b.seqs[0].extras[0].typeFrom).toBe('name');
    const c = plan(form([file('f1', 'x.xvg', 'hmrfast6_ha_a_t200000.xvg')], { ana: 'pmf' }));
    expect(c.seqs[0].runs[0].typeFrom).toBe('form');
    const d = plan(form([{ ...file('f1', 'rdf_WRWYCR.xvg', 'hmrfast6_ha_a_t200000.xvg'), parsed: lib.parseName('rdf_WRWYCR.xvg', '{analysis}_{name}.xvg') } as ReturnType<typeof file>], { parse: true }));
    expect(d.seqs[0].extras[0].typeFrom).toBe('pattern');
  });
});
