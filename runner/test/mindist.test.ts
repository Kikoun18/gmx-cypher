import { copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mindistCommand, roleProblems } from '../src/lib/commands';
import { parseHelp } from '../src/lib/gmxText';
import type { Group } from '../src/lib/groups';
import { mindistArgv, mindistNames, mindistOptionProblems, mindistStdin } from '../src/lib/mindist';
import { resultSeries } from '../src/lib/rdf';
import { detectAna, getAnalyses, parseTable } from '../../matrix/src/lib/seq';
import { parseGmxHeader } from '../../matrix/src/lib/gmxHeader';
import { planRun, startRun, type RunRequest } from '../server/runs';
import { apiServer, FAKE_GMX, RUNNER, tmp } from './helpers';

const FIX = new URL('./fixtures/', import.meta.url), text = (p: string) => readFileSync(new URL(p, FIX), 'utf8');
const HELP = parseHelp(text('gmx-2025.4/mindist-h.txt'));
const io = { trajectory: 'nvt.xtc', runInput: 'nvt.tpr', index: 'mindist/m.ndx', output: 'mindist/m.xvg', contacts: 'mindist/m_contacts.xvg' };
const data = (t: string) => t.split('\n').filter(l => l && !'#@'.includes(l[0]));
const type = (t: string, name: string) => detectAna(getAnalyses(null), name, parseTable(t).head, parseGmxHeader(t)?.tool ?? null).k;

describe('gmx mindist (R9d): the reference, then each group, on stdin', () => {
  it('one group: no -ng; more: -ng and an answer each; contacts only when asked', () => {
    expect(mindistArgv({ options: {}, selections: 1 }, io, HELP)).toEqual(['mindist', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'mindist/m.ndx', '-od', 'mindist/m.xvg']);
    expect(mindistStdin(1)).toBe('0\n1\n');
    expect(mindistArgv({ options: { contacts: true, d: '0.35', group: true }, selections: 2 }, io, HELP)).toEqual([
      'mindist', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'mindist/m.ndx', '-od', 'mindist/m.xvg', '-on', 'mindist/m_contacts.xvg', '-ng', '2', '-d', '0.35', '-group',
    ]);
    expect(mindistStdin(2)).toBe('0\n1\n2\n');
  });

  it('its refusals and its groups', () => {
    expect(mindistOptionProblems({ d: '0' }, HELP)).toEqual(['-d must be above 0']);
    expect(mindistOptionProblems({ d: 'x' }, HELP)).toEqual(['-d: not a number: x']);
    expect(roleProblems(mindistCommand, 1)).toEqual(['a reference and at least one group are needed']);
    expect(roleProblems(mindistCommand, 5)).toEqual([]);
    expect(() => mindistArgv({ options: { pi: true }, selections: 1 }, io, HELP)).toThrow('-pi is not an option gmx-cypher sets for mindist');
  });

  it('its files: the distances for the vault (Distance), the contacts beside them (general Data in the Matrix)', () => {
    expect(mindistNames('m', {})).toEqual({ xvg: 'm.xvg', ndx: 'm.ndx', record: 'm.run.json' });
    expect(mindistNames('m', { contacts: true }).more).toEqual(['m_contacts.xvg']);
    expect(type(text('r9/mindist/mindist_nvt.xvg'), 'mindist_nvt.xvg')).toBe('dist');
    // Before batch 3 the Matrix left it unknown ('') and asked for a type; now it files it as general Data.
    expect(type(text('r9/mindist/mindist_nvt_numcont.xvg'), 'mindist_nvt_contacts.xvg')).toBe('data');
    // Its numbers are in e-notation; one curve per group, named "reference-group".
    expect(resultSeries(text('r9/mindist/mindist_nvt.xvg')).map(c => [c.label, c.points.length, c.points[0][1]])).toEqual([['sulfate-sodium', 21, 0.4532218], ['sulfate-water', 21, 0.1777329]]);
    expect(parseHelp(text('gmx-2023.3/mindist-h.txt')).map(o => o.flag)).toEqual(HELP.map(o => o.flag));
  });
});

const REAL = !!process.env.GMX;
const resname = (name: string, tone: 'coral' | 'sky' | 'mint', role: 'reference' | 'selection', value: string): Group => ({ role, name, tone, steps: [{ op: 'add', rule: { kind: 'resname', value } }] });

describe('a run of gmx mindist (R9d)', () => {
  it('sulfate to sodium and to water, with contacts: the numbers of the fixture', async () => {
    const dir = tmp('mindist');
    for (const f of ['nvt.tpr', 'nvt.gro', 'nvt.xtc']) copyFileSync(RUNNER + 'test/fixtures/nvt/' + f, join(dir, f));
    const s = await apiServer({ gmx: { ok: true, name: 'gmx', path: REAL ? process.env.GMX : FAKE_GMX, version: '2025.4' } });
    const req: RunRequest = { tool: 'mindist', inputs: { trajectory: join(dir, 'nvt.xtc'), runInput: join(dir, 'nvt.tpr'), structure: join(dir, 'nvt.gro') },
      groups: [resname('sulfate', 'coral', 'reference', 'SO4'), resname('sodium', 'sky', 'selection', 'Na'), resname('water', 'mint', 'selection', 'SOL')], options: { contacts: true } };
    const plan = await planRun(s.ctx, req, [dir]);
    expect(plan.argv).toEqual(['mindist', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'mindist/mindist_nvt.ndx', '-od', 'mindist/mindist_nvt.xvg', '-on', 'mindist/mindist_nvt_contacts.xvg', '-ng', '2']);
    const r = await (await startRun(s.ctx, req, [dir])).record;
    expect(r).toMatchObject({ status: 'done', analysis: 'mindist', stdin: '0\n1\n2\n', problems: [] });
    expect(r.outputs.map(o => o.path.split('/').pop())).toEqual(['mindist_nvt_contacts.xvg', 'mindist_nvt.xvg', 'mindist_nvt.ndx']);
    expect(data(readFileSync(join(dir, 'mindist/mindist_nvt.xvg'), 'utf8'))).toEqual(data(text('r9/mindist/mindist_nvt.xvg')));
    expect(data(readFileSync(join(dir, 'mindist/mindist_nvt_contacts.xvg'), 'utf8'))).toEqual(data(text('r9/mindist/mindist_nvt_numcont.xvg')));
    expect(readdirSync(join(dir, 'mindist'))).toHaveLength(4);
    await s.close();
  });
});
