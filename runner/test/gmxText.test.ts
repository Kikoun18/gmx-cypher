import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseVersion } from '../src/lib/gmxText';

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
