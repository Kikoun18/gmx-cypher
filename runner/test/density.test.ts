import { copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { densityCommand, formHelp, roleProblems } from '../src/lib/commands';
import { DENSITY_FORM, densityArgv, densityOptionProblems, densityStdin } from '../src/lib/density';
import { parseHelp } from '../src/lib/gmxText';
import type { Group } from '../src/lib/groups';
import { resultSeries } from '../src/lib/rdf';
import { detectAna, getAnalyses, parseTable } from '../../matrix/src/lib/seq';
import { parseGmxHeader } from '../../matrix/src/lib/gmxHeader';
import { planRun, startRun, type RunRequest } from '../server/runs';
import { apiServer, FAKE_GMX, RUNNER, tmp } from './helpers';

// gmx density (R16a), with GROMACS 2025.4's own outputs on the test system (test/fixtures/r16/density): the mass and
// number densities of sodium and water along z, and centred on sodium, plain and symmetrised.
const FIX = new URL('./fixtures/', import.meta.url), text = (p: string) => readFileSync(new URL(p, FIX), 'utf8');
const HELP = parseHelp(text('gmx-2025.4/density-h.txt'));
const io = { trajectory: 'nvt.xtc', runInput: 'nvt.tpr', index: 'density/d.ndx', output: 'density/d.xvg' };
const data = (t: string) => t.split('\n').filter(l => l && !'#@'.includes(l[0]));
const type = (t: string, name: string) => detectAna(getAnalyses(null), name, parseTable(t).head, parseGmxHeader(t)?.tool ?? null).k;

describe('gmx density (R16a): one curve per group, the groups on stdin', () => {
  it('table: the arguments and the answers on stdin, with and without centring', () => {
    const cases: [Record<string, string | boolean>, number, string[], string][] = [
      [{}, 0, [], '0\n'],
      [{}, 1, ['-ng', '2'], '0\n1\n'],
      [{ d: 'X', sl: '100', dens: 'number' }, 1, ['-ng', '2', '-d', 'X', '-sl', '100', '-dens', 'number'], '0\n1\n'],
      // Centring (or symmetrising, which centres too): gmx asks for the centre's group first; it is the first group.
      [{ center: true }, 1, ['-ng', '2', '-center'], '0\n0\n1\n'],
      [{ symm: true }, 2, ['-ng', '3', '-symm'], '0\n0\n1\n2\n'],
      [{ dens: 'electron', ei: '/sims/electrons.dat' }, 0, ['-ei', '/sims/electrons.dat', '-dens', 'electron'], '0\n'],
    ];
    for (const [options, selections, extra, stdin] of cases) {
      expect(densityArgv({ options, selections }, io, HELP)).toEqual(['density', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'density/d.ndx', '-o', 'density/d.xvg', ...extra]);
      expect(densityStdin(selections, options)).toBe(stdin);
    }
  });

  it('its refusals: the axis, the slices, electron density only with an electrons file', () => {
    expect(densityOptionProblems({ d: 'Q' }, HELP)).toEqual(['-d: X, Y or Z']);
    expect(densityOptionProblems({ sl: '0' }, HELP)).toEqual(['-sl must be above 0']);
    expect(densityOptionProblems({ sl: '2.5' }, HELP)).toEqual(['-sl: a whole number, 0 or more']);
    expect(densityOptionProblems({ dens: 'electron' }, HELP)).toEqual(['electron density needs an electrons file (-ei): the number of electrons of each atom name']);
    expect(densityOptionProblems({ ei: '/sims/e.dat' }, HELP)).toEqual(['an electrons file is read only for electron density: choose it, or clear the file']);
    expect(densityOptionProblems({ dens: 'electron', ei: 'e.dat' }, HELP)).toEqual(['-ei: the whole path of the electrons file (gmx runs in the output\'s folder)']);
    expect(densityOptionProblems({ dens: 'charge', d: 'z' }, HELP)).toEqual([]);
    expect(roleProblems(densityCommand, 1)).toEqual([]);
    expect(() => densityArgv({ options: { w: true }, selections: 0 }, io, HELP)).toThrow('-w is not an option gmx-cypher sets for density');
  });

  it('electron density is offered only once an electrons file is given', () => {
    const dens = DENSITY_FORM.find(f => f.flag === 'dens')!
    expect(dens.only).toEqual({ electron: 'ei' });
    // -ei is a file to gmx; the form shows it as one, wide.
    expect(formHelp(DENSITY_FORM, HELP).find(o => o.flag === 'ei')).toMatchObject({ type: 'file', section: 'input' });
  });

  it('its file: Density in the Matrix, every curve read; the units as gmx writes them', () => {
    for (const f of ['density_mass', 'density_number', 'density_center', 'density_symm']) expect(type(text('r16/density/' + f + '.xvg'), f + '.xvg')).toBe('density');
    expect(resultSeries(text('r16/density/density_mass.xvg')).map(c => [c.label, c.points.length])).toEqual([['sodium', 50], ['water', 50]]);
    // gmx writes "Number density (nm\S-3\N)"; the Matrix reads its superscript.
    expect(parseTable(text('r16/density/density_number.xvg')).head).toMatchObject({ yLabel: 'Number density (nm^{-3})' });
    // Centred: from −box/2 to +box/2.
    expect(resultSeries(text('r16/density/density_center.xvg'))[0].points[0][0]).toBeCloseTo(-1.715);
    expect(parseHelp(text('gmx-2023.3/density-h.txt')).map(o => o.flag)).toEqual(HELP.map(o => o.flag));
  });
});

const REAL = !!process.env.GMX;
const resname = (name: string, tone: 'coral' | 'sky', role: 'reference' | 'selection', value: string): Group => ({ role, name, tone, steps: [{ op: 'add', rule: { kind: 'resname', value } }] });

describe('a run of gmx density (R16a)', () => {
  it('sodium and water along z: the numbers of the fixture', async () => {
    const dir = tmp('density');
    for (const f of ['nvt.tpr', 'nvt.gro', 'nvt.xtc']) copyFileSync(RUNNER + 'test/fixtures/nvt/' + f, join(dir, f));
    const s = await apiServer({ gmx: { ok: true, name: 'gmx', path: REAL ? process.env.GMX : FAKE_GMX, version: '2025.4' } });
    const req: RunRequest = { tool: 'density', inputs: { trajectory: join(dir, 'nvt.xtc'), runInput: join(dir, 'nvt.tpr'), structure: join(dir, 'nvt.gro') },
      groups: [resname('sodium', 'coral', 'reference', 'Na'), resname('water', 'sky', 'selection', 'SOL')], options: {} };
    const plan = await planRun(s.ctx, req, [dir]);
    expect(plan.argv).toEqual(['density', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'density/density_nvt.ndx', '-o', 'density/density_nvt.xvg', '-ng', '2']);
    const r = await (await startRun(s.ctx, req, [dir])).record;
    expect(r).toMatchObject({ status: 'done', analysis: 'density', stdin: '0\n1\n', problems: [] });
    expect(data(readFileSync(join(dir, 'density/density_nvt.xvg'), 'utf8'))).toEqual(data(text('r16/density/density_mass.xvg')));
    expect(readdirSync(join(dir, 'density')).sort()).toEqual(['density_nvt.ndx', 'density_nvt.run.json', 'density_nvt.xvg']);
    await s.close();
  });
});
