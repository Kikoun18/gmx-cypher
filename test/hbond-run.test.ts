import { copyFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Group } from '../src/lib/groups';
import { recordProblems } from '../src/lib/record';
import { planRun, startRun, type RunRequest } from '../server/runs';
import { apiServer, FAKE_GMX, RUNNER, tmp } from './helpers';

// gmx hbond (R8) on the test system: the sulfate's oxygens as acceptors, water as donors and acceptors. Through the fake
// gmx (the real 2025.4 outputs of test/fixtures/hbond), answering as 2025.4 or as 2023.3; or the real one with GMX set.
const REAL = !!process.env.GMX;
const FAKE_2023 = RUNNER + 'test/fake-gmx-2023.mjs';
const resname = (name: string, tone: 'coral' | 'sky' | 'mint', role: 'reference' | 'selection', value: string): Group => ({ role, name, tone, steps: [{ op: 'add', rule: { kind: 'resname', value } }] });
const groups: Group[] = [resname('sulfate', 'coral', 'reference', 'SO4'), resname('water', 'sky', 'selection', 'SOL')];

async function setup(tool: string, options: Record<string, string | boolean> = {}, gmx = FAKE_GMX, g = groups) {
  const dir = tmp('hbond');
  for (const f of ['nvt.tpr', 'nvt.gro', 'nvt.xtc']) copyFileSync(RUNNER + 'test/fixtures/nvt/' + f, join(dir, f));
  const version = gmx === FAKE_2023 ? '2023.3' : '2025.4';
  const s = await apiServer({ gmx: { ok: true, name: 'gmx', path: REAL && gmx === FAKE_GMX ? process.env.GMX : gmx, version } });
  const req: RunRequest = { tool, inputs: { trajectory: join(dir, 'nvt.xtc'), runInput: join(dir, 'nvt.tpr'), structure: join(dir, 'nvt.gro') }, groups: g, options };
  return { dir, s, req, roots: [dir] };
}

describe('which H-bond tool this gmx has (R8, question 33)', () => {
  it('2025.4: the selection tool; the legacy one is not offered beside it, so the criteria never mix', async () => {
    const { s } = await setup('hbond');
    const { json } = await s.call<{ tool: string; ok: boolean; gmxTool?: string; why?: string }[]>('/api/commands');
    expect(json.find(c => c.tool === 'hbond')).toEqual({ tool: 'hbond', ok: true, gmxTool: 'hbond' });
    expect(json.find(c => c.tool === 'hbond-legacy')).toMatchObject({ ok: false, why: expect.stringContaining('only without it') });
    expect(json.find(c => c.tool === 'rdf')).toEqual({ tool: 'rdf', ok: true, gmxTool: 'rdf' });
    expect(await s.call('/api/help/hbond-legacy')).toMatchObject({ status: 409 });
    await s.close();
  });

  it.skipIf(REAL)('2023.3: gmx hbond is the legacy tool, so the legacy command runs it under that name', async () => {
    const { s } = await setup('hbond-legacy', {}, FAKE_2023);
    const { json } = await s.call<{ tool: string; ok: boolean; gmxTool?: string; why?: string }[]>('/api/commands');
    expect(json.find(c => c.tool === 'hbond')).toMatchObject({ ok: false, why: expect.stringContaining('is the legacy tool') });
    expect(json.find(c => c.tool === 'hbond-legacy')).toEqual({ tool: 'hbond-legacy', ok: true, gmxTool: 'hbond' });
    const help = await s.call<{ tool: string; options: { flag: string; type: string }[] }>('/api/help/hbond-legacy');
    expect(help.json.tool).toBe('hbond');
    expect(help.json.options.find(o => o.flag === 'r')?.type).toBe('real');
    await s.close();
  });
});

describe('a run of gmx hbond, the selection tool (R8)', () => {
  it('the count over time, its index of the bonds, and the donors and acceptors gmx found in the record', async () => {
    const { dir, s, req, roots } = await setup('hbond', { dist: true });
    const plan = await planRun(s.ctx, req, roots);
    expect(plan.argv).toEqual(['hbond', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'hbond/hbond_nvt.ndx', '-o', 'hbond/hbond_nvt_hbonds.ndx', '-num', 'hbond/hbond_nvt.xvg', '-dist', 'hbond/hbond_nvt_dist.xvg', '-r', 'group 0', '-t', 'group 1']);
    expect(plan.stdin).toBeUndefined();
    const { record } = await startRun(s.ctx, req, roots);
    const r = await record;
    expect(r).toMatchObject({ status: 'done', analysis: 'hbond', problems: [] });
    expect(r.summary).toEqual(["Selection 'sulfate' has 24 acceptors and 0 donors.", "Selection 'water' has 800 acceptors and 800 donors."]);
    expect(r.outputs.map(o => [o.kind, o.path.split('/').pop()])).toEqual([['ndx', 'hbond_nvt_hbonds.ndx'], ['xvg', 'hbond_nvt_dist.xvg'], ['xvg', 'hbond_nvt.xvg'], ['ndx', 'hbond_nvt.ndx']]);
    expect(r.frames).toMatchObject({ analysed: 21 });
    expect(readdirSync(join(dir, 'hbond')).sort()).toEqual(['hbond_nvt.ndx', 'hbond_nvt.run.json', 'hbond_nvt.xvg', 'hbond_nvt_dist.xvg', 'hbond_nvt_hbonds.ndx']);
    expect(recordProblems(JSON.parse(readFileSync(join(dir, 'hbond/hbond_nvt.run.json'), 'utf8')))).toEqual([]);
    await s.close();
  });

  it('a reference and a target sharing some atoms are refused before anything runs', async () => {
    const some: Group[] = [groups[0], { role: 'selection', name: 'mixed', tone: 'sky', steps: [{ op: 'add', rule: { kind: 'atoms', atoms: '25-60' } }] }];
    const { dir, s, req, roots } = await setup('hbond', {}, FAKE_GMX, some);
    await expect(startRun(s.ctx, req, roots)).rejects.toMatchObject({ status: 409, message: 'sulfate and mixed share 6 atoms: gmx hbond needs the same atoms or none in common' });
    expect(readdirSync(dir).sort()).toEqual(['nvt.gro', 'nvt.tpr', 'nvt.xtc']);
    await s.close();
  });

  it('the legacy command is refused where the selection tool is', async () => {
    const { s, req, roots } = await setup('hbond-legacy');
    await expect(planRun(s.ctx, req, roots)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("so the two tools' criteria never mix") });
    await s.close();
  });
});

describe.skipIf(REAL)('a run of the legacy tool where it is gmx hbond (2023.3, R8)', () => {
  it('runs gmx hbond with the groups answered on stdin; the record names the command and the tool it ran', async () => {
    const { dir, s, req, roots } = await setup('hbond-legacy', { r: '0.3', dist: true }, FAKE_2023);
    const plan = await planRun(s.ctx, req, roots);
    expect(plan).toMatchObject({ tool: 'hbond-legacy', gmxTool: 'hbond', stdin: '0\n1\n' });
    expect(plan.argv).toEqual(['hbond', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'hbond-legacy/hbond-legacy_nvt.ndx', '-num', 'hbond-legacy/hbond-legacy_nvt.xvg', '-dist', 'hbond-legacy/hbond-legacy_nvt_dist.xvg', '-r', '0.3']);
    const { record } = await startRun(s.ctx, req, roots);
    const r = await record;
    expect(r).toMatchObject({ status: 'done', analysis: 'hbond-legacy', stdin: '0\n1\n', problems: [] });
    expect(r.command.args[0]).toBe('hbond');
    expect(r.summary).toEqual(['Found 800 donors and 824 acceptors', 'Average number of hbonds per timeframe 67.476 out of 329600 possible']);
    expect(r.options.find(o => o.flag === 'r')).toMatchObject({ value: '0.3', default: '0.35', isDefault: false });
    expect(readdirSync(join(dir, 'hbond-legacy')).sort()).toEqual(['hbond-legacy_nvt.ndx', 'hbond-legacy_nvt.run.json', 'hbond-legacy_nvt.xvg', 'hbond-legacy_nvt_dist.xvg']);
    await s.close();
  });

  it('the angle distribution with merging on is refused before anything runs, as gmx would refuse it; with it off it runs', async () => {
    const { dir, s, req, roots } = await setup('hbond-legacy', { ang: true }, FAKE_2023);
    expect((await planRun(s.ctx, req, roots)).problems).toEqual(["the angle distribution can't be written while H-bonds are merged: switch merging off (-nomerge)"]);
    await expect(startRun(s.ctx, req, roots)).rejects.toMatchObject({ status: 409 });
    const off = { ...req, options: { ang: true, merge: false } };
    expect((await planRun(s.ctx, off, roots)).argv.slice(-3)).toEqual(['-ang', 'hbond-legacy/hbond-legacy_nvt_ang.xvg', '-nomerge']);
    expect(await (await startRun(s.ctx, off, roots)).record).toMatchObject({ status: 'done', problems: [] });
    expect(readdirSync(join(dir, 'hbond-legacy'))).toContain('hbond-legacy_nvt_ang.xvg');
    await s.close();
  });
});
