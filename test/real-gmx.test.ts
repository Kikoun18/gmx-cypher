// Runs only with GMX=<path to a real gmx>; listed as run or not run in the report.
import { describe, expect, it } from 'vitest';
import { detectGmx } from '../server/gmx';

const GMX = process.env.GMX;

describe.skipIf(!GMX)('a real gmx (GMX=' + (GMX || 'unset') + ')', () => {
  it('answers --version with a GROMACS version', async () => {
    const g = await detectGmx(GMX!, '');
    expect(g.ok).toBe(true);
    expect(g.version).toMatch(/^20\d\d\.\d/);
  });
});
