import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { sha256Hex } from '../src/lib/storage/json';
import type { MemoryBackend } from '../src/lib/storage/backend/memory';
import type { ProjectService } from '../src/lib/storage/project';
import type { Store, Table } from '../src/lib/types';
import { reopen, vaultFixture } from './helpers';

// R7: change an analysis's type, including PMF run ↔ analysis (F104), with a preview of exactly what the save does.
const PID = 'pmv3ncwehsvzci';
async function open() {
  const b = await vaultFixture('formats/schema-3-vault');
  const { svc } = await reopen(b);
  for (const e of svc.store.seqs.flatMap(s => s.extras)) await svc.loadAnalysis(e.id);
  return { b, svc };
}
/** The parsed originals of the files a run or analysis reads (what the dialog reads once). */
async function tables(svc: ProjectService, fileIds: string[]) {
  const m = new Map<string, Table | null>();
  for (const id of fileIds) m.set(id, lib.parseTable(await (await svc.readUpload(id)).text()));
  return m;
}
async function originals(b: MemoryBackend) {
  const out: Record<string, string> = {};
  const walk = async (dir: string): Promise<void> => { for (const e of await b.list(dir)) { const p = dir ? dir + '/' + e.name : e.name; if (e.kind === 'dir') { if (!p.startsWith('.matrix')) await walk(p); } else out[e.name] = (out[e.name] || '') + (await sha256Hex(await b.readBytes(p))); } };
  await walk('');
  return out;
}
const row = (s: Store, name: string) => s.seqs.find(q => q.name === name)!;
const opts = (_s: Store, o: Partial<lib.RetypeOptions> = {}): lib.RetypeOptions => ({ onClash: 'replace', metric: 'area', skip: null, ...o });
const st = (s: Store) => lib.mergeSettings({}, s.settings);
const filesOf = (s: Store, rowName: string, kind: 'run' | 'analysis', id: string) => {
  const q = row(s, rowName);
  return kind === 'run' ? [q.runs.find(r => r.id === id)!.src!.fileId] : [...new Set(q.extras.find(e => e.id === id)!.curves.map(c => c.src!.fileId))];
};

describe('retype (R7)', () => {
  it('within analyses: same id, curves re-read with the new type’s columns, folder follows, originals untouched', async () => {
    const { b, svc } = await open(), before = await originals(b);
    const q = row(svc.store, 'WRWYCR'), rdf = q.extras.find(e => e.type === 'rdf')!;
    const res = lib.retype(svc.store, st(svc.store), q.id, { kind: 'analysis', id: rdf.id }, 'density', await tables(svc, filesOf(svc.store, 'WRWYCR', 'analysis', rdf.id)), opts(svc.store));
    expect(res.preview.problem).toBeUndefined();
    expect(res.preview.changes[0]).toBe('RDF → Density · HA × WRWYCR run 1');
    const e = row(res.store, 'WRWYCR').extras.find(x => x.id === rdf.id)!;
    // Re-read curves keep their ID, your legend and their looks, matched by file and position.
    expect([e.type, e.typeFrom, e.curves.length, res.preview.curves.map(c => c.label)]).toEqual(['density', 'changed', 2, ['Protein', 'second sugar']]);
    expect([e.curves.map(c => c.id), e.curves[0].shade, e.curves[1].custom, res.preview.lost]).toEqual([rdf.curves.map(c => c.id), 2, true, []]);
    svc.commit(res.store); await svc.flush();
    const rec = JSON.parse(await b.readText('.matrix/records/' + PID + '/rows/' + q.id + '.json'));
    expect(rec.analyses.find((a: { id: string }) => a.id === rdf.id).dir).toMatch(/\/density-run-1--/);
    expect(await originals(b)).toEqual(before);
    expect(await b.list('.matrix/journal')).toEqual([]);
  });

  it('a PMF run becomes an analysis and back; values go and come back bit for bit; file kinds follow', async () => {
    const { b, svc } = await open();
    const kr = row(svc.store, 'KRWYCR'), run = kr.runs.find(r => r.sacch === 'pg')!, v0 = lib.cellValue(kr, 'pg', 'area', null, lib.ENTROPY);
    const a = lib.retype(svc.store, st(svc.store), kr.id, { kind: 'run', id: run.id }, 'free-energy', await tables(svc, [run.src!.fileId]), opts(svc.store));
    expect(a.preview.values).toEqual([{ label: 'PG × KRWYCR · Area', before: v0, after: null }]);
    expect(a.preview.lost).toEqual([]);
    svc.commit(a.store); await svc.flush();
    const ex = row(svc.store, 'KRWYCR').extras.find(e => e.type === 'free-energy')!;
    const meta = svc.fileMeta(run.src!.fileId)!;
    expect([meta.kind, ex.typeFrom, row(svc.store, 'KRWYCR').runs.some(r => r.sacch === 'pg')]).toEqual(['analysis-xvg', 'changed', false]);
    const back = lib.retype(svc.store, st(svc.store), kr.id, { kind: 'analysis', id: ex.id }, 'pmf', await tables(svc, [run.src!.fileId]), opts(svc.store, { temp: 310.15 }));
    expect(back.preview.values).toEqual([{ label: 'PG × KRWYCR · Area', before: null, after: v0 }]);
    svc.commit(back.store); await svc.flush();
    expect([svc.fileMeta(run.src!.fileId)!.kind, lib.cellValue(row(svc.store, 'KRWYCR'), 'pg', 'area', null, lib.ENTROPY)]).toEqual(['pmf-xvg', v0]);
    expect(await b.list('.matrix/journal')).toEqual([]);
  });

  it('clashes: replace sends the old one to the trash; add as curves joins them; a PMF slot can only be replaced', async () => {
    const { svc } = await open();
    const wr = row(svc.store, 'WRWYCR'), run = wr.runs.find(r => r.sacch === 'ha' && r.run === 'a')!, t = await tables(svc, [run.src!.fileId]);
    const rep = lib.retype(svc.store, st(svc.store), wr.id, { kind: 'run', id: run.id }, 'rdf', t, opts(svc.store));
    expect(rep.preview.changes).toContain('replaces RDF · HA × WRWYCR run 1 (2 curves) — it goes to the trash');
    expect(row(rep.store, 'WRWYCR').extras.filter(e => e.type === 'rdf').map(e => e.curves.length)).toEqual([1]);
    const add = lib.retype(svc.store, st(svc.store), wr.id, { kind: 'run', id: run.id }, 'rdf', t, opts(svc.store, { onClash: 'append' }));
    expect(add.preview.changes).toContain('adds 1 curve to RDF · HA × WRWYCR run 1');
    expect(row(add.store, 'WRWYCR').extras.filter(e => e.type === 'rdf').map(e => e.curves.length)).toEqual([3]);
    const kr = row(svc.store, 'KRWYCR'), dist = kr.extras.find(e => e.type === 'dist')!;
    const pmf = lib.retype(svc.store, st(svc.store), kr.id, { kind: 'analysis', id: dist.id }, 'pmf', await tables(svc, filesOf(svc.store, 'KRWYCR', 'analysis', dist.id)), opts(svc.store, { onClash: 'append', temp: 300 }));
    expect(pmf.preview.changes).toContain('replaces PMF · HA × KRWYCR run 1 — it goes to the trash');
  });

  // Review fix (F137): a mark is about the data, so it moves with it when the data becomes a run or a curve.
  it('a mark follows its curve into a PMF run and back, and the preview loses nothing', async () => {
    const { svc } = await open();
    const kr = row(svc.store, 'KRWYCR'), dist = kr.extras.find(e => e.type === 'dist')!, c = dist.curves[0];
    const marked = lib.addMark(svc.store, kr.id, c.id, c.x[3]!);
    const toPmf = lib.retype(marked, st(marked), kr.id, { kind: 'analysis', id: dist.id }, 'pmf', await tables(svc, [c.src!.fileId]), opts(marked, { temp: 300 }));
    const r1 = row(toPmf.store, 'KRWYCR'), made = r1.runs.find(r => r.typeFrom === 'changed')!;
    expect([r1.marks, toPmf.preview.lost]).toEqual([[{ curve: made.id, x: c.x[3] }], []]);
    const back = lib.retype(toPmf.store, st(toPmf.store), kr.id, { kind: 'run', id: made.id }, 'dist', await tables(svc, [made.src!.fileId]), opts(toPmf.store));
    const r2 = row(back.store, 'KRWYCR'), curve = r2.extras.find(e => e.type === 'dist' && e.curves.some(q => q.src?.fileId === made.src!.fileId))!.curves[0];
    expect([r2.marks, back.preview.lost]).toEqual([[{ curve: curve.id, x: c.x[3] }], []]);
  });

  it('the preview of the save is exactly what the save does', async () => {
    const { b, svc } = await open();
    const wr = row(svc.store, 'WRWYCR'), run = wr.runs.find(r => r.sacch === 'ha' && r.run === 'a')!;
    const res = lib.retype(svc.store, st(svc.store), wr.id, { kind: 'run', id: run.id }, 'rdf', await tables(svc, [run.src!.fileId]), opts(svc.store));
    const plan = await svc.previewPlan(res.store);
    expect(plan.trashed).toEqual(['Run 1 of WRWYCR × HA', 'rdf analysis of WRWYCR']);
    svc.commit(res.store); await svc.flush();
    const meta = svc.fileMeta(run.src!.fileId)!;
    expect(plan.moves.map(m => m.to)).toContain(meta.path);
    expect((await svc.listTrash()).filter(t => t.manifest?.type !== 'schema-backup').map(t => t.manifest?.label).sort()).toEqual([...plan.trashed].sort());
    for (const m of plan.moves) expect(await b.stat(m.to)).not.toBeNull();
  });

  it('says what it can’t do, and keeps curves whose original is missing', async () => {
    const { svc } = await open();
    const wr = row(svc.store, 'WRWYCR'), rdf = wr.extras.find(e => e.type === 'rdf')!;
    expect(lib.retype(svc.store, st(svc.store), wr.id, { kind: 'analysis', id: rdf.id }, 'pmf', new Map(), opts(svc.store, { temp: 300 })).preview.problem).toBe('An analysis with 2 curves can’t become a PMF run: only one curve can.');
    expect(lib.retype(svc.store, st(svc.store), wr.id, { kind: 'analysis', id: rdf.id }, 'rdf', new Map(), opts(svc.store)).preview.problem).toBe('It is already RDF.');
    const kept = lib.retype(svc.store, st(svc.store), wr.id, { kind: 'analysis', id: rdf.id }, 'data', new Map(), opts(svc.store));
    expect([kept.preview.kept, row(kept.store, 'WRWYCR').extras.find(e => e.id === rdf.id)!.curves.map(c => c.label)]).toEqual([['07.md_rdf_protein_sugar.xvg', 'rdf_copy.xvg'], ['Protein', 'second sugar']]);
  });

  it('restoring the old run from the trash refuses: its file now belongs to the analysis', async () => {
    const { svc } = await open();
    const kr = row(svc.store, 'KRWYCR'), run = kr.runs.find(r => r.sacch === 'pg')!;
    svc.commit(lib.retype(svc.store, st(svc.store), kr.id, { kind: 'run', id: run.id }, 'free-energy', await tables(svc, [run.src!.fileId]), opts(svc.store)).store); await svc.flush();
    const item = (await svc.listTrash()).find(t => t.manifest?.type === 'run')!;
    const res = await svc.restore(item);
    expect(res.where).toBe('fallback');
    expect([row(svc.store, 'KRWYCR').runs.some(r => r.sacch === 'pg'), svc.fileMeta(run.src!.fileId)!.kind]).toEqual([false, 'analysis-xvg']);
  });
});
