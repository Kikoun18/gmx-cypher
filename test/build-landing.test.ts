// Where a built system's PMFs would land in the connected project (R8b), with the Matrix's own code: the spec's
// section-4 probes as a table (parsePath, parseName), then each system's AWH folder and walker folders through
// planBatch (a gmx awh file whose `# Working dir:` is the folder, named by the project's pattern), with every
// problem said in words.
import { beforeAll, describe, expect, it } from 'vitest';
import { NodeBackend } from '../../matrix/scripts/node-backend';
import { addColumn, parseName, parsePath } from '../../matrix/src/lib/seq';
import type { Store } from '../../matrix/src/lib/types';
import { fixture, newVault, withPmf } from '../../matrix/test/helpers';
import { awhXvg, sendName, systemLanding } from '../src/lib/build/landing';
import { landing } from '../src/lib/landing';
import { DEFAULT_PLAN, systemsOf, type BuildPlan } from '../src/lib/build/plan';
import { listProjects, openVault, readProject } from '../server/vault';
import { apiServer, tmp } from './helpers';

const FOLDERS = '{method}/{column}/{seq}/9.multiwalker/{run}', README = '{method}/{column}/{seq}/{*}/{run}';

describe('the section-4 probes, with the Matrix\'s parsePath and parseName', () => {
  it.each([
    [FOLDERS, 'solutions/hmr+fast+6/o111/aaaaaaaa/9.multiwalker/3', { matched: true, fields: { group: 'hmr+fast+6', col: 'o111', seq: 'aaaaaaaa', run: 'c' } }],
    [FOLDERS, 'solutions/hmr+fast+6/o111/aaaaaaaa/7.awh', { matched: false, fields: {} }],
    [FOLDERS, 'solutions/hmr+fast+6r1/HA/WRWYCR/9.multiwalker/8', { matched: true, fields: { group: 'hmr+fast+6r1', col: 'HA', seq: 'WRWYCR', run: 'h' } }],
    [FOLDERS, 'solutions/hmr+fast+6/o111/aaaaaaaa/9.multiwalker/10', { matched: true, fields: { group: 'hmr+fast+6', col: 'o111', seq: 'aaaaaaaa', run: 'j' } }],
    [FOLDERS, 'solutions/hmr+fast+6/o111/aaaaaaaa/9.multiwalker/11', { matched: true, fields: { group: 'hmr+fast+6', col: 'o111', seq: 'aaaaaaaa' }, bad: { run: '11' } }],
    [README, 'solutions/hmr+fast+6/o111/aaaaaaaa/7.awh', { matched: true, fields: { group: 'solutions', col: 'hmr+fast+6', seq: 'o111' }, bad: { run: '7.awh' } }],
  ])('folder pattern %s on %s', (pattern, path, out) => {
    expect(parsePath(path, pattern)).toEqual(out);
  });
  it.each([
    ['hmr+fast+6_o111_aaaaaaaa_awh_t2e+06.xvg', { matched: true, fields: { group: 'hmr+fast+6', col: 'o111', seq: 'aaaaaaaa_awh', time: '2e+06' } }],
    ['awh_t200000.xvg', { matched: false, fields: {} }],
    ['7_t2e+06.xvg', { matched: false, fields: {} }],
    ['hmr+fast+6_o111_aaaaaaaa_t200000.xvg', { matched: true, fields: { group: 'hmr+fast+6', col: 'o111', seq: 'aaaaaaaa', time: '200000' } }],
  ])('the default name pattern on %s', (name, out) => {
    expect(parseName(name, '{method}_{column}_{seq}_t{time}.xvg')).toEqual(out);
  });
});

// A project made by the Matrix itself (columns O26, PG, HA as a new vault has them, and O111): row AAAAAAAA in
// hmr+fast+6 with runs 1 and 2 in O111, row HA (sequence WRWYCR) in hmr+fast+6 with a run in HA only; read back by
// gmx-cypher's reader.
let store: Store;
const named = (s: Store, name: string, seq: string, col?: string): Store => ({ ...s, seqs: s.seqs.map(q => (q.name === name ? { ...q, seq, runs: q.runs.map(r => ({ ...r, sacch: col ?? r.sacch })) } : q)) });
beforeAll(async () => {
  const dir = tmp('vault'), { svc, vault } = await newVault(new NodeBackend(dir));
  const c = addColumn(svc.store, 'O111', 'o111');
  const pmf = (s: Store, name: string, slot: 'a' | 'b') => withPmf(s, { name, col: c.col.k, slot, file: 'pmf-' + name + slot + '.xvg', bytes: fixture('hmrfast6_ha_a_t200000.xvg'), group: 'hmr+fast+6' });
  const a = pmf(c.store, 'AAAAAAAA', 'a'), b = pmf(a.store, 'AAAAAAAA', 'b'), h = pmf(b.store, 'HA', 'a');
  svc.commit(named(h.store, 'HA', 'WRWYCR', 'ha'), new Map([...a.uploads, ...b.uploads, ...h.uploads]));
  await svc.flush();
  await vault.close();
  const v = await openVault(dir);
  store = (await readProject(v, (await listProjects(v))[0].id)).store;
});
const using = (s: object): Store => ({ ...store, settings: { ...store.settings, ...s } });
const WALKERS: BuildPlan = { ...DEFAULT_PLAN, stages: DEFAULT_PLAN.stages.map(s => (s.id === 'walkers' ? { ...s, on: true } : s)) };
const sys = (seq: string, method = 'hmr+fast+6', sac = 'o111') => systemsOf({ methods: [method], saccharides: [sac], sequences: [seq], repeats: 0 })[0];
const BASE = '/storage/brno/you/02_evomd/innit_tests';

describe('the file a send would make', () => {
  it('a gmx awh file whose working folder is the system\'s, read by the Matrix as a PMF', () => {
    const l = landing(using({ pattern: 'x.xvg', pathPattern: FOLDERS }), 'awh_t200000.xvg', awhXvg(BASE + '/solutions/hmr+fast+6/o111/aaaaaaaa/9.multiwalker/3'));
    expect(l).toMatchObject({ ok: true, row: 'aaaaaaaa', group: 'hmr+fast+6', col: { k: 'o111' }, run: 3, type: { k: 'pmf', how: 'header' } });
  });
  it('named by the project\'s pattern: the row\'s name, the column\'s label, the run, the time left to the send', () => {
    expect(sendName('{method}_{column}_{seq}_t{time}.xvg', { group: 'hmr+fast+6', col: 'O111', name: 'HA', seq: 'WRWYCR', run: 3, temp: '310.15' })).toBe('hmr+fast+6_O111_WRWYCR_t{time}.xvg');
    expect(sendName('{name}_{column}_{run}_{*}', { group: 'g', col: 'O111', name: 'HA', seq: 'WRWYCR', run: 3, temp: '310.15' })).toBe('HA_O111_3_pmf.xvg');
    expect(sendName('{method}_{temp}K_{analysis}.dat', { group: 'g', col: 'c', name: 'n', seq: 's', run: 0, temp: '300' })).toBe('g_300K_pmf.dat');
  });
});

describe('where each folder lands', () => {
  it('no run in either pattern: each folder takes the next free run after the ones before it (review finding 2)', () => {
    const r = systemLanding(store, WALKERS, sys('aaaaaaaa'), BASE);
    expect(r.map(f => f.run)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 1]);
    expect(r.slice(0, 8).every(f => !f.problems.length && !f.replaces)).toBe(true);
    expect(r[8]).toMatchObject({ replaces: true, problems: ['the cell has 10 runs already: a send replaces run 1'] });
  });
  it('rows of one sequence, one named by it: that row, as the Matrix picks it (review finding 7)', () => {
    const ha = store.seqs.find(q => q.name === 'HA')!, two = { ...store, seqs: [...store.seqs, { ...ha, id: 'w', name: 'WRWYCR', runs: [] }] };
    expect(systemLanding(two, DEFAULT_PLAN, sys('wrwycr'), BASE)[0]).toMatchObject({ row: 'WRWYCR', rowNew: false, run: 1, problems: [] });
  });
  it('the default name pattern: the AWH folder takes the cell\'s next free run, each walker its own', () => {
    const r = systemLanding(using({ pathPattern: FOLDERS }), WALKERS, sys('aaaaaaaa'), BASE);
    expect(r.map(f => [f.folder, f.name, f.row, f.col, f.run, f.problems])).toEqual([
      ['solutions/hmr+fast+6/o111/aaaaaaaa/7.awh', 'hmr+fast+6_O111_AAAAAAAA_t{time}.xvg', 'AAAAAAAA', 'O111', 3, []],
      ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => ['solutions/hmr+fast+6/o111/aaaaaaaa/9.multiwalker/' + n, 'hmr+fast+6_O111_AAAAAAAA_t{time}.xvg', 'AAAAAAAA', 'O111', n,
        n === 3 ? ['run 3 is also 7.awh\'s: one PMF would replace the other'] : []]),
    ]);
    expect(r.every(f => !f.rowNew && !f.colNew)).toBe(true);
    // Walkers 1 and 2 land on the project's runs 1 and 2: said, as the Matrix's plan says it.
    expect(r.map(f => f.replaces)).toEqual([false, true, true, false, false, false, false, false, false]);
  });
  it('only the stages in the build: no walkers, only the AWH folder; neither, nothing', () => {
    expect(systemLanding(store, DEFAULT_PLAN, sys('aaaaaaaa'), BASE).map(f => f.what)).toEqual(['awh']);
    expect(systemLanding(store, { ...DEFAULT_PLAN, stages: DEFAULT_PLAN.stages.map(s => ({ ...s, on: s.id === 'sb' })) }, sys('aaaaaaaa'), BASE)).toEqual([]);
  });
  it('a row the project doesn\'t have, and a column it doesn\'t have, start new ones: said, not a problem', () => {
    const [f] = systemLanding(store, DEFAULT_PLAN, sys('gggggggg', 'hmr+fast+6', 'xyl'), BASE);
    expect(f).toMatchObject({ row: 'GGGGGGGG', rowNew: true, col: 'XYL', colNew: true, run: 1, problems: [] });
  });
  it('a row named apart from its sequence: a second row, unless the name says the row (question 37)', () => {
    const [f] = systemLanding(store, DEFAULT_PLAN, sys('wrwycr'), BASE);
    expect(f.problems).toEqual(['a new row WRWYCR: the project\'s row for WRWYCR in hmr+fast+6 is HA · add {name} to the name pattern beside {seq}, or rename the row to its sequence']);
    const [g] = systemLanding(using({ pattern: '{method}_{column}_{name}_{seq}_t{time}.xvg' }), DEFAULT_PLAN, sys('wrwycr'), BASE);
    expect(g).toMatchObject({ row: 'HA', rowNew: false, problems: [] });
  });
  it('the README\'s {*} pattern with 7.awh: the folder reads as another group, column and run', () => {
    const [f] = systemLanding(using({ pattern: 'pmf.xvg', pathPattern: README }), DEFAULT_PLAN, sys('aaaaaaaa'), BASE);
    expect(f.problems).toEqual([
      'the folder pattern reads 7.awh as the {run}, not a run number 1–10',
      'group solutions, not hmr+fast+6',
      'sequence O111, not AAAAAAAA',
      'column hmr+fast+6, not O111',
    ]);
  });
  it('no match: a folder pattern that reads nothing here, and a name that gives no row', () => {
    const [f] = systemLanding(using({ pattern: 'pmf.xvg', pathPattern: '{method}/{column}/{seq}/awh/{run}' }), DEFAULT_PLAN, sys('aaaaaaaa'), BASE);
    expect(f.problems).toEqual([
      'the folder pattern {method}/{column}/{seq}/awh/{run} does not match solutions/hmr+fast+6/o111/aaaaaaaa/7.awh',
      'no row: neither the file name nor the folder gave a sequence or name',
    ]);
  });
  it('a walker past the tenth: no run 1–10, said by the Matrix', () => {
    const plan: BuildPlan = { ...WALKERS, science: { ...WALKERS.science, walkers: Array.from({ length: 11 }, (_, i) => 1 + i / 10) } };
    const r = systemLanding(using({ pattern: '{method}_{column}_{seq}_{run}.xvg' }), plan, sys('aaaaaaaa'), BASE);
    expect(r[10].problems).toEqual([]);
    // The Matrix refuses run 11, and its next free run is walker 1's by then.
    expect(r[11].problems).toEqual(['run 1 is also walker 1\'s: one PMF would replace the other', 'run: 11 (name) is not a run number 1–10']);
  });
  it('a full cell: the AWH folder has no free run', () => {
    const full = { ...store, seqs: store.seqs.map(q => (q.name === 'AAAAAAAA' ? { ...q, runs: 'abcdefghij'.split('').map(run => ({ ...q.runs[0], run: run as 'a' })) } : q)) };
    expect(systemLanding(full, DEFAULT_PLAN, sys('aaaaaaaa'), BASE)[0].problems).toContain('the cell has 10 runs already: a send replaces run 1');
  });
});

describe('POST /api/build/landing', () => {
  it('each system\'s folders against the connected project; 409 with none', async () => {
    const s = await apiServer();
    const body = { plan: DEFAULT_PLAN, systems: { methods: ['hmr+fast+6'], saccharides: ['o111'], sequences: ['aaaaaaaa', 'wrwycr'], repeats: 0 } };
    expect((await s.call('/api/build/landing', body)).status).toBe(409);
    const dir = tmp('vault'), { svc, vault } = await newVault(new NodeBackend(dir));
    const c = addColumn(svc.store, 'O111', 'o111');
    const a = withPmf(c.store, { name: 'HA', col: c.col.k, file: 'p.xvg', bytes: fixture('hmrfast6_ha_a_t200000.xvg'), group: 'hmr+fast+6' });
    svc.commit(named(a.store, 'HA', 'WRWYCR'), a.uploads);
    await svc.flush();
    await vault.close();
    await s.call('/api/config', { vault: dir });
    const project = (await s.call('/api/vault')).json.projects[0].id;
    await s.call('/api/config', { project });
    const r = await s.call('/api/build/landing', body);
    expect(r.status).toBe(200);
    expect(Object.keys(r.json.systems)).toEqual(['solutions/hmr+fast+6/o111/aaaaaaaa', 'solutions/hmr+fast+6/o111/wrwycr']);
    expect(r.json.systems['solutions/hmr+fast+6/o111/aaaaaaaa'][0]).toMatchObject({ what: 'awh', row: 'AAAAAAAA', rowNew: true, col: 'O111', run: 1, problems: [] });
    expect(r.json.systems['solutions/hmr+fast+6/o111/wrwycr'][0].problems[0]).toMatch(/^a new row WRWYCR: the project's row for WRWYCR in hmr\+fast\+6 is HA/);
    expect(r.json.project).toEqual({ name: expect.any(String), pattern: '{method}_{column}_{seq}_t{time}.xvg', pathPattern: '' });
    expect((await s.call('/api/build/landing', { ...body, systems: { ...body.systems, methods: ['../x'] } })).status).toBe(400);
    await s.close();
  });
});
