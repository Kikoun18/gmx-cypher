import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { NodeBackend } from '../../app/scripts/node-backend';
import { addColumn, DEFAULT_ANALYSES } from '../../app/src/lib/seq';
import type { Store } from '../../app/src/lib/types';
import { fixture, newVault, withPmf } from '../../app/test/helpers';
import { landing, mismatch, nameFromPattern, typeSource } from '../src/lib/landing';
import { listProjects, openVault, readProject } from '../server/vault';
import { tmp } from './helpers';

// The real 2025.4 result, with the working directory of a run in the user's layout.
const text = readFileSync(new URL('./fixtures/gmx-2025.4/rdf_nvt.xvg', import.meta.url), 'utf8')
  .replace(/^# Working dir:.*$/m, '# Working dir:  /home/user/sim/hmr+fast+6/so4/NA2SO4/9.multiwalker/2');
let store: Store;

beforeAll(async () => {
  // A project made by PMF Sequences itself, with row NA2SO4 and column SO4, read back by gmx-cypher's reader.
  const dir = tmp('vault'), { svc, vault } = await newVault(new NodeBackend(dir));
  const c = addColumn(svc.store, 'SO4', 'sulfate');
  const a = withPmf(c.store, { name: 'NA2SO4', col: c.col.k, file: 'pmf.xvg', bytes: fixture('hmrfast6_ha_a_t200000.xvg'), group: 'hmr+fast+6' });
  svc.commit(a.store, a.uploads);
  await svc.flush();
  await vault.close();
  const v = await openVault(dir);
  store = (await readProject(v, (await listProjects(v))[0].id)).store;
});

const using = (s: object) => ({ ...store, settings: { ...store.settings, ...s } });
const FOLDERS = '{method}/{column}/{name}/{*}/{run}';

describe("where PMF Sequences will put a result: its own planBatch (T33)", () => {
  it('folder pattern only: every field from the header\'s working directory', () => {
    // PMF Sequences matches a row by group, name and sequence: no sequence here, so a second NA2SO4 row (found by attaching it with PMF Sequences' code).
    expect(landing(using({ pathPattern: FOLDERS }), 'rdf_nvt.xvg', text)).toEqual({
      ok: true, row: 'NA2SO4', seq: '', rowNew: true, twin: { seq: 'NA2SO4', group: 'hmr+fast+6' }, group: 'hmr+fast+6', col: { k: 'so4', label: 'SO4', isNew: false }, run: 2,
      type: { k: 'rdf', label: 'RDF', how: 'header' }, curves: { imported: ['water_O'], inFile: ['water_O', 'sodium'] },
      from: { group: 'header', col: 'header', name: 'header', run: 'header' }, replaces: false, problems: [],
    });
  });

  it('file pattern only: every field from the name', () => {
    expect(landing(using({ pattern: '{method}_{column}_{name}_{run}.xvg' }), 'hmr+fast+6_so4_NA2SO4_3.xvg', text))
      .toMatchObject({ ok: true, row: 'NA2SO4', col: { k: 'so4' }, run: 3, from: { group: 'name', col: 'name', name: 'name', run: 'name' } });
  });

  it('both: the name gives its fields, the header only fills the rest', () => {
    expect(landing(using({ pathPattern: FOLDERS, pattern: '{name}_{column}.xvg' }), 'KRWYCR_ha.xvg', text))
      .toMatchObject({ ok: true, row: 'KRWYCR', rowNew: true, col: { k: 'ha' }, group: 'hmr+fast+6', run: 2, from: { name: 'name', col: 'name', group: 'header', run: 'header' } });
  });

  it('neither: no row, not ready, said in words', () => {
    expect(landing(store, 'rdf_nvt.xvg', text)).toMatchObject({ ok: false, row: '', problems: ['no row: neither the file name nor the folder gave a sequence or name'] });
  });

  it('two selections: the default RDF reads y column 2 only; with y columns "all", both', () => {
    expect(landing(using({ pathPattern: FOLDERS }), 'x.xvg', text).curves).toEqual({ imported: ['water_O'], inFile: ['water_O', 'sodium'] });
    const all = DEFAULT_ANALYSES.map(a => (a.k === 'rdf' ? { ...a, yCols: 'all' } : a));
    expect(landing(using({ pathPattern: FOLDERS, analyses: all }), 'x.xvg', text).curves.imported).toEqual(['water_O', 'sodium']);
  });

  it('a mismatch with what was chosen, in words', () => {
    const l = landing(using({ pathPattern: FOLDERS }), 'rdf_nvt.xvg', text);
    expect(mismatch(l, { name: 'NA2SO4', col: 'SO4', group: 'hmr+fast+6', run: 2, time: '' })).toEqual([]);
    expect(mismatch(l, { name: 'Na2SO4', col: 'so4', group: '', run: 3, time: '' })).toEqual(['run 2, not 3']);
    expect(mismatch(landing(store, 'rdf_nvt.xvg', text), { name: 'NA2SO4', col: 'SO4', group: '', run: 1, time: '' })).toEqual(['row (none), not NA2SO4', 'column O26, not SO4']);
  });
});

describe("the file name from the project's pattern (T34)", () => {
  const f = { name: 'NA2SO4', col: 'SO4', group: 'hmr+fast+6', run: 1, time: '20', ana: 'rdf' };
  it('fills every token it can, and reads back to the same place', () => {
    const { name, missing } = nameFromPattern('{method}_{column}_{seq}_t{time}.xvg', f);
    expect([name, missing]).toEqual(['hmr+fast+6_SO4_NA2SO4_t20.xvg', []]);
    expect(landing(using({ pattern: '{method}_{column}_{seq}_t{time}.xvg' }), name, text)).toMatchObject({ ok: true, row: 'NA2SO4', seq: 'NA2SO4', rowNew: false, col: { k: 'so4' }, run: 1 });
  });
  it('lists the tokens without a value; {*} and a missing extension are filled', () => {
    expect(nameFromPattern('{method}_{column}_{seq}_t{time}', { ...f, time: '' })).toEqual({ name: 'hmr+fast+6_SO4_NA2SO4_t{time}.xvg', missing: ['{time}'] });
    expect(nameFromPattern('{*}_{name}_{run}.dat', f).name).toBe('rdf_NA2SO4_1.dat');
  });
});

describe('POST /api/landing', () => {
  it('prefills from the folder pattern, names the file by the project pattern, and previews that name', async () => {
    const { mkdirSync, copyFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { apiServer, RUNNER } = await import('./helpers');
    const { startRun } = await import('../server/runs');
    // The vault: the project's patterns as a user might set them.
    const vdir = tmp('vault'), { svc, vault } = await newVault(new NodeBackend(vdir));
    const c = addColumn(svc.store, 'SO4', 'sulfate');
    svc.commit({ ...c.store, settings: { ...c.store.settings, pathPattern: FOLDERS, pattern: '{method}_{column}_{seq}_t{time}.xvg' } });
    await svc.flush();
    await vault.close();
    // A run in a folder laid out like the user's.
    const root = tmp('sim'), dir = join(root, 'hmr+fast+6/so4/NA2SO4/9.multiwalker/1');
    mkdirSync(dir, { recursive: true });
    for (const f of ['nvt.tpr', 'nvt.gro', 'nvt.xtc']) copyFileSync(RUNNER + 'test/fixtures/nvt/' + f, join(dir, f));
    const s = await apiServer();
    await s.call('/api/config', { allow: [root], vault: vdir });
    const steps = (k: 'name' | 'resname', value: string) => [{ op: 'add' as const, rule: { kind: k, value } }];
    const { job, record } = await startRun(s.ctx, { inputs: { trajectory: join(dir, 'nvt.xtc'), runInput: join(dir, 'nvt.tpr'), structure: join(dir, 'nvt.gro') }, options: {},
      groups: [{ role: 'reference', name: 'sulfur', tone: 'coral', steps: steps('name', 'S1') }, { role: 'selection', name: 'sodium', tone: 'sky', steps: steps('resname', 'Na') }] }, [root]);
    await record;
    const project = (await s.call('/api/vault')).json.projects[0].id;
    const r = await s.call('/api/landing', { job: job.id, project });
    expect(r.json).toMatchObject({
      fields: { name: 'NA2SO4', col: 'SO4', group: 'hmr+fast+6', run: 1, time: '10' },
      from: { name: 'header', col: 'header', group: 'header', run: 'header' },
      name: 'hmr+fast+6_SO4_NA2SO4_t10.xvg', missing: [],
      preview: { ok: true, row: 'NA2SO4', rowNew: true, col: { k: 'so4' }, run: 1, type: { k: 'rdf' } }, reasons: [],
      pattern: '{method}_{column}_{seq}_t{time}.xvg',
    });
    const typed = await s.call('/api/landing', { job: job.id, project, fields: { name: 'NA2SO4', col: 'SO4', group: 'hmr+fast+6', run: 3, time: '10' }, name: 'nvt.xvg' });
    expect(typed.json).toMatchObject({ name: 'nvt.xvg', preview: { run: 1 }, reasons: ['run 1, not 3'] });
    await s.close();
  });
});

describe('a file PMF Sequences has no type for (batch 3: filed as general Data, not refused)', () => {
  // gmx mindist's contacts: titled "Number of Contacts < 0.6 nm", which no PMF Sequences type recognises.
  const contacts = readFileSync(new URL('./fixtures/r9/mindist/mindist_nvt_numcont.xvg', import.meta.url), 'utf8')
    .replace(/^# Working dir:.*$/m, '# Working dir:  /home/user/sim/hmr+fast+6/so4/NA2SO4/9.multiwalker/2');

  it('lands as Data from "no known type", with no problem to block it', () => {
    const l = landing(using({ pathPattern: FOLDERS }), 'mindist_nvt_contacts.xvg', contacts);
    expect(l).toMatchObject({ ok: true, row: 'NA2SO4', type: { k: 'data', how: 'generic' }, problems: [] });
  });

  it('where a type came from, in words', () => {
    expect(['file', 'form', 'header', 'name', 'generic', 'other'].map(typeSource)).toEqual([
      'from the name pattern', 'as chosen', 'from the header', 'from words in the file name', 'no known type: filed as general data', 'other',
    ]);
  });
});
