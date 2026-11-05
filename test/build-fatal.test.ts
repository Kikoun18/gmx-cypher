// GROMACS's fatal blocks stop a system whatever the exit code (R5b, check_fatal), quoted from the real output.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fatalText } from '../src/lib/build/fatal';

const real = (n: string) => readFileSync(new URL('./fixtures/build/notebook/' + n, import.meta.url), 'utf8');

describe('a fatal error, as the notebook quotes it', () => {
  it('grompp\'s "There was 1 error" with the ERROR block above it, whole (walker 8)', () => {
    expect(fatalText(real('grompp-walker-fatal.txt'))).toBe([
      'ERROR 1 [file /storage/brno/you/02_evomd/innit_tests/inputs/hmr_multi.mdp]:',
      '  When the maximum distance from a pull group reference atom to other atoms',
      '  in the group is larger than 0.5 times half the box size a centrally',
      '  placed atom should be chosen as pbcatom. Pull group 1 is larger than that',
      '  and does not have a specific atom selected as reference atom.',
      'Fatal error:',
      'There was 1 error in input file(s)',
    ].join('\n'));
  });
  it('the AWH box error, the block alone', () => {
    expect(fatalText(real('grompp-awh-fatal.txt'))).toBe('Fatal error:\nDistance between pull groups 1 and 2 (3.657996 nm) is larger than 0.49 times\nthe box size (3.406945).');
  });
  it('warnings and notes alone are not fatal', () => {
    const warnings = real('grompp-walker-fatal.txt').split('\nERROR 1')[0];
    expect(fatalText(warnings)).toBeNull();
    expect(fatalText('')).toBeNull();
  });
});
