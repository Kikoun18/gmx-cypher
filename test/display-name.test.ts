// Display names (R3c, T162): computed from a job's folder and the connected project's path pattern, through the
// Matrix's own parsePath; today's title when nothing matches; names that collide told apart by a folder, else the time.
import { describe, expect, it } from 'vitest';
import { displayName, displayNames, type Naming } from '../src/lib/displayName';

const pg: Naming = { project: 'p1', pathPattern: '{method}/{column}/{name}/{*}/{run}', columns: [{ k: 'SO4', label: 'sulfate' }, { k: 'pg', label: 'PG' }] };
const job = (over: Partial<{ id: string; title: string; kind: string; cwd: string; created: string; meta: Record<string, unknown> }>) => ({ id: 'j1', title: 'rdf_nvt · sulfur → water_O', kind: 'rdf', cwd: '/home/me/sims/hmr+fast+6/so4/NA2SO4/9.multiwalker/1', created: '2026-10-19T18:02:00.000Z', ...over });
const utc = (iso: string, seconds: boolean) => iso.slice(11, seconds ? 19 : 16);

describe('a job named from its folder by the project pattern', () => {
  it.each([
    ['row · column (its label) · run · command', job({}), pg, 'NA2SO4 · sulfate · run a · rdf'],
    ['a column the project does not have keeps its folder name', job({ cwd: '/s/hmr+fast+6/cl/NACL/9.multiwalker/2' }), pg, 'NACL · cl · run b · rdf'],
    ['a sequence when the pattern names one', job({ kind: 'awh', cwd: '/data/WRWYCR/ha/walker/3' }), { project: 'p2', pathPattern: '{seq}/{column}/{*}/{run}', columns: [{ k: 'ha', label: 'HA' }] }, 'WRWYCR · HA · run c · awh'],
    ['no run in the pattern: none in the name', job({ cwd: '/x/pg/Methionine' }), { project: 'p3', pathPattern: '{column}/{name}', columns: pg.columns }, 'Methionine · PG · rdf'],
    ['a folder the pattern does not match: today\'s title', job({ cwd: '/home/me/scratch' }), pg, 'rdf_nvt · sulfur → water_O'],
    ['no connected project: today\'s title', job({}), null, 'rdf_nvt · sulfur → water_O'],
    ['a project without a path pattern: today\'s title', job({}), { ...pg, pathPattern: '' }, 'rdf_nvt · sulfur → water_O'],
    ['a match that names no row: today\'s title', job({ cwd: '/s/a/b/c/1' }), { project: 'p4', pathPattern: '{column}/{*}/{run}', columns: [] }, 'rdf_nvt · sulfur → water_O'],
  ])('%s', (_, j, n, name) => expect(displayName(j, n)).toBe(name));
});

describe('names that collide are told apart', () => {
  it('by the shortest folder that differs', () => {
    const a = job({ id: 'a', cwd: '/s/hmr+fast+6/so4/NA2SO4/9.multiwalker/1' }), b = job({ id: 'b', cwd: '/s/hmr+fast+6/so4/NA2SO4/10.multiwalker/1' });
    expect([...displayNames([a, b], pg, utc).values()]).toEqual(['NA2SO4 · sulfate · run a · rdf · 9.multiwalker', 'NA2SO4 · sulfate · run a · rdf · 10.multiwalker']);
  });
  it('by the time they were started when their folders are the same (five rdf_07_md jobs)', () => {
    const jobs = ['18:02', '18:05', '18:07'].map((t, i) => job({ id: 'j' + i, cwd: '/home/me/scratch/07_md', title: 'rdf_07_md · sulfur → water_O', created: '2026-10-19T' + t + ':00.000Z' }));
    expect([...displayNames(jobs, pg, utc).values()]).toEqual(['rdf_07_md · sulfur → water_O · 18:02', 'rdf_07_md · sulfur → water_O · 18:05', 'rdf_07_md · sulfur → water_O · 18:07']);
  });
  it('with seconds when the minute is the same too; names that differ are left alone', () => {
    const jobs = [job({ id: 'x', created: '2026-10-19T18:02:10.000Z' }), job({ id: 'y', created: '2026-10-19T18:02:40.000Z' }), job({ id: 'z', kind: 'rmsf' })];
    expect([...displayNames(jobs, pg, utc).values()]).toEqual(['NA2SO4 · sulfate · run a · rdf · 18:02:10', 'NA2SO4 · sulfate · run a · rdf · 18:02:40', 'NA2SO4 · sulfate · run a · rmsf']);
  });
  it('by their file stems when they started in the same second (a batch, or two clicks)', () => {
    const jobs = ['rdf_nvt', 'rdf_nvt (2)'].map((stem, i) => job({ id: 'j' + i, meta: { stem } }));
    expect([...displayNames(jobs, pg, utc).values()]).toEqual(['NA2SO4 · sulfate · run a · rdf · rdf_nvt', 'NA2SO4 · sulfate · run a · rdf · rdf_nvt (2)']);
  });
});
