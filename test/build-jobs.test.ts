// A qq job as a system's (R7b), by the input folder qq jobs -e prints: its end is a system's step folder.
import { describe, expect, it } from 'vitest';
import { jobSystem } from '../src/lib/build/jobs';

const SYSTEMS = [{ dir: 'solutions/hmr+fast+6/o111/hhhhhhhh' }, { dir: 'solutions/hmr+fast+6r/o111/hhhhhhhh' }];

describe('a job\'s system, by its input folder', () => {
  it.each([
    ['/storage/brno/you/02_evomd/innit_tests/solutions/hmr+fast+6/o111/hhhhhhhh/8.pull', { dir: SYSTEMS[0].dir, stage: 'pull' }],
    ['/mnt/storage-brno/you/02_evomd/innit_tests/solutions/hmr+fast+6/o111/hhhhhhhh/7.awh/', { dir: SYSTEMS[0].dir, stage: 'awh' }],
    ['/storage/brno/you/02_evomd/innit_tests/solutions/hmr+fast+6r/o111/hhhhhhhh/9.multiwalker', { dir: SYSTEMS[1].dir, stage: 'walkers' }],
    ['/storage/brno/you/02_evomd/innit_tests/solutions/hmr+fast+6/o111/hhhhhhhh', null],
    ['/storage/brno/you/x-solutions/hmr+fast+6/o111/hhhhhhhh/8.pullx', null],
    ['/home/user2', null],
    [null, null],
  ] as const)('%s', (dir, out) => {
    expect(jobSystem(dir, SYSTEMS)).toEqual(out);
  });
});
