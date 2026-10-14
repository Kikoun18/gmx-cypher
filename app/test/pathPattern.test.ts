import { describe, expect, it } from 'vitest';
import * as lib from '../src/lib/seq';
import { parseGmxHeader } from '../src/lib/gmxHeader';
import { fixture, newVault, reopen, sugarStore, text, vaultFixture } from './helpers';

const CLUSTER = '{method}/{column}/{seq}/{*}/{run}';

describe('parsePath: the folder part against the path pattern (R1c)', () => {
  it.each([
    // folder path, pattern, expected fields (null = no match)
    ['hmr+fast+6/ha/WRWYCR/9.multiwalker/1', CLUSTER, { group: 'hmr+fast+6', col: 'ha', seq: 'WRWYCR', run: 'a' }],
    // implicit leading **/: the end of an absolute path matches
    ['/mnt/storage/shared/walkers_for_denys/hmr+fast+6/ha/WRWYCR/9.multiwalker/1', CLUSTER, { group: 'hmr+fast+6', col: 'ha', seq: 'WRWYCR', run: 'a' }],
    ['hmr+fast+6\\ha\\WRWYCR\\9.multiwalker\\2', CLUSTER, { group: 'hmr+fast+6', col: 'ha', seq: 'WRWYCR', run: 'b' }],
    // ** = zero, one or several folders
    ['ha/3', '{column}/**/{run}', { col: 'ha', run: 'c' }],
    ['ha/x/3', '{column}/**/{run}', { col: 'ha', run: 'c' }],
    ['ha/x/y/3', '{column}/**/{run}', { col: 'ha', run: 'c' }],
    ['g/ha/a/b', '{method}/{column}/**', { group: 'g', col: 'ha' }],
    // {*} is ignored; tokens can share a segment but never cross "/"
    ['x/ha', '{column}', { col: 'ha' }],
    ['/mnt/kucerak/solutions/tArg+O127/simulations/07_md', '{seq}+{column}/simulations/{*}', { seq: 'tArg', col: 'O127' }],
    ['Sims/HA', 'sims/{column}', { col: 'HA' }],
    ['ha', '{method}/{column}', null],
    ['a/b', 'sims/{column}', null],
    ['a/b', '', null],
  ])('%s with %s', (dir, pattern, want) => {
    const r = lib.parsePath(dir, pattern);
    expect(r.matched ? r.fields : null).toEqual(want);
  });
  it('an unreadable {run} is reported, not read as run 1 (F5)', () => {
    expect(lib.parsePath('ha/9.multiwalker', '{column}/{run}')).toEqual({ matched: true, fields: { col: 'ha' }, bad: { run: '9.multiwalker' } });
  });
});

describe('parseName: unchanged, except for an unreadable {run} (F5)', () => {
  it.each([
    ['hmrfast6_ha_WRWYCR_t200000.xvg', lib.DEFAULT_PATTERN, { group: 'hmrfast6', col: 'ha', seq: 'WRWYCR', time: '200000' }],
    ['HMRFAST6_HA_WRWYCR_T200000.XVG', lib.DEFAULT_PATTERN, { group: 'HMRFAST6', col: 'HA', seq: 'WRWYCR', time: '200000' }],
    ['rdf_WRWYCR_3.xvg', '{analysis}_{name}_{run}.xvg', { ana: 'rdf', name: 'WRWYCR', run: 'c' }],
    ['WRWYCR_b.dat', '{name}_{run}.xvg', { name: 'WRWYCR', run: 'b' }],
    ['WRWYCR_10.xvg', '{name}_{run}.xvg', { name: 'WRWYCR', run: 'j' }],
    ['a_b_c.xvg', '{name}_{*}.xvg', { name: 'a' }],
  ])('%s with %s', (file, pattern, fields) => {
    expect(lib.parseName(file, pattern)).toEqual({ matched: true, fields });
  });
  it('no match', () => expect(lib.parseName('plain.xvg', lib.DEFAULT_PATTERN)).toEqual({ matched: false, fields: {} }));
  it.each(['9.multiwalker', '11', 'zz', '0'])('run %s is unreadable', run => {
    expect(lib.parseName('WRWYCR_' + run + '.xvg', '{name}_{run}.xvg')).toEqual({ matched: true, fields: { name: 'WRWYCR' }, bad: { run } });
  });
});

describe('mergeFields: name, path and header combined', () => {
  const P = (fields: lib.ParsedName['fields'], bad?: lib.ParsedName['bad']): lib.ParsedName => ({ matched: true, fields, ...(bad ? { bad } : {}) });
  it('fields from different sources combine, each with its source', () => {
    expect(lib.mergeFields([['name', P({ time: '200000' })], ['path', P({ col: 'ha', seq: 'WRWYCR' })]])).toEqual({
      fields: { time: '200000', col: 'ha', seq: 'WRWYCR' }, from: { time: 'name', col: 'path', seq: 'path' }, conflicts: [],
    });
  });
  it('the same value after normalisation agrees (ha vs HA)', () => {
    expect(lib.mergeFields([['name', P({ col: 'ha', seq: 'wrwycr' })], ['path', P({ col: 'HA', seq: 'WRWYCR' })]]).conflicts).toEqual([]);
  });
  it('a disagreement is a conflict, and neither value wins silently', () => {
    const m = lib.mergeFields([['name', P({ col: 'pg' })], ['path', P({ col: 'ha' })]]);
    expect(m.conflicts).toEqual(['column: pg (name) ≠ ha (path)']);
  });
  it('a custom normaliser decides agreement (e.g. column label vs key)', () => {
    const norm = (k: string, v: string) => (k === 'col' && v.toLowerCase() === 'hyaluronan' ? 'ha' : v.trim().toLowerCase());
    expect(lib.mergeFields([['name', P({ col: 'Hyaluronan' })], ['path', P({ col: 'ha' })]], norm).conflicts).toEqual([]);
  });
  it('an unreadable run is a conflict', () => {
    expect(lib.mergeFields([['path', P({ col: 'ha' }, { run: '9.multiwalker' })]]).conflicts).toEqual(['run: 9.multiwalker (path) is not a run number 1–10']);
  });
  it('unmatched sources add nothing', () => {
    expect(lib.mergeFields([['name', { matched: false, fields: {} }], ['path', undefined]])).toEqual({ fields: {}, from: {}, conflicts: [] });
  });
});

describe('planBatch with a path pattern', () => {
  const AWH = 'hmrfast6_ha_a_t200000.xvg';
  const table = lib.parseTable(text(fixture(AWH)));
  const st = lib.mergeSettings({}, { pathPattern: CLUSTER });
  const types = lib.getAnalyses(st);
  const form = (files: Partial<lib.UploadFile>[], parse = true): lib.UploadForm => ({
    files: files.map((f, i) => ({ id: 'f' + i, file: 'awh_t200000.xvg', table, head: table.head, ...f, parsed: lib.parseName(f.file || 'awh_t200000.xvg', st.pattern) })),
    name: 'FORM', seq: '', group: '', desc: '', time: '', temp: '300', col: 'pg', run: 'auto', parse, tags: [], msg: '', err: false, ana: 'auto', onClash: 'replace',
  });
  it('the folder gives the row, column and slot; the plan says where each came from', () => {
    const [p] = lib.planBatch(sugarStore(), form([{ path: 'hmr+fast+6/ha/WRWYCR/9.multiwalker/2/awh_t200000.xvg' }]), types, st);
    expect([p.ok, p.name, p.group, p.col.k, p.run, p.path]).toEqual([true, 'WRWYCR', 'hmr+fast+6', 'ha', 'b', 'hmr+fast+6/ha/WRWYCR/9.multiwalker/2/awh_t200000.xvg']);
    expect(p.from).toEqual({ group: 'path', col: 'path', seq: 'path', run: 'path' });
  });
  it('without a folder, the header working directory is used, marked "header" (F6)', () => {
    const gmx = parseGmxHeader(text(fixture(AWH)));
    const [p] = lib.planBatch(sugarStore(), form([{ gmx }]), types, lib.mergeSettings({}, { pathPattern: '{method}/{column}/{seq}/{*}/{run}' }));
    // Working dir: …/walkers_for_denys/hmr+fast+6/ha/a/9.multiwalker/1
    expect([p.group, p.col.k, p.name, p.run]).toEqual(['hmr+fast+6', 'ha', 'a', 'a']);
    expect(p.from).toEqual({ group: 'header', col: 'header', seq: 'header', run: 'header' });
  });
  it('a folder wins over the header: the header is only a fallback', () => {
    const gmx = parseGmxHeader(text(fixture(AWH)));
    const [p] = lib.planBatch(sugarStore(), form([{ gmx, path: 'g/pg/KRWYCR/x/3/awh.xvg', file: 'awh.xvg' }]), types, st);
    expect([p.col.k, p.name, p.run, p.from.col]).toEqual(['pg', 'KRWYCR', 'c', 'path']);
  });
  it('a conflict between path and name is shown and the file is not uploaded', () => {
    const f = form([{ path: 'hmrfast6/ha/WRWYCR/x/1/hmrfast6_pg_WRWYCR_t200000.xvg', file: 'hmrfast6_pg_WRWYCR_t200000.xvg' }]);
    const [p] = lib.planBatch(sugarStore(), f, types, st);
    expect([p.ok, p.conflicts]).toEqual([false, ['column: pg (name) ≠ ha (path)']]);
  });
  it('an unreadable run in the path is a conflict, not run 1', () => {
    const s2 = lib.mergeSettings({}, { pathPattern: '{column}/{run}' });
    const [p] = lib.planBatch(sugarStore(), form([{ path: 'ha/9.multiwalker/awh.xvg', file: 'awh.xvg' }]), types, s2);
    expect([p.ok, p.conflicts]).toEqual([false, ['run: 9.multiwalker (path) is not a run number 1–10']]);
  });
  it('"same for all" reads neither the name nor the path', () => {
    const [p] = lib.planBatch(sugarStore(), form([{ path: 'hmr+fast+6/ha/WRWYCR/x/2/awh.xvg', file: 'awh.xvg' }], false), types, st);
    expect([p.name, p.col.k, p.from]).toEqual(['FORM', 'pg', {}]);
  });
  it('no path pattern: nothing changes', () => {
    const [p] = lib.planBatch(sugarStore(), form([{ path: 'hmr+fast+6/ha/WRWYCR/x/2/awh.xvg', file: 'awh.xvg' }]), types, lib.mergeSettings({}, {}));
    expect([p.name, p.col.k, p.conflicts]).toEqual(['FORM', 'pg', []]);
  });
});

describe('pathPattern setting (F30: additive, no schema bump)', () => {
  it('is saved with the project and survives reopening', async () => {
    const { b, svc } = await newVault();
    svc.commit({ ...svc.store, settings: { ...svc.store.settings, pathPattern: CLUSTER } });
    await svc.flush();
    const again = await reopen(b);
    expect(lib.mergeSettings({}, again.svc.store.settings).pathPattern).toBe(CLUSTER);
  });
  it('a vault written before it existed reads as off', async () => {
    const { svc } = await reopen(await vaultFixture('formats/schema-1-vault'));
    expect(svc.store.settings?.pathPattern).toBeUndefined();
    expect(lib.mergeSettings({}, svc.store.settings).pathPattern).toBe('');
  });
});

describe('review fixes: the header only fills (F6)', () => {
  it('a header that disagrees with the file name is not a conflict; the name wins', () => {
    const P = (fields: lib.ParsedName['fields'], bad?: lib.ParsedName['bad']): lib.ParsedName => ({ matched: true, fields, ...(bad ? { bad } : {}) });
    expect(lib.mergeFields([['name', P({ group: 'hmrfast6', col: 'ha' })], ['header', P({ group: 'hmr+fast+6', seq: 'a' }, { run: '9.multiwalker' })]])).toEqual({
      fields: { group: 'hmrfast6', col: 'ha', seq: 'a' }, from: { group: 'name', col: 'name', seq: 'header' }, conflicts: [],
    });
  });
  it('the real fixture picked alone, with the documented folder pattern, uploads', () => {
    const AWH = 'hmrfast6_ha_a_t200000.xvg', st = lib.mergeSettings({}, { pathPattern: CLUSTER });
    const table = lib.parseTable(text(fixture(AWH)));
    const form: lib.UploadForm = { files: [{ id: 'f1', file: AWH, table, head: table.head, gmx: parseGmxHeader(text(fixture(AWH))), parsed: lib.parseName(AWH, st.pattern) }],
      name: '', seq: '', group: '', desc: '', time: '', temp: '300', col: 'pg', run: 'auto', parse: true, tags: [], msg: '', err: false, ana: 'auto', onClash: 'replace' };
    const [p] = lib.planBatch(sugarStore(), form, lib.getAnalyses(st), st);
    expect([p.ok, p.group, p.from.group, p.from.run]).toEqual([true, 'hmrfast6', 'name', 'header']);
  });
});
