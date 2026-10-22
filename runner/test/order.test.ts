import { copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { orderCommand, roleProblems } from '../src/lib/commands';
import { parseHelp } from '../src/lib/gmxText';
import type { Group } from '../src/lib/groups';
import { ORDER_FORM, orderArgv, orderNames, orderOptionProblems, scdByCarbon } from '../src/lib/order';
import { detectAna, getAnalyses, parseTable } from '../../matrix/src/lib/seq';
import { parseGmxHeader } from '../../matrix/src/lib/gmxHeader';
import { planRun, startRun, type RunRequest } from '../server/runs';
import { apiServer, FAKE_GMX, RUNNER, tmp } from './helpers';

// gmx order (R16b), with GROMACS 2025.4's own outputs (test/fixtures/r16/order). No membrane sample has come: the three
// "carbons" are O1, S1 and O2 of each sulfate of the test system, so the files are real in every byte and the numbers
// mean nothing. Its help, identical in 2023.3: "This tool only works for saturated carbons and united atom force fields".
const FIX = new URL('./fixtures/', import.meta.url), text = (p: string) => readFileSync(new URL(p, FIX), 'utf8');
const HELP = parseHelp(text('gmx-2025.4/order-h.txt'));
const io = { trajectory: 'nvt.xtc', runInput: 'nvt.tpr', index: 'order/o.ndx', output: 'order/o.xvg', tensor: 'order/o_tensor.xvg' };
const data = (t: string) => t.split('\n').filter(l => l && !'#@'.includes(l[0]));
const type = (t: string, name: string) => detectAna(getAnalyses(null), name, parseTable(t).head, parseGmxHeader(t)?.tool ?? null).k;

describe('gmx order (R16b): the carbons in tail order, one group each, read from the index gmx-cypher writes', () => {
  it('its arguments: S_CD (-od) the result, the order tensor (-o) beside it; nothing on stdin', () => {
    expect(orderArgv({ options: {} }, io, HELP)).toEqual(['order', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'order/o.ndx', '-o', 'order/o_tensor.xvg', '-od', 'order/o.xvg']);
    expect(orderArgv({ options: { d: 'x', b: '2' } }, io, HELP)).toEqual(['order', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'order/o.ndx', '-o', 'order/o_tensor.xvg', '-od', 'order/o.xvg', '-b', '2', '-d', 'x']);
    expect(orderCommand.stdin).toBeUndefined();
    expect(orderNames('o')).toEqual({ xvg: 'o.xvg', ndx: 'o.ndx', record: 'o.run.json', more: ['o_tensor.xvg'] });
  });

  it('its refusals: three carbons at least; -szonly is not offered (gmx then writes no S_CD)', () => {
    expect(roleProblems(orderCommand, 2)).toEqual(['a carbon and at least 2 carbons are needed']);
    expect(roleProblems(orderCommand, 3)).toEqual([]);
    expect(ORDER_FORM.map(f => f.flag)).not.toContain('szonly');
    expect(() => orderArgv({ options: { szonly: true } }, io, HELP)).toThrow('-szonly is not an option gmx-cypher sets for order');
    expect(orderOptionProblems({ d: 'q' }, HELP)).toEqual(['-d: one of z, x, y']);
  });

  it('its files: S_CD is Order parameters in the Matrix; the tensor is general Data, not sent', () => {
    expect(type(text('r16/order/order_scd.xvg'), 'order_nvt.xvg')).toBe('order');
    expect(type(text('r16/order/order_tensor.xvg'), 'order_nvt_tensor.xvg')).toBe('data');
    expect(orderCommand.outputs).toEqual([
      expect.objectContaining({ file: 'xvg', type: 'order', vault: true }),
      expect.objectContaining({ file: 'tensor', type: null, vault: false }),
    ]);
    expect(parseHelp(text('gmx-2023.3/order-h.txt')).map(o => o.flag)).toEqual(HELP.map(o => o.flag));
  });

  it('S_CD by carbon: gmx gives the carbons between the first and the last, numbered from 1; named by their groups', () => {
    expect(scdByCarbon(text('r16/order/order_scd.xvg'), ['C1', 'C2', 'C3'])).toEqual([{ carbon: 'C2', n: 1, scd: 0.0286177 }]);
    // A file with more rows than inner carbons keeps gmx's number.
    expect(scdByCarbon(text('r16/order/order_scd.xvg'), ['C1', 'C2'])).toEqual([{ carbon: 'carbon 1', n: 1, scd: 0.0286177 }]);
  });
});

const REAL = !!process.env.GMX;
const names = (name: string, tone: 'coral' | 'sky' | 'mint', role: 'reference' | 'selection', value: string): Group => ({ role, name, tone, steps: [{ op: 'add', rule: { kind: 'name', value, resn: 'SO4' } }] });

describe('a run of gmx order (R16b)', () => {
  it('three groups in order: S_CD for the middle one, the fixture\'s numbers', async () => {
    const dir = tmp('order');
    for (const f of ['nvt.tpr', 'nvt.gro', 'nvt.xtc']) copyFileSync(RUNNER + 'test/fixtures/nvt/' + f, join(dir, f));
    const s = await apiServer({ gmx: { ok: true, name: 'gmx', path: REAL ? process.env.GMX : FAKE_GMX, version: '2025.4' } });
    const req: RunRequest = { tool: 'order', inputs: { trajectory: join(dir, 'nvt.xtc'), runInput: join(dir, 'nvt.tpr'), structure: join(dir, 'nvt.gro') },
      groups: [names('C1', 'coral', 'reference', 'O1'), names('C2', 'sky', 'selection', 'S1'), names('C3', 'mint', 'selection', 'O2')], options: {} };
    const plan = await planRun(s.ctx, req, [dir]);
    expect(plan.argv).toEqual(['order', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'order/order_nvt.ndx', '-o', 'order/order_nvt_tensor.xvg', '-od', 'order/order_nvt.xvg']);
    const r = await (await startRun(s.ctx, req, [dir])).record;
    expect(r).toMatchObject({ status: 'done', analysis: 'order', problems: [] });
    expect(data(readFileSync(join(dir, 'order/order_nvt.xvg'), 'utf8'))).toEqual(data(text('r16/order/order_scd.xvg')));
    expect(data(readFileSync(join(dir, 'order/order_nvt_tensor.xvg'), 'utf8'))).toEqual(data(text('r16/order/order_tensor.xvg')));
    expect(readdirSync(join(dir, 'order')).sort()).toEqual(['order_nvt.ndx', 'order_nvt.run.json', 'order_nvt.xvg', 'order_nvt_tensor.xvg']);
    await s.close();
  });
});
