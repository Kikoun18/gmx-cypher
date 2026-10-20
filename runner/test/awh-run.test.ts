import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeBackend } from '../../matrix/scripts/node-backend';
import { addColumn } from '../../matrix/src/lib/seq';
import { newVault } from '../../matrix/test/helpers';
import { recordProblems } from '../src/lib/record';
import { planRun, startRun, type RunRequest } from '../server/runs';
import { apiServer, FAKE_GMX, RUNNER, tmp } from './helpers';

// gmx awh (R5) on the real AWH run in test/fixtures/awh: frames every 2 ps, 0–20 ps. Through the fake gmx, which
// writes that run's real files, or the real one with GMX set.
const REAL = !!process.env.GMX;

async function setup(over: Partial<RunRequest> = {}, patch = {}) {
  const dir = tmp('awh');
  for (const f of ['awh.edr', 'topol.tpr']) copyFileSync(RUNNER + 'test/fixtures/awh/' + f, join(dir, f));
  const s = await apiServer({ gmx: REAL ? { ok: true, name: 'gmx', path: process.env.GMX, version: '2025.4' } : { ok: true, name: 'gmx', path: FAKE_GMX, version: '2025.4-PLUMED_spack' }, ...patch });
  const req: RunRequest = { tool: 'awh', inputs: { edr: join(dir, 'awh.edr'), runInput: join(dir, 'topol.tpr') }, groups: [], options: { b: '20' }, ...over };
  return { dir, s, req, roots: [dir] };
}

describe('planning gmx awh (R5): each file it will write, named before it runs', () => {
  it('the last time: one file, awh/<stem>_t20.xvg', async () => {
    const { dir, s, req, roots } = await setup();
    const plan = await planRun(s.ctx, req, roots);
    expect(plan).toMatchObject({ tool: 'awh', cwd: dir, outDir: join(dir, 'awh'), stem: 'awh_awh', problems: [], names: { xvg: 'awh_awh_t20.xvg', record: 'awh_awh.run.json', more: [] } });
    expect(plan.argv).toEqual(['awh', '-f', 'awh.edr', '-s', 'topol.tpr', '-o', 'awh/awh_awh.xvg', '-b', '20']);
    await s.close();
  });

  it('every 4th: three files, the last of them the one for the vault', async () => {
    const { s, req, roots } = await setup({ options: { skip: '4' } });
    expect((await planRun(s.ctx, req, roots)).names).toEqual({ xvg: 'awh_awh_t16.xvg', record: 'awh_awh.run.json', more: ['awh_awh_t0.xvg', 'awh_awh_t8.xvg'] });
    await s.close();
  });

  it('a first time past the last frame is refused: gmx awh would write nothing and say it went well', async () => {
    const { s, req, roots } = await setup({ options: { b: '30' } });
    expect((await planRun(s.ctx, req, roots)).problems).toEqual(['no AWH frame in this range: the file has frames from 0 to 20 ps']);
    await expect(startRun(s.ctx, req, roots)).rejects.toMatchObject({ status: 409 });
    await s.close();
  });

  it("an existing frame file of the same stem leads to a new stem: gmx would back it up, against T30's promise", async () => {
    const { dir, s, req, roots } = await setup({ options: { skip: '4' } });
    mkdirSync(join(dir, 'awh'));
    writeFileSync(join(dir, 'awh/awh_awh_t8.xvg'), 'mine\n');
    const plan = await planRun(s.ctx, req, roots);
    expect(plan.stem).toBe('awh_awh (2)');
    expect(plan.names.more).toEqual(['awh_awh (2)_t0.xvg', 'awh_awh (2)_t8.xvg']);
    await s.close();
  });

  it('needs the run input too', async () => {
    const { s, req, roots } = await setup();
    await expect(planRun(s.ctx, { ...req, inputs: { edr: req.inputs.edr } }, roots)).rejects.toMatchObject({ status: 400, message: 'an energy file and a run input are needed' });
    await s.close();
  });
});

describe('a run of gmx awh (R5)', () => {
  it('writes the planned frames and records them: count, last time, every file hashed', async () => {
    const { dir, s, req, roots } = await setup({ options: { skip: '4' } });
    const { job, record } = await startRun(s.ctx, req, roots);
    const r = await record;
    expect(r).toMatchObject({ status: 'done', analysis: 'awh', groups: [], problems: [], frames: { analysed: 3, lastTime: 16 } });
    expect(r.outputs.map(o => o.path.split('/').pop())).toEqual(['awh_awh_t0.xvg', 'awh_awh_t8.xvg', 'awh_awh_t16.xvg']);
    expect(readdirSync(join(dir, 'awh')).sort()).toEqual(['awh_awh.run.json', 'awh_awh_t0.xvg', 'awh_awh_t16.xvg', 'awh_awh_t8.xvg']);
    expect(recordProblems(JSON.parse(readFileSync(join(dir, 'awh/awh_awh.run.json'), 'utf8')))).toEqual([]);
    // Each frame is read by its name, and only a name of this run: the text is that frame's file.
    const get = (q: string) => fetch(s.base + '/api/jobs/' + job.id + '/output?' + q, { headers: s.headers });
    const t8 = await get('name=' + encodeURIComponent('awh_awh_t8.xvg'));
    expect([t8.status, await t8.text()]).toEqual([200, readFileSync(join(dir, 'awh/awh_awh_t8.xvg'), 'utf8')]);
    expect((await get('name=' + encodeURIComponent('../awh.edr'))).status).toBe(404);
    expect((await get('name=' + encodeURIComponent('awh_awh.run.json'))).status).toBe(404);
    // kind=xvg is the run's file for the vault: its last frame.
    expect(await (await get('kind=xvg')).text()).toBe(readFileSync(join(dir, 'awh/awh_awh_t16.xvg'), 'utf8'));
    await s.close();
  });

  it('its convergence (R7b): every frame it wrote, each against the one before and the final one, in kJ/mol', async () => {
    const { s, req, roots } = await setup({ options: { skip: '1' } });
    const { job, record } = await startRun(s.ctx, req, roots);
    await record;
    const c = await (await fetch(s.base + '/api/jobs/' + job.id + '/awh-convergence', { headers: s.headers })).json();
    expect(c).toMatchObject({ align: 'aligned by their mean over the shared grid', unit: 'kJ/mol', frames: 11, bias: null, biases: 1 });
    expect(c.steps.map((x: { time: number }) => x.time)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(c.steps[10]).toMatchObject({ prev: { max: expect.any(Number), rms: expect.any(Number) }, final: null });
    const other = (await (await fetch(s.base + '/api/jobs/nope/awh-convergence', { headers: s.headers })).json());
    expect(other.error).toBeTruthy();
    await s.close();
  });

  it('the scan the page shows: 11 frames, 0–20 ps, and the target error', async () => {
    const { s, req } = await setup();
    await s.call('/api/config', { allow: [req.inputs.edr!.replace(/\/awh\.edr$/, '')] });
    const r = await s.call('/api/awh/frames?edr=' + encodeURIComponent(req.inputs.edr!) + '&tpr=' + encodeURIComponent(req.inputs.runInput!));
    expect(r.status).toBe(200);
    expect((r.json as { frames: { time: number }[] }).frames.map(f => f.time)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect((r.json as { targetError: unknown }).targetError).toEqual(REAL ? expect.objectContaining({ kJ: expect.any(Number) }) : { kT: 3.98, kJ: 9.94 });
    await s.close();
  });
});

describe('the AWH result lands in the Matrix as a PMF, at its time (R5)', () => {
  it('the last frame, named by the project pattern: PMF, row, column and time 20', async () => {
    const vdir = tmp('vault'), { svc, vault } = await newVault(new NodeBackend(vdir));
    const c = addColumn(svc.store, 'HA', 'histidine');
    svc.commit({ ...c.store, settings: { ...c.store.settings, pattern: '{method}_{column}_{seq}_t{time}.xvg' } });
    await svc.flush();
    await vault.close();
    const { dir, s, req, roots } = await setup({ template: 'hmrfast6_HA_WRWYCR' });
    await s.call('/api/config', { allow: [dir], vault: vdir });
    const { job, record } = await startRun(s.ctx, req, roots);
    await record;
    expect(existsSync(join(dir, 'awh/hmrfast6_HA_WRWYCR_t20.xvg'))).toBe(true);
    const project = (await s.call('/api/vault')).json.projects[0];
    const l = await s.call('/api/landing', { job: job.id, project: project.id });
    expect(l.json).toMatchObject({ name: 'hmrfast6_HA_WRWYCR_t20.xvg', fields: { group: 'hmrfast6', col: 'HA', time: '20' }, preview: { ok: true, type: { k: 'pmf' }, col: { k: 'ha' } }, reasons: [] });
    await s.close();
  });
});
