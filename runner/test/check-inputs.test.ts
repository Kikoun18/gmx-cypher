import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkInputs } from '../server/check';
import { FAKE_GMX, RUNNER, tmp } from './helpers';

const NVT = RUNNER + 'test/fixtures/nvt/';
const gmx = { ok: true, name: 'gmx', path: process.env.GMX || FAKE_GMX };

function system() {
  const dir = tmp('nvt');
  for (const f of ['nvt.tpr', 'nvt.gro', 'nvt.xtc', 'index.ndx']) copyFileSync(NVT + f, join(dir, f));
  return { dir, inputs: { trajectory: join(dir, 'nvt.xtc'), runInput: join(dir, 'nvt.tpr'), structure: join(dir, 'nvt.gro'), index: join(dir, 'index.ndx') } };
}

describe('checking the inputs' + (process.env.GMX ? ' with a real gmx' : ' with the fake gmx'), () => {
  it('your test system: three counts of 3242, the index fits, 21 frames estimated from the run input', async () => {
    const { dir, inputs } = system();
    const c = await checkInputs(inputs, gmx, [dir]);
    expect(c).toMatchObject({ ok: true, problems: [], counts: { structure: 3242, runInput: 3242, trajectory: 3242 }, index: { groups: 7, maxAtom: 3242 }, estimate: { frames: 21, start: 0, end: 20 } });
    expect(c.files.trajectory).toMatchObject({ path: inputs.trajectory, size: 228704 });
  });

  it('blocks a structure of another system, with both numbers', async () => {
    const { dir, inputs } = system();
    writeFileSync(join(dir, 'other.gro'), 'x\n    2\n    1SOL     OW    1   0.0   0.0   0.0\n    1SOL    HW1    2   0.1   0.0   0.0\n   1 1 1\n');
    const c = await checkInputs({ ...inputs, structure: join(dir, 'other.gro') }, gmx, [dir]);
    expect(c.ok).toBe(false);
    expect(c.problems).toEqual(['the structure has 2 atoms, the run input 3242']);
  });

  it('blocks an index that refers to atoms the run input does not have', async () => {
    const { dir, inputs } = system();
    writeFileSync(join(dir, 'big.ndx'), '[ big ]\n 1 2 33584\n');
    expect((await checkInputs({ ...inputs, index: join(dir, 'big.ndx') }, gmx, [dir])).problems).toEqual(['the index refers to atom 33584; the run input has 3242 atoms']);
  });

  it('needs the three inputs, inside the allowed folders', async () => {
    const { dir, inputs } = system();
    const c = await checkInputs({ trajectory: inputs.trajectory }, gmx, [dir]);
    expect(c.problems).toEqual(['no run input', 'no structure']);
    const out = await checkInputs(inputs, gmx, [tmp('elsewhere')]);
    expect(out.problems[0]).toContain('is outside the allowed folders');
  });
});
