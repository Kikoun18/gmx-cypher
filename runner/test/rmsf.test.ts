import { copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { roleProblems, rmsfCommand } from '../src/lib/commands';
import { parseHelp } from '../src/lib/gmxText';
import type { Group } from '../src/lib/groups';
import { rmsfArgv, rmsfOptionProblems, rmsfStdin } from '../src/lib/rmsf';
import { detectAna, getAnalyses, parseTable } from '../../app/src/lib/seq';
import { parseGmxHeader } from '../../app/src/lib/gmxHeader';
import { planRun, startRun, type RunRequest } from '../server/runs';
import { apiServer, FAKE_GMX, RUNNER, tmp } from './helpers';

const FIX = new URL('./fixtures/', import.meta.url), text = (p: string) => readFileSync(new URL(p, FIX), 'utf8');
const HELP = parseHelp(text('gmx-2025.4/rmsf-h.txt'));
const io = { trajectory: 'nvt.xtc', runInput: 'nvt.tpr', index: 'rmsf/r.ndx', output: 'rmsf/r.xvg' };
const data = (t: string) => t.split('\n').filter(l => l && !'#@'.includes(l[0]));

describe('gmx rmsf (R9b): one group, on stdin', () => {
  it('per atom by default, per residue with -res; fitted unless -nofit', () => {
    expect(rmsfArgv({ options: {} }, io, HELP)).toEqual(['rmsf', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'rmsf/r.ndx', '-o', 'rmsf/r.xvg']);
    expect(rmsfArgv({ options: { res: true, fit: false } }, io, HELP).slice(-2)).toEqual(['-res', '-nofit']);
    expect(rmsfStdin()).toBe('0\n');
    expect(rmsfOptionProblems({ dt: '-1' }, HELP)).toEqual(['-dt must be 0 or more']);
  });

  it('one group only: another is refused in words', () => {
    expect(roleProblems(rmsfCommand, 1)).toEqual([]);
    expect(roleProblems(rmsfCommand, 2)).toEqual(['gmx rmsf takes one group: remove the other one']);
    expect(roleProblems(rmsfCommand, 3)).toEqual(['gmx rmsf takes one group: remove the other 2']);
  });

  it('its x is the atom number in the system (or the residue number): PMF Sequences types it RMSF and labels x "Residue"', () => {
    for (const f of ['r9/rmsf/rmsf_nvt.xvg', 'r9/rmsf-res/rmsf_nvt.xvg']) {
      const t = text(f);
      expect(detectAna(getAnalyses(null), 'rmsf_nvt.xvg', parseTable(t).head, parseGmxHeader(t)?.tool ?? null).k).toBe('rmsf');
    }
    expect(data(text('r9/rmsf/rmsf_nvt.xvg'))).toHaveLength(30);
    expect(data(text('r9/rmsf-res/rmsf_nvt.xvg')).map(l => l.trim().split(/\s+/)[0])).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(parseHelp(text('gmx-2023.3/rmsf-h.txt')).map(o => o.flag)).toEqual(HELP.map(o => o.flag));
  });
});

const REAL = !!process.env.GMX;
const sulfate: Group = { role: 'reference', name: 'sulfate', tone: 'coral', steps: [{ op: 'add', rule: { kind: 'resname', value: 'SO4' } }] };

describe('a run of gmx rmsf (R9b)', () => {
  it.each([[{}, 'rmsf'], [{ res: true }, 'rmsf-res']] as const)('%o: the numbers of the fixture, the group answered on stdin', async (options, fixture) => {
    const dir = tmp('rmsf');
    for (const f of ['nvt.tpr', 'nvt.gro', 'nvt.xtc']) copyFileSync(RUNNER + 'test/fixtures/nvt/' + f, join(dir, f));
    const s = await apiServer({ gmx: { ok: true, name: 'gmx', path: REAL ? process.env.GMX : FAKE_GMX, version: '2025.4' } });
    const req: RunRequest = { tool: 'rmsf', inputs: { trajectory: join(dir, 'nvt.xtc'), runInput: join(dir, 'nvt.tpr'), structure: join(dir, 'nvt.gro') }, groups: [sulfate], options };
    expect((await planRun(s.ctx, req, [dir])).stdin).toBe('0\n');
    const { job, record } = await startRun(s.ctx, req, [dir]);
    expect(job.title).toBe('rmsf_nvt · sulfate');
    expect(await record).toMatchObject({ status: 'done', analysis: 'rmsf', stdin: '0\n', problems: [] });
    expect(data(readFileSync(join(dir, 'rmsf/rmsf_nvt.xvg'), 'utf8'))).toEqual(data(text('r9/' + fixture + '/rmsf_nvt.xvg')));
    // A second group is refused before anything runs.
    await expect(startRun(s.ctx, { ...req, groups: [sulfate, { ...sulfate, role: 'selection', name: 'again' }] }, [dir])).rejects.toMatchObject({ status: 400, message: 'gmx rmsf takes one group: remove the other one' });
    await s.close();
  });
});
