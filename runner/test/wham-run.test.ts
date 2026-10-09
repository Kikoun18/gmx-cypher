import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { recordProblems } from '../src/lib/record';
import { planRun, startRun, type RunRequest } from '../server/runs';
import { findWindows } from '../server/wham';
import { apiServer, FAKE_GMX, RUNNER, tmp } from './helpers';

// gmx wham (R6) on the real umbrella set in test/fixtures/wham (9 windows, 300 K), through the fake gmx (which writes
// that set's real outputs) or the real one with GMX set.
const REAL = !!process.env.GMX;

async function setup(over: Partial<RunRequest> = {}) {
  const root = tmp('wham'), us = join(root, 'us');
  cpSync(RUNNER + 'test/fixtures/wham', us, { recursive: true, filter: src => !src.includes('/out') });
  const s = await apiServer({ gmx: REAL ? { ok: true, name: 'gmx', path: process.env.GMX, version: '2025.4' } : { ok: true, name: 'gmx', path: FAKE_GMX, version: '2025.4-PLUMED_spack' } });
  await s.call('/api/config', { allow: [root] });
  const windows = findWindows(us, '*/umbrella.tpr', 'pullx', [root]).map(w => ({ tpr: w.tpr, pull: w.pull! }));
  const req: RunRequest = { tool: 'wham', inputs: {}, groups: [], options: { b: '2' }, windows, pull: 'pullx', ...over };
  return { root, us, s, req, roots: [root] };
}

describe('finding the windows (R6): a folder template, each run input with its pull file beside it', () => {
  it('*/umbrella.tpr: the nine windows, in natural order, with their pullx files', async () => {
    const { us, root, s } = await setup();
    const w = findWindows(us, '*/umbrella.tpr', 'pullx', [root]);
    expect(w.map(x => x.rel)).toEqual(['win00', 'win01', 'win02', 'win03', 'win04', 'win05', 'win06', 'win07', 'win08'].map(d => d + '/umbrella.tpr'));
    expect(w.every(x => x.pull === x.tpr.replace(/umbrella\.tpr$/, 'umbrella_pullx.xvg'))).toBe(true);
    expect(findWindows(us, 'win0*/umbrella.tpr', 'pullf', [root])[3].pull).toMatch(/win03\/umbrella_pullf\.xvg$/);
    await s.close();
  });

  it('only inside the allowed folders, and only a template that ends in a .tpr name', async () => {
    const { us, s } = await setup();
    expect(() => findWindows(us, '*/umbrella.tpr', 'pullx', [tmp('elsewhere')])).toThrow('outside the allowed folders');
    expect(() => findWindows(us, '*/umbrella_pullx.xvg', 'pullx', [us])).toThrow('the template must end in a .tpr name');
    expect(findWindows(us, 'nothing*/umbrella.tpr', 'pullx', [us])).toEqual([]);
    await s.close();
  });

  it('through the API', async () => {
    const { us, s } = await setup();
    const r = await s.call('/api/wham/windows', { root: us, glob: '*/umbrella.tpr', pull: 'pullx' });
    expect([r.status, r.json.windows.length, r.json.unread]).toEqual([200, 9, []]);
    await s.close();
  });
});

describe('planning gmx wham (R6)', () => {
  it('the lists beside the outputs, the temperature from the run inputs, the histograms for the vault', async () => {
    const { us, s, req, roots } = await setup();
    const plan = await planRun(s.ctx, req, roots);
    expect(plan).toMatchObject({ tool: 'wham', cwd: us, outDir: join(us, 'wham'), stem: 'wham_us', problems: [] });
    expect(plan.notes).toEqual(['temperature 300 K, from the run inputs (gmx wham would assume 298 K)']);
    expect(plan.argv).toEqual(['wham', '-it', 'wham/wham_us_tpr-files.dat', '-ix', 'wham/wham_us_pull-files.dat', '-o', 'wham/wham_us_profile.xvg', '-hist', 'wham/wham_us_histo.xvg', '-temp', '300', '-b', '2']);
    expect(plan.names).toEqual({ xvg: 'wham_us_histo.xvg', record: 'wham_us.run.json', more: ['wham_us_profile.xvg', 'wham_us_tpr-files.dat', 'wham_us_pull-files.dat'] });
    expect(plan.writes[0]).toEqual({ name: 'wham_us_tpr-files.dat', text: req.windows!.map(w => w.tpr + '\n').join('') });
    await s.close();
  });

  it('a temperature you set is kept, and gmx dump is not asked', async () => {
    const { s, req, roots } = await setup({ options: { b: '2', temp: '310' } });
    const plan = await planRun(s.ctx, req, roots);
    expect([plan.notes, plan.argv.slice(-4)]).toEqual([[], ['-temp', '310', '-b', '2']]);
    await s.close();
  });

  it('bootstrap adds its two files', async () => {
    const { s, req, roots } = await setup({ options: { b: '2', nBootstrap: '10' } });
    expect((await planRun(s.ctx, req, roots)).names.more).toEqual(['wham_us_profile.xvg', 'wham_us_tpr-files.dat', 'wham_us_pull-files.dat', 'wham_us_bsres.xvg', 'wham_us_bsprof.xvg']);
    await s.close();
  });

  it('refused: fewer than two windows, a window outside the allowed folders, a file of the wrong kind', async () => {
    const { s, req, roots } = await setup();
    await expect(planRun(s.ctx, { ...req, windows: req.windows!.slice(0, 1) }, roots)).rejects.toMatchObject({ status: 400, message: 'at least two umbrella windows are needed' });
    await expect(planRun(s.ctx, { ...req, windows: [...req.windows!, { tpr: '/etc/passwd', pull: req.windows![0].pull }] }, roots)).rejects.toMatchObject({ status: 403 });
    await expect(planRun(s.ctx, { ...req, windows: [{ tpr: req.windows![0].pull, pull: req.windows![0].pull }, req.windows![1]] }, roots)).rejects.toMatchObject({ status: 400 });
    await s.close();
  });
});

describe('a run of gmx wham (R6)', () => {
  it('writes the lists, runs, and records every window hashed and every file it wrote', async () => {
    const { us, s, req, roots } = await setup({ options: { b: '2', nBootstrap: '10' } });
    const { job, record } = await startRun(s.ctx, req, roots);
    const r = await record;
    expect(r).toMatchObject({ status: 'done', analysis: 'wham', problems: [], recipe: { pull: 'pullx' } });
    expect(r.windows).toHaveLength(9);
    expect(r.windows![0].tpr).toMatchObject({ path: req.windows![0].tpr, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(r.options.find(o => o.flag === 'temp')).toMatchObject({ value: '300', isDefault: false });
    expect(r.outputs.map(o => [o.path.split('/').pop(), o.kind])).toEqual([
      ['wham_us_profile.xvg', 'xvg'], ['wham_us_tpr-files.dat', 'list'], ['wham_us_pull-files.dat', 'list'], ['wham_us_bsres.xvg', 'xvg'], ['wham_us_bsprof.xvg', 'xvg'], ['wham_us_histo.xvg', 'xvg'],
    ]);
    expect(readFileSync(join(us, 'wham/wham_us_pull-files.dat'), 'utf8').trim().split('\n')).toEqual(req.windows!.map(w => w.pull));
    expect(readdirSync(join(us, 'wham')).sort()).toEqual(['wham_us.run.json', 'wham_us_bsprof.xvg', 'wham_us_bsres.xvg', 'wham_us_histo.xvg', 'wham_us_profile.xvg', 'wham_us_pull-files.dat', 'wham_us_tpr-files.dat']);
    expect(recordProblems(JSON.parse(readFileSync(join(us, 'wham/wham_us.run.json'), 'utf8')))).toEqual([]);
    expect(job.args).toContain('-bsres');
    await s.close();
  });

  it('a second run takes the next free stem; the first run\'s lists are untouched', async () => {
    const { us, s, req, roots } = await setup();
    await (await startRun(s.ctx, req, roots)).record;
    const before = readFileSync(join(us, 'wham/wham_us_tpr-files.dat'), 'utf8');
    const second = await startRun(s.ctx, req, roots);
    await second.record;
    expect(second.job.args).toContain('wham/wham_us (2)_histo.xvg');
    expect(readFileSync(join(us, 'wham/wham_us_tpr-files.dat'), 'utf8')).toBe(before);
    expect(existsSync(join(us, 'wham/wham_us (2)_tpr-files.dat'))).toBe(true);
    await s.close();
  });
});
