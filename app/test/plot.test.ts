import { describe, expect, it } from 'vitest';
import { buildPlotMulti } from '../src/lib/seq';

// Positions recorded from the code before R2 (they must not change); labels as R2 requires.
const xAxis = (x0: number, x1: number) => buildPlotMulti([{ x: [x0, x1], y: [0, 1] }], { w: 600, h: 300, domain: { lo: 0, hi: 1 } }).xticks;
const yAxis = (lo: number, hi: number, yStep: number | null = null) => buildPlotMulti([{ x: [0, 1], y: [lo, hi] }], { w: 600, h: 300, domain: { lo, hi }, yStep }).yticks;

describe('tick labels show the tick\'s true value (R2)', () => {
  it.each([
    [0, 1.5, '0, 0.25, 0.5, 0.75, 1, 1.25, 1.5'],
    [0.25, 3.25, '0.5, 1, 1.5, 2, 2.5, 3'],
    [0, 0.1, '0, 0.02, 0.04, 0.06, 0.08, 0.1'],
    [0, 2, '0, 0.5, 1, 1.5, 2'],
    [0, 0.004, '0, 0.001, 0.002, 0.003, 0.004'],
    [-15, 20, '-10, 0, 10, 20'],
    [0, 200000, '0, 50000, 100000, 150000, 200000'],
  ])('x %s – %s', (x0, x1, want) => expect(xAxis(x0, x1).map(t => t.label).join(', ')).toBe(want));

  it.each([
    [0, 0.1, null, '0, 0.02, 0.04, 0.06, 0.08, 0.1'],
    [0, 0.004, null, '0, 0.001, 0.002, 0.003, 0.004'],
    [0.2, 0.32, null, '0.2, 0.225, 0.25, 0.275, 0.3'],
    [-0.1, 0.1, null, '-0.1, -0.05, 0, 0.05, 0.1'],
    [-15, 20, null, '-10, 0, 10, 20'],
    [0, 200000, null, '0, 50000, 100000, 150000, 200000'],
    [-12, 6, 5, '-10, -5, 0, 5'],
  ])('y %s – %s (yStep %s)', (lo, hi, step, want) => expect(yAxis(lo, hi, step).map(t => t.label).join(', ')).toBe(want));

  it('no floating-point artefacts and no -0', () => {
    for (const [a, b] of [[0, 0.3], [-0.3, 0.3], [0.1, 0.7], [-1e-7, 0.9]]) for (const t of [...xAxis(a, b), ...yAxis(a, b)]) {
      expect(t.label).not.toMatch(/000000|99999|^-0$/);
    }
  });
});

describe('tick positions are unchanged', () => {
  it.each([
    [0, 1.5, [58, 146, 234, 322, 410, 498, 586]],
    [0.25, 3.25, [102, 190, 278, 366, 454, 542]],
    [0, 0.004, [58, 190, 322, 454, 586]],
    [-15, 20, [133.43, 284.29, 435.14, 586]],
  ])('x %s – %s', (x0, x1, want) => expect(xAxis(x0, x1).map(t => +t.x.toFixed(2))).toEqual(want));
  it('y with yStep 5', () => expect(yAxis(-12, 6, 5).map(t => +t.y.toFixed(2))).toEqual([236.22, 166.78, 97.33, 27.89]));
});
