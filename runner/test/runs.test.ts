import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { recordComplete, recordProblems } from '../src/lib/record';
import { replaceOwn } from '../server/files';
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

afterEach(() => { delete process.env.FAKE_GMX_TOUCH; delete process.env.FAKE_GMX_SLOW; });

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

  it('refuses a structure of another size than the run input: the groups would be other atoms (review finding 1)', async () => {
    const { dir, s, req, roots } = await setup();
    // Your nvt.gro without its 30 SO4 atoms: 3212 atoms, so "residue name Na" would be atoms 1-12, sulfate in nvt.tpr.
    const lines = readFileSync(join(dir, 'nvt.gro'), 'utf8').split('\n'), atoms = lines.slice(2, 2 + 3242).filter(l => l.slice(5, 10).trim() !== 'SO4');
    writeFileSync(join(dir, 'other.gro'), [lines[0], String(atoms.length).padStart(5), ...atoms, lines[2 + 3242], ''].join('\n'));
    const groupsNa = [groups[0], { ...groups[2] }].map((g, i) => (i === 0 ? { ...g, steps: [{ op: 'add' as const, rule: { kind: 'resname' as const, value: 'Na' } }], name: 'sodium' } : { ...g, name: 'water', steps: [{ op: 'add' as const, rule: { kind: 'name' as const, value: 'OW1' } }] }));
    await expect(startRun(s.ctx, { ...req, inputs: { ...req.inputs, structure: join(dir, 'other.gro') }, groups: groupsNa }, roots)).rejects.toThrow('the structure has 3212 atoms, the run input 3242');
    expect(s.ctx.jobs.list()).toEqual([]);
    expect(existsSync(join(dir, 'rdf'))).toBe(false);
    await s.close();
  });

  it('refuses an output folder inside the Matrix vault: results go there only by sending (review finding 11)', async () => {
    const { dir, s, req, roots } = await setup();
    mkdirSync(join(dir, 'vault/ions'), { recursive: true });
    s.ctx.config.vault = join(dir, 'vault');
    await expect(startRun(s.ctx, { ...req, outDir: join(dir, 'vault/ions') }, roots)).rejects.toThrow(join(dir, 'vault/ions') + ' is inside the Matrix vault; results go there only by send to vault');
    expect(readdirSync(join(dir, 'vault/ions'))).toEqual([]);
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

  it('a GMX_MAXBACKUP=-1 inherited from a cluster shell is not passed on: gmx still backs up (review finding 6)', async () => {
    const { dir, s, req, roots } = await setup();
    process.env.GMX_MAXBACKUP = '-1';
    try {
      process.env.FAKE_GMX_TOUCH = 'rdf=' + join(dir, 'rdf/rdf_nvt.xvg');
      const r = await (await startRun(s.ctx, req, roots)).record;
      expect(r.problems).toEqual(['gmx backed up a file that appeared during the run: #rdf_nvt.xvg.1#']);
      expect(r.env.GMX_MAXBACKUP).toBe('99');
    } finally { delete process.env.GMX_MAXBACKUP; }
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
    // Asked while typing a template: a refusal is an answer (200), so the browser logs no failed request.
    expect(await s.call('/api/plan', { ...req, template: '{run}' })).toEqual({ status: 200, json: { error: "{run} has no value here: in a single run only {analysis} and {trajectory} do; a batch's path template gives the others" } });
    const started = await s.call('/api/runs', req);
    expect(started.json).toMatchObject({ kind: 'rdf', status: 'running', meta: { stem: 'rdf_nvt' } });
    expect(started.json).not.toHaveProperty('log');
    // Asked the moment the job ends, as the page does: the record is still being written, and the answer waits for it (no 404).
    const ended = new Promise<void>(r => s.ctx.jobs.on('job', (j: { id: string; ended?: string }) => { if (j.id === started.json.id && j.ended) r(); }));
    await ended;
    const rec = await s.call('/api/jobs/' + started.json.id + '/record');
    expect(rec.status).toBe(200);
    expect(rec.json).toMatchObject({ format: 'gmx-cypher run', status: 'done', job: started.json.id });
    const res = await fetch(s.base + '/api/jobs/' + started.json.id + '/output?kind=cn', { headers: s.headers });
    expect(await res.text()).toContain('@ s1 legend "sodium"');
    expect((await s.call('/api/jobs/' + started.json.id + '/output?kind=log')).json).toEqual({ error: 'no output log: xvg or cn' });
    expect((await s.call('/api/runs', { ...req, options: { bin: '0' } })).json).toEqual({ error: '-bin must be above 0' });
    await s.close();
  });
});

describe('the record exists from the start (R2b, T157)', () => {
  // The keys of a record written by batch 2's code from your real run: a completed record now has these and `complete`.
  const golden = Object.keys(JSON.parse(readFileSync(RUNNER + 'test/fixtures/decypher/rdf_o111_Methionine_H.run.json', 'utf8')));

  it('is written when the job starts, says it is running, and is completed by a rename when it ends', async () => {
    const { dir, s, req, roots } = await setup();
    process.env.FAKE_GMX_SLOW = '40';
    const { job, record } = await startRun(s.ctx, req, roots);
    const path = join(dir, 'rdf/rdf_nvt.run.json'), first = JSON.parse(readFileSync(path, 'utf8'));
    expect(first).toMatchObject({ format: 'gmx-cypher run', version: 3, job: job.id, status: 'running', complete: false, ended: null, outputs: [] });
    expect(first.groups.map((g: { name: string; atoms: string }) => [g.name, g.atoms])).toEqual([['sulfur', '5-30:5'], ['water_O', '43-3239:4'], ['sodium', '31-42']]);
    expect(recordComplete(first)).toBe(false);
    expect(recordProblems(first)).toEqual([]);
    const r = await record, last = JSON.parse(readFileSync(path, 'utf8'));
    expect(last).toEqual(JSON.parse(JSON.stringify(r)));
    expect(last).toMatchObject({ status: 'done', complete: true });
    expect(recordComplete(last)).toBe(true);
    expect(Object.keys(last).sort()).toEqual([...golden, 'complete'].sort());
    expect(readdirSync(join(dir, 'rdf')).filter(n => n.includes('.tmp-'))).toEqual([]);
    await s.close();
  });

  it('a record from before, without the field, is complete when it has ended', () => {
    expect(recordComplete(JSON.parse(readFileSync(RUNNER + 'test/fixtures/formats/run-v1.run.json', 'utf8')))).toBe(true);
    expect(recordComplete({ status: 'running' })).toBe(false);
  });

  it('replaceOwn writes a whole new file or nothing: a temporary name, then a rename', () => {
    const d = tmp('own'), p = join(d, 'a.run.json');
    writeFileSync(p, 'first\n');
    replaceOwn(p, 'second\n', 'j1');
    expect(readFileSync(p, 'utf8')).toBe('second\n');
    expect(readdirSync(d)).toEqual(['a.run.json']);
    // The temporary name taken: refused, and the record is left as it was.
    writeFileSync(p + '.tmp-j2', 'someone else\n');
    expect(() => replaceOwn(p, 'third\n', 'j2')).toThrow(/EEXIST/);
    expect(readFileSync(p, 'utf8')).toBe('second\n');
    expect(readFileSync(p + '.tmp-j2', 'utf8')).toBe('someone else\n');
  });
});

