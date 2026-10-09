// The periodic box (R2, decisions T95–T96): read from the structure file, the cell's corners and edges, its dimensions.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { boxDimensions, boxEdges, outsideBox, parseBox, type Vectors } from '../src/lib/box';

const FIX = (name: string) => readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8');
const APP = (name: string) => readFileSync(new URL('../../app/test/fixtures/' + name, import.meta.url), 'utf8');
/** A CRYST1 line in its fixed columns: a, b, c in Å (7–33), the angles in degrees (34–54). */
const cryst = (a: number, b: number, c: number, al: number, be: number, ga: number) =>
  'CRYST1' + a.toFixed(3).padStart(9) + b.toFixed(3).padStart(9) + c.toFixed(3).padStart(9) + al.toFixed(2).padStart(7) + be.toFixed(2).padStart(7) + ga.toFixed(2).padStart(7) + ' P 1           1';

describe('a .gro box line', () => {
  it('three numbers are a rectangular box, in nm (nvt.gro: 3.5 nm cube)', () => {
    const box = parseBox(FIX('nvt/nvt.gro'), 'gro');
    expect(box.problems).toEqual([]);
    expect(box.vectors).toEqual([[3.5, 0, 0], [0, 3.5, 0], [0, 0, 3.5]]);
    expect(boxDimensions(box.vectors!)).toMatchObject({ a: 3.5, b: 3.5, c: 3.5, alpha: 90, beta: 90, gamma: 90 });
    expect(boxDimensions(box.vectors!).volume).toBeCloseTo(42.875, 9);
  });

  it('nine numbers are a triclinic box in GROMACS order: v1x v2y v3z v1y v1z v2x v2z v3x v3y', () => {
    const text = 'title\n    1\n    0.0 0.0 0.0\n2 2 2 0.5 0.25 0.5 0.5 0.25 0.5\n';
    expect(parseBox(text, 'gro').vectors).toEqual([[2, 0.5, 0.25], [0.5, 2, 0.5], [0.25, 0.5, 2]]);
  });

  it.each<[string, string]>([
    ['the last line has two numbers', 'title\n 0\n 3 3\n'],
    ['the last line has no numbers', 'title\n 0\n one two three\n'],
    ['the box is all zeros (no box in this file)', 'title\n 0\n 0 0 0\n'],
    ['the file is too short', 'title\n'],
  ])('%s: no box, and the reason', (_, text) => {
    const box = parseBox(text, 'gro');
    expect(box.vectors).toBeNull();
    expect(box.problems).toHaveLength(1);
  });
});

describe('a .pdb CRYST1 line', () => {
  it('orthorhombic: the same box as the matching .gro line (35 Å cube = 3.5 nm)', () => {
    expect(parseBox(cryst(35, 35, 35, 90, 90, 90), 'pdb').vectors).toEqual([[3.5, 0, 0], [0, 3.5, 0], [0, 0, 3.5]]);
  });

  it('triclinic: the lengths and angles of the line come back out of the vectors', () => {
    const d = boxDimensions(parseBox(cryst(30, 40, 50, 80, 70, 60), 'pdb').vectors!);
    expect([d.a, d.b, d.c]).toEqual([3, 4, 5].map(v => expect.closeTo(v, 9)));
    expect([d.alpha, d.beta, d.gamma]).toEqual([80, 70, 60]);
  });

  it('no CRYST1 line: no box, and the reason', () => {
    const box = parseBox('ATOM      1  OW  SOL     1       0.000   0.000   0.000\n', 'pdb');
    expect(box.vectors).toBeNull();
    expect(box.problems).toEqual(['no CRYST1 line in this file: no box to draw']);
  });

  // Never a guessed box (section 9.5): a line cut short is no box, said in words (review finding 9).
  it.each([
    ['lengths only', 'CRYST1   35.000   35.000   35.000'],
    ['one angle missing', 'CRYST1   35.000   35.000   35.000  90.00  90.00'],
    ['an angle that is no cell', 'CRYST1   35.000   35.000   35.000   0.00  90.00  90.00 P 1           1'],
    ['angles that close no cell', 'CRYST1   35.000   35.000   35.000 170.00 170.00 170.00 P 1           1'],
  ])('%s: no box, and the reason', (_, line) => {
    const box = parseBox(line + '\n', 'pdb');
    expect(box.vectors).toBeNull();
    expect(box.problems).toEqual(['the CRYST1 line has no usable cell (a, b, c in Å and three angles in degrees)']);
  });
});

describe('the cell and what it holds', () => {
  const cube: Vectors = [[3.5, 0, 0], [0, 3.5, 0], [0, 0, 3.5]];

  it('twelve edges, each one box vector long', () => {
    const edges = boxEdges(cube);
    expect(edges).toHaveLength(12);
    for (const [p, q] of edges) expect(Math.hypot(...p.map((v, i) => v - q[i]))).toBeCloseTo(3.5, 9);
  });

  it('a triclinic cell has eight corners, and the origin and its vector ends are among them', () => {
    const v: Vectors = [[2, 0.5, 0.25], [0.5, 2, 0.5], [0.25, 0.5, 2]];
    const corners = new Set(boxEdges(v).flat().map(p => p.map(x => x.toFixed(6)).join(',')));
    expect(corners.size).toBe(8);
    expect(corners.has('0.000000,0.000000,0.000000')).toBe(true);
    expect(corners.has(v[0].map(x => x.toFixed(6)).join(','))).toBe(true);
    expect(corners.has([2.75, 3, 2.75].map(x => x.toFixed(6)).join(','))).toBe(true);
  });

  it('atoms outside the box are counted (nvt.gro: 68 of 3242, all of them water)', () => {
    const text = FIX('nvt/nvt.gro');
    expect(outsideBox(text, 'gro', parseBox(text, 'gro').vectors!)).toEqual({ count: 68, total: 3242 });
  });

  it('a placeholder box (cccccccc.gro, 1 nm) with atoms out to 5 nm: the count says so', () => {
    const text = APP('cccccccc.gro');
    const result = outsideBox(text, 'gro', parseBox(text, 'gro').vectors!);
    expect(result.total).toBe(91);
    expect(result.count).toBe(91);
  });
});
