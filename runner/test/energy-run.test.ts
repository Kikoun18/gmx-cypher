import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { energyCommand, commandOf } from '../src/lib/commands';
import { parseHelp } from '../src/lib/gmxText';
import { energyOptionProblems } from '../src/lib/energy';
import { recordProblems } from '../src/lib/record';
import { planRun, startRun, type RunRequest } from '../server/runs';
import { detectAna, getAnalyses, parseTable } from '../../matrix/src/lib/seq';
import { parseGmxHeader } from '../../matrix/src/lib/gmxHeader';
import { apiServer, FAKE_GMX, RUNNER, tmp } from './helpers';

// gmx energy (R4) on the test trajectory's energy file: the argv, the refusals, and a run through the fake gmx
// (or the real one, with GMX set, as the other run tests do).
const REAL = !!process.env.GMX;
const help = parseHelp(readFileSync(new URL('./fixtures/gmx-2025.4/energy-h.txt', import.meta.url), 'utf8'));
const io = { edr: 'rerun.edr', output: 'energy/rerun.xvg' };

async function setup(options = {}) {
  const dir = tmp('energy');
  copyFileSync(RUNNER + 'test/fixtures/nvt/rerun.edr', join(dir, 'rerun.edr'));
  const s = await apiServer(REAL ? { gmx: { ok: true, name: 'gmx', path: process.env.GMX, version: '2025.4' } } : { gmx: { ok: true, name: 'gmx', path: FAKE_GMX, version: '2025.4-PLUMED_spack' } });
  const req: RunRequest = { tool: 'energy', inputs: { edr: join(dir, 'rerun.edr') }, groups: [], options, terms: [1, 6] };
  return { dir, s, req, roots: [dir] };
}

afterEach(() => { delete process.env.FAKE_GMX_FAIL; });

describe('the energy command (R4): its argument list and its refusals', () => {
  it('the file and its output, then only the options that differ from the installed defaults', () => {
    expect(energyCommand.argv({ options: {}, selections: 0 }, io, help)).toEqual(['energy', '-f', 'rerun.edr', '-o', 'energy/rerun.xvg']);
    expect(energyCommand.argv({ options: { b: '2', sum: true }, selections: 0 }, io, help)).toEqual(['energy', '-f', 'rerun.edr', '-o', 'energy/rerun.xvg', '-b', '2', '-sum']);
    expect(energyCommand.argv({ options: { driftcorr: false, fluct_props: false }, selections: 0 }, io, help)).toEqual(['energy', '-f', 'rerun.edr', '-o', 'energy/rerun.xvg']);
  });

  it('the run input is optional: given, it goes in as -s', () => {
    const { io: withTpr } = energyCommand.io({ edr: '/sim/nvt/rerun.edr', runInput: '/sim/nvt/nvt.tpr' }, '/sim/nvt/energy', 'rerun');
    expect(withTpr).toEqual({ edr: 'rerun.edr', tpr: 'nvt.tpr', output: 'energy/rerun.xvg' });
    expect(energyCommand.argv({ options: {}, selections: 0 }, withTpr, help)).toEqual(['energy', '-f', 'rerun.edr', '-s', 'nvt.tpr', '-o', 'energy/rerun.xvg']);
    expect(energyCommand).toMatchObject({ inputs: ['edr', 'runInput'], required: ['edr'] });
  });

  it('an option the form does not offer, or this gmx does not have, is refused', () => {
    expect(() => energyCommand.argv({ options: { dt: '2' }, selections: 0 }, io, help)).toThrow('-dt is not an option gmx-cypher sets for energy');
    expect(() => energyCommand.argv({ options: { b: '2' }, selections: 0 }, io, help.filter(o => o.flag !== 'b'))).toThrow('this gmx energy has no -b');
  });

  it('the first and last time: numbers, and the last after the first', () => {
    expect(energyOptionProblems({ b: '5', e: '3' }, help)).toEqual(['-e must be after -b']);
    expect(energyOptionProblems({ b: 'abc' }, help)).toEqual(['-b: not a number: abc']);
    expect(energyOptionProblems({ b: '-1' }, help)).toEqual(['-b must be 0 or more']);
    expect(energyOptionProblems({ b: '2', e: '0' }, help)).toEqual([]);
  });

  it('its folder is energy/, beside the file; its name is the stem', () => {
    const { cwd, io: plain } = energyCommand.io({ edr: '/sim/nvt/rerun.edr' }, '/sim/nvt/energy', 'rerun');
    expect({ cwd, plain }).toEqual({ cwd: '/sim/nvt', plain: { edr: 'rerun.edr', output: 'energy/rerun.xvg' } });
    expect(energyCommand.outputNames('rerun')).toEqual({ xvg: 'rerun.xvg', record: 'rerun.run.json' });
  });

  it('is found by its tool name and needs an energy file, no groups', () => {
    expect(commandOf('energy')).toBe(energyCommand);
    expect(energyCommand).toMatchObject({ tool: 'energy', inputs: ['edr', 'runInput'], required: ['edr'], groups: false, section: 'an energy file' });
  });
});

describe('the energy output in the Matrix (R4): typed Energy, every column a curve', () => {
  // Real 2025.4 output of gmx energy (terms 1 and 6 of rerun.edr). Its title "GROMACS Energies" does not contain
  // the Matrix's keyword "energy", so only the file name types it (Phase 0 §4): Cypher's default name does.
  const text = readFileSync(new URL('./fixtures/gmx-2025.4/energy-potential.xvg', import.meta.url), 'utf8');
  const h = parseGmxHeader(text)!, t = parseTable(text);

  it.each([
    ['energy_rerun.xvg', 'energy'],
    ['energy_rerun (2).xvg', 'energy'],
  ])('%s → %s, with both terms as curves', (name, k) => {
    const a = detectAna(getAnalyses(null), name, t.head, h.tool);
    // The Matrix batch 3 reads the file's own header ("GROMACS Energies", from gmx energy): the name no longer matters.
    expect(a).toEqual({ k, from: 'header' });
    expect(getAnalyses(null).find(x => x.k === a.k)?.yCols).toBe('all');
    expect(t.head.legends).toEqual(['Bond', 'Potential']);
  });

  it('a name without "energy" is typed Energy too, from the header (the Matrix before batch 3 needed "energy" in the name)', () => {
    expect(detectAna(getAnalyses(null), 'pot.xvg', t.head, h.tool)).toEqual({ k: 'energy', from: 'header' });
  });
});

describe('a run of gmx energy (R4): planned, checked against the file, and recorded with its answers', () => {
  it('plans energy/<stem>.xvg with stdin 1 6 and 0', async () => {
    const { dir, s, req, roots } = await setup();
    const plan = await planRun(s.ctx, req, roots);
    expect(plan).toMatchObject({ tool: 'energy', cwd: dir, outDir: join(dir, 'energy'), stem: 'energy_rerun', stdin: '1 6\n0\n', problems: [] });
    expect(plan.argv).toEqual(['energy', '-f', 'rerun.edr', '-o', 'energy/energy_rerun.xvg']);
    await s.close();
  });

  it('refuses a term that is not in the file, and no term at all, before anything runs', async () => {
    const { dir, s, req, roots } = await setup();
    await expect(planRun(s.ctx, { ...req, terms: [1, 9] }, roots)).resolves.toMatchObject({ problems: ['9 is not a term of this file'] });
    await expect(planRun(s.ctx, { ...req, terms: [] }, roots)).resolves.toMatchObject({ problems: ['pick at least one term'] });
    await expect(startRun(s.ctx, { ...req, terms: [] }, roots)).rejects.toMatchObject({ status: 409 });
    expect(existsSync(join(dir, 'energy'))).toBe(false);
    await s.close();
  });

  it('runs, and the record says what was asked and what came out', async () => {
    const { dir, s, req, roots } = await setup({ b: '2' });
    const { job, record } = await startRun(s.ctx, req, roots);
    expect(job.kind).toBe('energy');
    expect(job.args).toEqual(['energy', '-f', 'rerun.edr', '-o', 'energy/energy_rerun.xvg', '-b', '2']);
    expect(job.stdin).toBe('1 6\n0\n');
    const r = await record;
    expect(r).toMatchObject({ status: 'done', analysis: 'energy', stdin: '1 6\n0\n', groups: [], problems: [] });
    expect(r.recipe).toMatchObject({ options: { b: '2' }, terms: [1, 6] });
    expect(r.outputs.map(o => o.kind)).toEqual(['xvg']);
    // The statistics gmx printed, read from the job's log into the record (R4): one row per term, both drifts flagged.
    expect(r.statistics?.rows.map(x => [x.name, x.unit])).toEqual([['Bond', 'kJ/mol'], ['Potential', 'kJ/mol']]);
    expect(r.options.find(o => o.flag === 'b')).toMatchObject({ value: '2', isDefault: false });
    expect(r.options.map(o => o.flag)).toEqual(['b', 'e', 'sum', 'fluct_props', 'driftcorr']);
    expect(recordProblems(JSON.parse(readFileSync(join(dir, 'energy/energy_rerun.run.json'), 'utf8')))).toEqual([]);
    expect(readdirSync(join(dir, 'energy')).sort()).toEqual(['energy_rerun.run.json', 'energy_rerun.xvg']);
    await s.close();
  });

  it('a record left empty (the run was interrupted after its stem was claimed) reads as no record, not as an error', async () => {
    const { dir, s, req, roots } = await setup();
    const { job, record } = await startRun(s.ctx, req, roots);
    await record;
    writeFileSync(join(dir, 'energy/energy_rerun.run.json'), '');
    expect(await s.call('/api/jobs/' + job.id + '/record')).toEqual({ status: 404, json: { error: 'this job has no record: it stopped before gmx-cypher wrote it' } });
    await s.close();
  });

  it('an existing name leads to a new stem, and the existing file is untouched', async () => {
    const { dir, s, req, roots } = await setup();
    mkdirSync(join(dir, 'energy'));
    writeFileSync(join(dir, 'energy/ENERGY_RERUN.xvg'), 'mine\n');
    const { job, record } = await startRun(s.ctx, req, roots);
    expect(job.args).toContain('energy/energy_rerun (2).xvg');
    await record;
    expect(readFileSync(join(dir, 'energy/ENERGY_RERUN.xvg'), 'utf8')).toBe('mine\n');
    expect(existsSync(join(dir, 'energy/energy_rerun (2).run.json'))).toBe(true);
    await s.close();
  });
});
