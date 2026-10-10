import { copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { roleProblems, rmsCommand } from '../src/lib/commands';
import { parseHelp } from '../src/lib/gmxText';
import type { Group } from '../src/lib/groups';
import { recordProblems } from '../src/lib/record';
import { rmsArgv, rmsOptionProblems, rmsStdin } from '../src/lib/rms';
import { detectAna, getAnalyses, parseTable } from '../../app/src/lib/seq';
import { parseGmxHeader } from '../../app/src/lib/gmxHeader';
import { planRun, startRun, type RunRequest } from '../server/runs';
import { apiServer, FAKE_GMX, RUNNER, tmp } from './helpers';

const FIX = new URL('./fixtures/', import.meta.url), text = (p: string) => readFileSync(new URL(p, FIX), 'utf8');
const HELP = parseHelp(text('gmx-2025.4/rms-h.txt'));
const io = { trajectory: 'nvt.xtc', runInput: 'nvt.tpr', index: 'rms/r.ndx', output: 'rms/r.xvg' };
/** The numbers of an .xvg, without its header. */
const data = (t: string) => t.split('\n').filter(l => l && !'#@'.includes(l[0]));

describe('gmx rms (R9a): the fit group, then the groups measured, on stdin', () => {
  it('the fit group alone: it is fitted and measured; each further group is measured after that fit (-ng)', () => {
    expect(rmsArgv({ options: {}, selections: 0 }, io, HELP)).toEqual(['rms', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'rms/r.ndx', '-o', 'rms/r.xvg']);
    expect(rmsStdin(0)).toBe('0\n0\n');
    expect(rmsArgv({ options: { fit: 'translation', mw: false }, selections: 2 }, io, HELP)).toEqual(['rms', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'rms/r.ndx', '-o', 'rms/r.xvg', '-ng', '3', '-fit', 'translation', '-nomw']);
    expect(rmsStdin(2)).toBe('0\n0\n1\n2\n');
  });

  it('its groups: a fit group, and any number of groups measured', () => {
    expect(roleProblems(rmsCommand, 1)).toEqual([]);
    expect(roleProblems(rmsCommand, 4)).toEqual([]);
    expect(roleProblems(rmsCommand, 0)).toEqual(['a fit group is needed']);
  });

  it.each<[Record<string, string>, string[]]>([
    [{ prev: '1' }, []],
    [{ prev: '-1' }, ['-prev: a whole number, 0 or more']],
    [{ prev: '1.5' }, ['-prev: a whole number, 0 or more']],
    [{ b: '5', e: '2' }, ['-e must be after -b']],
  ])('%o → %o', (options, problems) => {
    expect(rmsOptionProblems(options, HELP)).toEqual(problems);
  });

  it('options the form does not offer are refused (-what stays rmsd, the type PMF Sequences reads)', () => {
    expect(() => rmsArgv({ options: { what: 'rho' }, selections: 0 }, io, HELP)).toThrow('-what is not an option gmx-cypher sets for rms');
  });

  it('its output is RMSD in PMF Sequences, which reads its first curve: the fit group', () => {
    const t = text('r9/rms/rmsd_nvt.xvg');
    expect(detectAna(getAnalyses(null), 'rms_nvt.xvg', parseTable(t).head, parseGmxHeader(t)?.tool ?? null).k).toBe('rmsd');
    expect(rmsCommand.outputs).toEqual([expect.objectContaining({ file: 'xvg', type: 'rmsd', vault: true })]);
    // 2023.3 has the same tool and options.
    expect(parseHelp(text('gmx-2023.3/rms-h.txt')).map(o => o.flag)).toEqual(HELP.map(o => o.flag));
  });
});

// A run on the test system: through the fake gmx (the real 2025.4 output in test/fixtures/r9/rms), or the real one with GMX set.
const REAL = !!process.env.GMX;
const resname = (name: string, tone: 'coral' | 'sky', role: 'reference' | 'selection', value: string): Group => ({ role, name, tone, steps: [{ op: 'add', rule: { kind: 'resname', value } }] });

describe('a run of gmx rms (R9a)', () => {
  it('fitted on sulfate, sulfate and sodium measured: the same numbers as the fixture, the answers in the record', async () => {
    const dir = tmp('rms');
    for (const f of ['nvt.tpr', 'nvt.gro', 'nvt.xtc']) copyFileSync(RUNNER + 'test/fixtures/nvt/' + f, join(dir, f));
    const s = await apiServer({ gmx: { ok: true, name: 'gmx', path: REAL ? process.env.GMX : FAKE_GMX, version: '2025.4' } });
    const req: RunRequest = { tool: 'rms', inputs: { trajectory: join(dir, 'nvt.xtc'), runInput: join(dir, 'nvt.tpr'), structure: join(dir, 'nvt.gro') }, groups: [resname('sulfate', 'coral', 'reference', 'SO4'), resname('sodium', 'sky', 'selection', 'Na')], options: {} };
    const plan = await planRun(s.ctx, req, [dir]);
    expect(plan.argv).toEqual(['rms', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'rms/rms_nvt.ndx', '-o', 'rms/rms_nvt.xvg', '-ng', '2']);
    expect(plan.stdin).toBe('0\n0\n1\n');
    const { job, record } = await startRun(s.ctx, req, [dir]);
    const r = await record;
    expect(job.title).toBe('rms_nvt · sulfate → sodium');
    expect(r).toMatchObject({ status: 'done', analysis: 'rms', stdin: '0\n0\n1\n', problems: [] });
    expect(data(readFileSync(join(dir, 'rms/rms_nvt.xvg'), 'utf8'))).toEqual(data(text('r9/rms/rmsd_nvt.xvg')));
    expect(readdirSync(join(dir, 'rms')).sort()).toEqual(['rms_nvt.ndx', 'rms_nvt.run.json', 'rms_nvt.xvg']);
    expect(recordProblems(r)).toEqual([]);
    await s.close();
  });
});
