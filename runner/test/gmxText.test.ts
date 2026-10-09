import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { frameEstimate, parseCheckAtoms, parseDump, parseSizes, parseVersion } from '../src/lib/gmxText';

const fixture = (p: string) => readFileSync(new URL('./fixtures/' + p, import.meta.url), 'utf8');

describe('gmx --version', () => {
  it('reads the version line of real GROMACS output', () => {
    expect(parseVersion(fixture('gmx-2025.4/version.txt'))).toBe('2025.4-PLUMED_spack');
    expect(parseVersion(fixture('gmx-2023.3/version.txt'))).toBe('2023.3-Ubuntu_2023.3_1ubuntu3');
  });
  it('falls back to the banner, and gives null for anything else', () => {
    expect(parseVersion('            :-) GROMACS - gmx, 2021.4 (-:\n')).toBe('2021.4');
    expect(parseVersion('bash: gmx: command not found')).toBeNull();
  });
});

describe('gmx dump -s and gmx check -f', () => {
  it('reads the atom count and the output schedule of the run input (your nvt.tpr)', () => {
    expect(parseDump(fixture('gmx-2025.4/dump-head.txt'))).toEqual({ natoms: 3242, tinit: 0, dt: 0.001, nsteps: 20000, initStep: 0, nstxout: 0, nstxoutCompressed: 1000 });
    expect(parseDump('nothing here')).toEqual({});
  });
  it('estimates the frames a trajectory of that run holds', () => {
    const d = parseDump(fixture('gmx-2025.4/dump-head.txt'));
    expect(frameEstimate(d, 'nvt.xtc')).toEqual({ frames: 21, start: 0, end: 20 });
    expect(frameEstimate(d, 'nvt.trr')).toBeNull(); // nstxout = 0: no .trr frames scheduled
    expect(frameEstimate({ ...d, nstxout: 500 }, 'nvt.trr')).toEqual({ frames: 41, start: 0, end: 20 });
  });
  it("reads the trajectory's atom count from gmx check", () => {
    expect(parseCheckAtoms(fixture('gmx-2025.4/check.stderr'))).toBe(3242);
    expect(parseCheckAtoms('Reading frame')).toBeNull();
  });
});

describe('gmx select -os', () => {
  it('reads each selection\'s size from the last row', () => {
    expect(parseSizes(fixture('gmx-2025.4/sizes.xvg'))).toEqual([6, 800, 12]);
    expect(parseSizes('# nothing\n@ legend on\n')).toBeNull();
  });
});
