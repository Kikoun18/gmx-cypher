import { copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gyrateCommand, gyrateLegacyCommand, roleProblems } from '../src/lib/commands';
import { parseHelp } from '../src/lib/gmxText';
import type { Group } from '../src/lib/groups';
import { gyrateArgv, gyrateKind, gyrateLegacyArgv, gyrateLegacyStdin } from '../src/lib/gyrate';
import { resultSeries } from '../src/lib/rdf';
import { detectAna, getAnalyses, parseTable } from '../../app/src/lib/seq';
import { parseGmxHeader } from '../../app/src/lib/gmxHeader';
import { planRun, startRun, type RunRequest } from '../server/runs';
import { apiServer, FAKE_GMX, RUNNER, tmp } from './helpers';

const FIX = new URL('./fixtures/', import.meta.url), text = (p: string) => readFileSync(new URL(p, FIX), 'utf8');
const help = (p: string) => parseHelp(text(p));
const NEW = help('gmx-2025.4/gyrate-h.txt'), LEGACY = help('gmx-2025.4/gyrate-legacy-h.txt');
const io = { trajectory: 'nvt.xtc', runInput: 'nvt.tpr', index: 'gyrate/g.ndx', output: 'gyrate/g.xvg' };
const data = (t: string) => t.split('\n').filter(l => l && !'#@'.includes(l[0]));
const numbers = (t: string) => data(t).map(l => l.trim().split(/\s+/).map(Number));

describe('which gyrate tool a gmx has (R9c): read from its -h', () => {
  it.each<[string, string, 'selection' | 'legacy' | null]>([
    ['2025.4 gmx gyrate', 'gmx-2025.4/gyrate-h.txt', 'selection'],
    ['2025.4 gmx gyrate-legacy', 'gmx-2025.4/gyrate-legacy-h.txt', 'legacy'],
    ['2023.3 gmx gyrate (the legacy tool under the old name)', 'gmx-2023.3/gyrate-h.txt', 'legacy'],
    ['gmx rdf', 'gmx-2025.4/rdf-h.txt', null],
  ])('%s → %s', (_, file, kind) => {
    expect(gyrateKind(help(file))).toBe(kind);
  });

  it('2023.3 has no gyrate-legacy', () => {
    expect(text('gmx-2023.3/gyrate-legacy.stderr')).toMatch(/'gyrate-legacy' is not a GROMACS command/);
    expect(text('gmx-2025.4/help-commands.txt')).toMatch(/^\s+gyrate-legacy\s/m);
  });
});

describe('the two tools, each with its own options (R9c)', () => {
  it('the selection tool: the group by number as its one selection', () => {
    expect(gyrateArgv({ options: {} }, io, NEW)).toEqual(['gyrate', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'gyrate/g.ndx', '-o', 'gyrate/g.xvg', '-sel', 'group 0']);
    expect(gyrateArgv({ options: { mode: 'geometry' } }, io, NEW).slice(-4)).toEqual(['-mode', 'geometry', '-sel', 'group 0']);
    expect(() => gyrateArgv({ options: { q: true } }, io, NEW)).toThrow('-q is not an option gmx-cypher sets for gyrate');
  });

  it('the legacy tool: the group on stdin', () => {
    expect(gyrateLegacyArgv({ options: { q: true } }, io, LEGACY)).toEqual(['gyrate-legacy', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'gyrate/g.ndx', '-o', 'gyrate/g.xvg', '-q']);
    expect(gyrateLegacyStdin()).toBe('0\n');
    expect(() => gyrateLegacyArgv({ options: { mode: 'mass' } }, io, LEGACY)).toThrow('-mode is not an option gmx-cypher sets for gyrate-legacy');
  });

  it('one group each', () => {
    expect(roleProblems(gyrateCommand, 2)).toEqual(['gmx gyrate takes one group: remove the other one']);
    expect(roleProblems(gyrateLegacyCommand, 1)).toEqual([]);
  });

  it('on one sulfate ion they agree to the last digit; on all six they do not (real 2025.4): never mixed', () => {
    const one = [numbers(text('r9/gyrate-one/new.xvg')), numbers(text('r9/gyrate-one/old.xvg'))];
    expect(one[0].length).toBe(21);
    one[0].forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(one[1][i][j], 4)));
    const six = [numbers(text('r9/gyrate/gyrate_nvt.xvg'))[0][1], numbers(text('r9/gyrate-legacy/gyrate_nvt.xvg'))[0][1]];
    expect(six).toEqual([1.48948, 1.54799]);
  });

  it('both write the total and the three axes; PMF Sequences types both Rg and reads the total', () => {
    for (const f of ['r9/gyrate/gyrate_nvt.xvg', 'r9/gyrate-legacy/gyrate_nvt.xvg']) {
      const t = text(f);
      expect(resultSeries(t)).toHaveLength(4);
      expect(detectAna(getAnalyses(null), 'gyrate_nvt.xvg', parseTable(t).head, parseGmxHeader(t)?.tool ?? null).k).toBe('rg');
    }
  });
});

const REAL = !!process.env.GMX;
const FAKE_2023 = RUNNER + 'test/fake-gmx-2023.mjs';
const sulfate: Group = { role: 'reference', name: 'sulfate', tone: 'coral', steps: [{ op: 'add', rule: { kind: 'resname', value: 'SO4' } }] };

async function setup(tool: string, gmx = FAKE_GMX) {
  const dir = tmp('gyrate');
  for (const f of ['nvt.tpr', 'nvt.gro', 'nvt.xtc']) copyFileSync(RUNNER + 'test/fixtures/nvt/' + f, join(dir, f));
  const s = await apiServer({ gmx: { ok: true, name: 'gmx', path: REAL && gmx === FAKE_GMX ? process.env.GMX : gmx, version: gmx === FAKE_2023 ? '2023.3' : '2025.4' } });
  const req: RunRequest = { tool, inputs: { trajectory: join(dir, 'nvt.xtc'), runInput: join(dir, 'nvt.tpr'), structure: join(dir, 'nvt.gro') }, groups: [sulfate], options: {} };
  return { dir, s, req };
}

describe('a run of gmx gyrate (R9c)', () => {
  it('2025.4: the selection tool; the numbers of the fixture; the legacy command is not offered beside it', async () => {
    const { dir, s, req } = await setup('gyrate');
    const { record } = await startRun(s.ctx, req, [dir]);
    expect(await record).toMatchObject({ status: 'done', analysis: 'gyrate', problems: [] });
    expect(data(readFileSync(join(dir, 'gyrate/gyrate_nvt.xvg'), 'utf8'))).toEqual(data(text('r9/gyrate/gyrate_nvt.xvg')));
    await expect(planRun(s.ctx, { ...req, tool: 'gyrate-legacy' }, [dir])).rejects.toMatchObject({ status: 409, message: expect.stringContaining('offered only without it') });
    await s.close();
  });

  it.skipIf(REAL)('2023.3: the legacy command runs gmx gyrate, the group on stdin', async () => {
    const { dir, s, req } = await setup('gyrate-legacy', FAKE_2023);
    const { json } = await s.call<{ tool: string; ok: boolean; gmxTool?: string }[]>('/api/commands');
    expect(json.filter(c => c.tool.startsWith('gyrate'))).toEqual([{ tool: 'gyrate', ok: false, why: expect.stringContaining('legacy tool') }, { tool: 'gyrate-legacy', ok: true, gmxTool: 'gyrate' }]);
    const plan = await planRun(s.ctx, req, [dir]);
    expect(plan).toMatchObject({ gmxTool: 'gyrate', stdin: '0\n' });
    expect(plan.argv.slice(0, 1)).toEqual(['gyrate']);
    const r = await (await startRun(s.ctx, req, [dir])).record;
    expect(r).toMatchObject({ status: 'done', analysis: 'gyrate-legacy', stdin: '0\n', problems: [] });
    expect(r.command.args[0]).toBe('gyrate');
    await s.close();
  });
});
