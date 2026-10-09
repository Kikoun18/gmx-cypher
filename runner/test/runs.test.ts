import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { recordProblems } from '../src/lib/record';
import type { Group } from '../src/lib/groups';
import { startRun, type RunRequest } from '../server/runs';
import { apiServer, RUNNER, tmp } from './helpers';

const REAL = !!process.env.GMX;
const groups: Group[] = [
  { role: 'reference', name: 'sulfur', tone: 'coral', steps: [{ op: 'add', rule: { kind: 'name', value: 'S1' } }] },
  { role: 'selection', name: 'water_O', tone: 'sky', steps: [{ op: 'add', rule: { kind: 'name', value: 'OW1', resn: 'SOL' } }] },
  { role: 'selection', name: 'sodium', tone: 'mint', steps: [{ op: 'add', rule: { kind: 'resname', value: 'Na' } }] },
];

async function setup() {
  const dir = tmp('nvt');
  for (const f of ['nvt.tpr', 'nvt.gro', 'nvt.xtc']) copyFileSync(RUNNER + 'test/fixtures/nvt/' + f, join(dir, f));
  const s = await apiServer(REAL ? { gmx: { ok: true, name: 'gmx', path: process.env.GMX, version: '2025.4' } } : { gmx: { ok: true, name: 'gmx', path: RUNNER + 'test/fake-gmx.mjs', version: '2025.4-PLUMED_spack' } });
  const req: RunRequest = { inputs: { trajectory: join(dir, 'nvt.xtc'), runInput: join(dir, 'nvt.tpr'), structure: join(dir, 'nvt.gro') }, groups, options: { cn: true } };
  return { dir, s, req, roots: [dir] };
}

afterEach(() => { delete process.env.FAKE_GMX_TOUCH; });

describe('a run writes four new files under one stem' + (REAL ? ' (a real gmx)' : ' (the fake gmx)'), () => {
  it('rdf/rdf_nvt.xvg, _cn.xvg, .ndx and .run.json; the record is complete', async () => {
    const { dir, s, req, roots } = await setup();
    const { job, record } = await startRun(s.ctx, req, roots);
    expect(job.cwd).toBe(dir);
    expect(job.meta?.estimate).toEqual({ frames: 21, start: 0, end: 20 });
    expect(job.args).toEqual(['rdf', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'rdf/rdf_nvt.ndx', '-o', 'rdf/rdf_nvt.xvg', '-cn', 'rdf/rdf_nvt_cn.xvg', '-ref', 'group 0', '-sel', 'group 1', 'group 2']);
    const r = await record;
    expect(readdirSync(join(dir, 'rdf')).sort()).toEqual(['rdf_nvt.ndx', 'rdf_nvt.run.json', 'rdf_nvt.xvg', 'rdf_nvt_cn.xvg']);
    expect(recordProblems(JSON.parse(readFileSync(join(dir, 'rdf/rdf_nvt.run.json'), 'utf8')))).toEqual([]);
    expect(r).toMatchObject({ status: 'done', frames: { analysed: REAL ? 21 : 11 }, problems: [] });
    expect(r.groups.map(g => [g.name, g.atoms, g.count, g.gmxCount])).toEqual([['sulfur', '5-30:5', 6, 6], ['water_O', '43-3239:4', 800, 800], ['sodium', '31-42', 12, 12]]);
    expect(r.outputs.map(o => o.kind)).toEqual(['xvg', 'cn', 'ndx']);
    expect(r.outputs[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.inputs.trajectory).not.toHaveProperty('sha256');
    expect(r.inputs.runInput!.sha256).toMatch(/^[0-9a-f]{64}$/);
    await s.close();
  });

  it('an existing name leads to a new stem, and the existing file is untouched', async () => {
    const { dir, s, req, roots } = await setup();
    mkdirSync(join(dir, 'rdf'));
    writeFileSync(join(dir, 'rdf/RDF_NVT.ndx'), 'mine\n');
    const { job, record } = await startRun(s.ctx, req, roots);
    expect(job.args).toContain('rdf/rdf_nvt (2).xvg');
    await record;
    expect(readFileSync(join(dir, 'rdf/RDF_NVT.ndx'), 'utf8')).toBe('mine\n');
    expect(existsSync(join(dir, 'rdf/rdf_nvt (2).run.json'))).toBe(true);
    await s.close();
  });

  it('refuses before starting: options gmx would refuse, a group without atoms, a name gmx would cut', async () => {
    const { s, req, roots } = await setup();
    await expect(startRun(s.ctx, { ...req, options: { excl: true, seltype: 'mol_com' } }, roots)).rejects.toThrow('-excl needs atom positions');
    await expect(startRun(s.ctx, { ...req, groups: [groups[0], { ...groups[1], steps: [] }] }, roots)).rejects.toThrow('water_O has no atoms');
    await expect(startRun(s.ctx, { ...req, groups: [groups[0], { ...groups[1], name: 'water O' }] }, roots)).rejects.toThrow('water O: no spaces');
    expect(s.ctx.jobs.list()).toEqual([]);
    await s.close();
  });
});

describe.skipIf(REAL)('nothing is overwritten, even when files appear meanwhile (the fake gmx makes them appear)', () => {
  it('a file appearing while the groups are checked stops the run: nothing started, nothing written', async () => {
    const { dir, s, req, roots } = await setup();
    mkdirSync(join(dir, 'rdf'));
    process.env.FAKE_GMX_TOUCH = 'select=' + join(dir, 'rdf/rdf_nvt_cn.xvg');
    await expect(startRun(s.ctx, req, roots)).rejects.toThrow('rdf_nvt_cn.xvg appeared in ' + join(dir, 'rdf') + ' while checking; nothing was started');
    expect(readdirSync(join(dir, 'rdf'))).toEqual(['rdf_nvt_cn.xvg']);
    expect(s.ctx.jobs.list()).toEqual([]);
    await s.close();
  });

  it('a file appearing during the run, backed up by gmx, is recorded as a problem', async () => {
    const { dir, s, req, roots } = await setup();
    process.env.FAKE_GMX_TOUCH = 'rdf=' + join(dir, 'rdf/rdf_nvt.xvg');
    const r = await (await startRun(s.ctx, req, roots)).record;
    expect(r.problems).toEqual(['gmx backed up a file that appeared during the run: #rdf_nvt.xvg.1#']);
    expect(readFileSync(join(dir, 'rdf/#rdf_nvt.xvg.1#'), 'utf8')).toContain('appeared while gmx rdf ran');
    await s.close();
  });

  it('uploaded inputs write to the workspace in the state folder', async () => {
    const { s } = await setup();
    const up = join(s.ctx.home, 'uploads', 'u1');
    mkdirSync(up, { recursive: true });
    for (const f of ['nvt.tpr', 'nvt.gro', 'nvt.xtc']) copyFileSync(RUNNER + 'test/fixtures/nvt/' + f, join(up, f));
    const req = { inputs: { trajectory: join(up, 'nvt.xtc'), runInput: join(up, 'nvt.tpr'), structure: join(up, 'nvt.gro') }, groups, options: {} };
    const { job, record } = await startRun(s.ctx, req, [join(s.ctx.home, 'uploads')]);
    expect(job.args).toContain('../../workspace/rdf_nvt.xvg');
    await record;
    expect(readdirSync(join(s.ctx.home, 'workspace')).sort()).toEqual(['rdf_nvt.ndx', 'rdf_nvt.run.json', 'rdf_nvt.xvg']);
    await s.close();
  });
});

describe('runs over HTTP', () => {
  it('plans (free names, the exact argv), starts, and serves the record once the run ended', async () => {
    const { dir, s, req } = await setup();
    await s.call('/api/config', { allow: [dir] });
    const plan = await s.call('/api/plan', req);
    expect(plan.json).toMatchObject({ cwd: dir, outDir: join(dir, 'rdf'), stem: 'rdf_nvt', problems: [] });
    expect(plan.json.argv).toContain('rdf/rdf_nvt_cn.xvg');
    expect((await s.call('/api/plan', { ...req, template: '{run}' })).json).toEqual({ error: '{run} has no value here' });
    const started = await s.call('/api/runs', req);
    expect(started.json).toMatchObject({ kind: 'rdf', status: 'running', meta: { stem: 'rdf_nvt' } });
    expect(started.json).not.toHaveProperty('log');
    let rec = await s.call('/api/jobs/' + started.json.id + '/record');
    for (let i = 0; i < 100 && rec.status !== 200; i++) { await new Promise(r => setTimeout(r, 100)); rec = await s.call('/api/jobs/' + started.json.id + '/record'); }
    expect(rec.json).toMatchObject({ format: 'gmx-cypher run', status: 'done', job: started.json.id });
    expect((await s.call('/api/runs', { ...req, options: { bin: '0' } })).json).toEqual({ error: '-bin must be above 0' });
    await s.close();
  });
});
