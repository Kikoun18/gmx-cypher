import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkSizes } from '../server/check';
import { FAKE_GMX, RUNNER, tmp } from './helpers';

const TPR = RUNNER + 'test/fixtures/nvt/nvt.tpr';
const gmx = { ok: true, name: 'gmx', path: process.env.GMX || FAKE_GMX };
const groups = [
  { name: 'sulfur', atoms: [5, 10, 15, 20, 25, 30] },
  { name: 'water_O', atoms: Array.from({ length: 800 }, (_, i) => 43 + 4 * i) },
  { name: 'sodium', atoms: Array.from({ length: 12 }, (_, i) => 31 + i) },
];

describe('group sizes confirmed by gmx select' + (process.env.GMX ? ' (a real gmx)' : ' (the fake gmx)'), () => {
  it('your test system: sulfur 6, water_O 800, sodium 12; the index and sizes stay in the state folder', async () => {
    const home = tmp('home');
    const c = await checkSizes(gmx, TPR, groups, home);
    expect(c).toMatchObject({ ok: true, problems: [], sizes: [6, 800, 12] });
    const [id] = readdirSync(join(home, 'checks'));
    expect(readdirSync(join(home, 'checks', id)).sort()).toEqual(['groups.ndx', 'sizes.xvg']);
    expect(readFileSync(join(home, 'checks', id, 'groups.ndx'), 'utf8')).toMatch(/^\[ sulfur \]\n   5   10   15   20   25   30\n\[ water_O \]\n  43   47/);
  });

  it('an atom the run input does not have blocks, with gmx\'s own words', async () => {
    const c = await checkSizes(gmx, TPR, [{ name: 'big', atoms: [1, 9999] }], tmp('home'));
    expect(c.ok).toBe(false);
    expect(c.problems[0]).toContain("Group 'big' cannot be used in selections");
  });
});

describe('POST /api/sizes', () => {
  it('counts groups given as ranges, for a run input inside the allowed folders only', async () => {
    const { apiServer } = await import('./helpers');
    const s = await apiServer(), body = { runInput: TPR, groups: [{ name: 'sulfur', atoms: '5-30:5' }, { name: 'sodium', atoms: '31-42' }] };
    expect((await s.call('/api/sizes', body)).status).toBe(403);
    await s.call('/api/config', { allow: [RUNNER + 'test/fixtures/nvt'] });
    expect((await s.call('/api/sizes', body)).json).toMatchObject({ ok: true, problems: [], sizes: [6, 12] });
    expect((await s.call('/api/sizes', { ...body, groups: [{ name: 'water O', atoms: '43' }] })).json).toEqual({ error: 'water O: no spaces: GROMACS reads only the first word of a group name' });
    expect((await s.call('/api/sizes', { ...body, groups: [{ name: 'a', atoms: '1' }, { name: 'A', atoms: '2' }] })).status).toBe(400);
    expect((await s.call('/api/sizes', { ...body, groups: [{ name: 'a', atoms: '1-x' }] })).json).toEqual({ error: 'a: not an atom number or range: 1-x' });
    await s.close();
  });
});
