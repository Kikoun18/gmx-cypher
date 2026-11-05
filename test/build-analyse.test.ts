// From built systems to analysis (R10): the offer's root and path template, and the template matching the built tree
// by the batch's own matchTrajectory: the method, the column, the sequence and, for the walkers, the run.
import { describe, expect, it } from 'vitest';
import { analyseOffer } from '../src/lib/build/analyse';
import { matchTrajectory } from '../src/lib/batch';

describe('the offer', () => {
  it('the base folder\'s solutions/ as the root, a template by the notebook\'s names', () => {
    expect(analyseOffer('/storage/brno/you/02_evomd/innit_tests/', 'walkers')).toEqual({ root: '/storage/brno/you/02_evomd/innit_tests/solutions', template: '{method}/{column}/{seq}/9.multiwalker/{run}/9.multiwalker.xtc' });
    expect(analyseOffer('/b', 'awh').template).toBe('{method}/{column}/{seq}/7.awh/7.awh.xtc');
  });
  it.each([
    ['hmr+fast+6/o111/hhhhhhhh/9.multiwalker/3/9.multiwalker.xtc', 'walkers', { group: 'hmr+fast+6', col: 'o111', seq: 'hhhhhhhh', run: 'c' }, 3],
    ['hmr+fast+6r/pg/mmmmmmmm/9.multiwalker/8/9.multiwalker.xtc', 'walkers', { group: 'hmr+fast+6r', col: 'pg', seq: 'mmmmmmmm', run: 'h' }, 8],
    ['hmr+fast+6/o111/hhhhhhhh/7.awh/7.awh.xtc', 'awh', { group: 'hmr+fast+6', col: 'o111', seq: 'hhhhhhhh' }, null],
  ] as const)('%s', (rel, what, fields, run) => {
    expect(matchTrajectory(rel, analyseOffer('/b', what).template)).toEqual({ fields, run, problems: [] });
  });
  it('a walker\'s folder that failed and was moved aside is not matched', () => {
    expect(matchTrajectory('hmr+fast+6/o111/hhhhhhhh/9.multiwalker/failed/8_20261106_101500/9.multiwalker.xtc', analyseOffer('/b', 'walkers').template)).toBeNull();
  });
});
