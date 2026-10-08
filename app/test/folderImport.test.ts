import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import * as lib from '../src/lib/seq';
import { filesFromEntries, filesFromInput, mapLimit, type EntryLike } from '../src/lib/folderFiles';
import { parseGmxHeader } from '../src/lib/gmxHeader';
import { sha256Hex } from '../src/lib/storage/json';

/** A directory tree as FileSystemEntry look-alikes; readEntries hands out batches of 2, like Chrome's batches of 100. */
function dir(name: string, kids: Record<string, string | object>, base = ''): EntryLike {
  const fullPath = base + '/' + name;
  const children = Object.entries(kids).map(([n, v]) => (typeof v === 'string' ? file(n, v, fullPath) : dir(n, v as Record<string, string>, fullPath)));
  return {
    isFile: false, isDirectory: true, name, fullPath,
    createReader: () => { let i = 0; return { readEntries: (ok: (e: EntryLike[]) => void) => setTimeout(() => { ok(children.slice(i, i + 2)); i += 2; }) }; },
  };
}
function file(name: string, body: string | Uint8Array, base = ''): EntryLike {
  return { isFile: true, isDirectory: false, name, fullPath: base + '/' + name, file: (ok: (f: File) => void) => ok(new File([body as BlobPart], name)) };
}
/** A real folder from test/fixtures as entries (one readEntries batch, then empty). */
function diskDir(rel: string, base = ''): EntryLike {
  const name = rel.split('/').pop()!, fullPath = base + '/' + name, at = new URL('./fixtures/' + rel + '/', import.meta.url);
  const kids = readdirSync(at, { withFileTypes: true }).map(e =>
    e.isDirectory() ? diskDir(rel + '/' + e.name, fullPath) : file(e.name, new Uint8Array(readFileSync(new URL(e.name, at))), fullPath));
  return { isFile: false, isDirectory: true, name, fullPath, createReader: () => { let done = false; return { readEntries: (ok: (e: EntryLike[]) => void) => { ok(done ? [] : kids); done = true; } }; } };
}

describe('folder walking (R1d)', () => {
  it('walks every level and keeps calling readEntries until it returns nothing', async () => {
    const tree = dir('run', { 'a.xvg': '1 2', sub: { 'b.xvg': '1 2', 'c.dat': '1 2', 'd.txt': '1 2', deeper: { 'e.xvg': '1 2' } } });
    const r = await filesFromEntries([tree]);
    expect(r.files.map(f => f.path)).toEqual(['run/a.xvg', 'run/sub/b.xvg', 'run/sub/c.dat', 'run/sub/d.txt', 'run/sub/deeper/e.xvg']);
  });
  it('lists other files as skipped and ignores OS clutter silently (F9)', async () => {
    const tree = dir('run', { 'a.xvg': '1 2', '.DS_Store': 'x', 'Thumbs.db': 'x', 'notes.pdf': 'x', '.git': { HEAD: 'x' }, sub: { 'desktop.ini': 'x', 'conf.mdp': 'x' } });
    const r = await filesFromEntries([tree]);
    expect([r.files.map(f => f.path), r.skipped]).toEqual([['run/a.xvg'], ['run/notes.pdf', 'run/sub/conf.mdp']]);
  });
  it('loose files dropped next to a folder keep their own name as the path', async () => {
    const r = await filesFromEntries([file('loose.xvg', '1 2'), dir('d', { 'x.xvg': '1 2' })]);
    expect(r.files.map(f => f.path)).toEqual(['d/x.xvg', 'loose.xvg']);
  });
  it('the folder picker uses webkitRelativePath', () => {
    const mk = (path: string) => Object.assign(new File(['1 2'], path.split('/').pop()!), { webkitRelativePath: path });
    const r = filesFromInput([mk('top/a/b.xvg'), mk('top/.DS_Store'), mk('top/a/readme.md')]);
    expect([r.files.map(f => f.path), r.skipped]).toEqual([['top/a/b.xvg'], ['top/a/readme.md']]);
  });
  it('mapLimit keeps the order and never runs more than n at once', async () => {
    let running = 0, peak = 0;
    const seen: number[] = [];
    const out = await mapLimit([5, 1, 4, 2, 3, 0, 6], 3, async v => {
      peak = Math.max(peak, ++running);
      await new Promise(r => setTimeout(r, v));
      running--;
      return v * 10;
    }, done => seen.push(done));
    expect(out).toEqual([50, 10, 40, 20, 30, 0, 60]);
    expect(peak).toBe(3);
    expect(seen.at(-1)).toBe(7);
  });
});

describe('the cluster folder fixture, planned like the dialog does', () => {
  it('gives the expected rows, columns, slots and skip list', async () => {
    const picked = await filesFromEntries([diskDir('cluster/hmr+fast+6')]);
    expect(picked.skipped).toEqual(['hmr+fast+6/ha/WRWYCR/notes.pdf']);
    const st = lib.mergeSettings({}, { pathPattern: '{method}/{column}/{seq}/{*}/{run}' });
    const files: lib.UploadFile[] = await Promise.all(picked.files.map(async (p, i) => {
      const bytes = new Uint8Array(await p.file.arrayBuffer()), t = lib.parseTable(new TextDecoder().decode(bytes));
      return { id: 'f' + i, file: p.file.name, path: p.path, table: t, head: t.head, gmx: parseGmxHeader(new TextDecoder().decode(bytes)), sha256: await sha256Hex(bytes), parsed: lib.parseName(p.file.name, st.pattern) };
    }));
    const form: lib.UploadForm = { files, name: '', seq: '', group: '', desc: '', time: '', temp: '310.15', col: 'o26', run: 'auto', parse: true, tags: [], msg: '', err: false, ana: 'auto', onClash: 'replace' };
    const plan = lib.planBatch(lib.emptyStore(), form, lib.getAnalyses(st), st);
    expect(plan.map(p => [p.path, p.ok, p.name, p.group, p.col.k, p.run, p.ana.k, p.sameAs || ''])).toEqual([
      ['hmr+fast+6/ha/WRWYCR/9.multiwalker/1/07.md_rdf_protein_sugar.xvg', true, 'WRWYCR', 'hmr+fast+6', 'ha', 'a', 'rdf', ''],
      ['hmr+fast+6/ha/WRWYCR/9.multiwalker/1/awh_t200000.xvg', true, 'WRWYCR', 'hmr+fast+6', 'ha', 'a', 'pmf', ''],
      ['hmr+fast+6/pg/WRWYCR/9.multiwalker/1/awh_t200000.xvg', false, 'WRWYCR', 'hmr+fast+6', 'pg', 'a', 'pmf', 'Identical to awh_t200000.xvg in this upload'],
    ]);
    expect(plan[1].from).toEqual({ group: 'path', col: 'path', seq: 'path', run: 'path' });
  });
});

describe('size target (F11): 3,000 files plan within budget', () => {
  it('plans 3,000 PMF files, and re-plans after a form edit', () => {
    const table = lib.parseTable(new TextDecoder().decode(readFileSync(new URL('./fixtures/hmrfast6_ha_a_t200000.xvg', import.meta.url))));
    const st = lib.mergeSettings({}, { pathPattern: '{method}/{column}/{seq}/{*}/{run}' });
    const files: lib.UploadFile[] = Array.from({ length: 3000 }, (_, i) => {
      const path = `hmr+fast+6/${['ha', 'pg', 'o26'][i % 3]}/P${Math.floor(i / 30)}/9.multiwalker/${(Math.floor(i / 3) % 10) + 1}/awh_t200000.xvg`;
      return { id: 'f' + i, file: 'awh_t200000.xvg', path, table, head: table.head, sha256: 's' + i, parsed: lib.parseName('awh_t200000.xvg', st.pattern) };
    });
    const form: lib.UploadForm = { files, name: '', seq: '', group: '', desc: '', time: '', temp: '310.15', col: 'o26', run: 'auto', parse: true, tags: [], msg: '', err: false, ana: 'auto', onClash: 'replace' };
    const types = lib.getAnalyses(st);
    let t0 = performance.now();
    const plan = lib.planBatch(lib.emptyStore(), form, types, st);
    const first = performance.now() - t0;
    expect(plan.filter(p => p.ok)).toHaveLength(3000);
    t0 = performance.now();
    lib.planBatch(lib.emptyStore(), { ...form, temp: '300' }, types, st);
    const again = performance.now() - t0;
    // About 0.1 s each in Node; generous bounds so a slow CI machine doesn't fail.
    expect(first).toBeLessThan(3000);
    expect(again).toBeLessThan(3000);
  });
});
