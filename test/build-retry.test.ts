// What R6 decides: the hint on the notebook's two real box errors, the failed folder's name, where a build resumes,
// and a repeat's name.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAN, systemsOf } from '../src/lib/build/plan';
import { freeRepeat, hint, quarantineName, resumeAt, stamp } from '../src/lib/build/retry';
import { planSystem } from '../src/lib/build/steps';

const real = (n: string) => readFileSync(new URL('./fixtures/build/notebook/' + n, import.meta.url), 'utf8');

describe('the hint, on the real text', () => {
  it('the AWH box error (hhhhhhhh), which the notebook\'s pattern misses', () => {
    expect(hint(real('grompp-awh-fatal.txt'))).toMatch(/^the pull groups are farther apart than 0\.49 times the box: set pull-pbc-ref-prev-step-com = yes/);
  });
  it('the walker\'s pbcatom error (rrrrrrrr, walker 8)', () => {
    expect(hint(real('grompp-walker-fatal.txt'))).toMatch(/^a pull group is wider than half the box: choose a central atom as its pbcatom/);
  });
  it('nothing for any other error', () => {
    expect(hint('Fatal error:\nThere was 1 error in input file(s)')).toBeNull();
  });
});

describe('names and places', () => {
  it('the notebook\'s stamp, and a failed folder\'s name', () => {
    const d = new Date(2026, 8, 25, 22, 14, 3);
    expect(stamp(d)).toBe('20260925_221403');
    expect(quarantineName('hhhhhhhh', d)).toBe('hhhhhhhh_20260925_221403');
    expect(quarantineName('8', d)).toBe('8_20260925_221403');
  });
  it.each([[[], 'hmr+fast+6r'], [['hmr+fast+6r'], 'hmr+fast+6r1'], [['hmr+fast+6r', 'hmr+fast+6r1'], 'hmr+fast+6r2']] as const)('taken %j: the next repeat is %s', (taken, m) => {
    expect(freeRepeat('hmr+fast+6', x => taken.includes(x as never))).toBe(m);
  });
});

describe('where a build resumes', () => {
  const sys = systemsOf({ methods: ['hmr+fast+6'], saccharides: ['o111'], sequences: ['hhhhhhhh'], repeats: 0 })[0];
  const steps = planSystem(DEFAULT_PLAN, sys, { base: '' }), awh = steps.findIndex(s => s.label === 'grompp 7.awh');
  const done = (n: number) => steps.slice(0, n).map((s, i) => ({ i, label: s.label, status: 'done' }));
  const none = () => false;
  it.each([
    ['a build that stopped at the AWH grompp resumes there', done(awh), none, awh],
    ['a build with every step done has nothing left', done(steps.length), none, steps.length],
    ['an output it wrote, removed since: from its step', done(steps.length), (p: string) => p.endsWith('2.solvated.gro'), steps.findIndex(s => s.label === 'add water')],
    ['nothing recorded: from the start', [], none, 0],
  ] as const)('%s', (_w, d, gone, at) => {
    expect(resumeAt(steps, d as never, gone)).toBe(at);
  });
});
