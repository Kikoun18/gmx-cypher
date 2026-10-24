import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseHelp } from '../src/lib/gmxText';
import { driftLarger, energyProblems, energyStdin, parseEnergyMenu, parseEnergyStats, type EnergyTerm } from '../src/lib/energy';

const fixture = (p: string) => readFileSync(new URL('./fixtures/' + p, import.meta.url), 'utf8');

// The term menu that gmx energy prints for the test trajectory's rerun.edr (6 terms), from GROMACS 2025.4 and 2023.3.
const SIX: EnergyTerm[] = [
  { number: 1, name: 'Bond' }, { number: 2, name: 'Angle' }, { number: 3, name: 'LJ-(SR)' },
  { number: 4, name: 'Coulomb-(SR)' }, { number: 5, name: 'Coul.-recip.' }, { number: 6, name: 'Potential' },
];

describe('the term menu (R4, T100): read from gmx energy with an empty stdin', () => {
  it.each([
    ['2025.4', 'gmx-2025.4/energy-menu.txt'],
    ['2023.3', 'gmx-2023.3/energy-menu.txt'],
  ])('%s: the six terms of rerun.edr, by number and name', (_, file) => {
    expect(parseEnergyMenu(fixture(file))).toEqual(SIX);
  });

  it('names with spaces and brackets, one per column', () => {
    const text = 'selecting either (part of) the name or the number\n-----------\n  1  Temperature      2  Pres. DC (bar)  \n  3  Pressure\n\n';
    expect(parseEnergyMenu(text)).toEqual([
      { number: 1, name: 'Temperature' }, { number: 2, name: 'Pres. DC (bar)' }, { number: 3, name: 'Pressure' },
    ]);
  });

  it('a text with no menu gives no terms', () => {
    expect(parseEnergyMenu('Fatal error\nNo energy terms selected\n')).toEqual([]);
  });
});

describe('stdin (R4): the terms by number, then 0 to end the selection', () => {
  it('lists the numbers on one line and ends with 0', () => {
    expect(energyStdin([1, 6])).toBe('1 6\n0\n');
    expect(energyStdin([6])).toBe('6\n0\n');
  });

  it.each<[string, number[], string[]]>([
    ['nothing picked', [], ['pick at least one term']],
    ['a number that is not a term of this file', [1, 7], ['7 is not a term of this file']],
    ['zero is not a term', [0], ['0 is not a term of this file']],
    ['a term picked twice', [2, 2], ['term 2 is picked twice']],
  ])('refused: %s', (_, numbers, problems) => {
    expect(energyProblems(numbers, SIX)).toEqual(problems);
  });

  it('accepts the picked terms in the order picked', () => {
    expect(energyProblems([6, 1], SIX)).toEqual([]);
    expect(energyStdin([6, 1])).toBe('6 1\n0\n');
  });
});

describe('the statistics table (R4): parsed from the stdout gmx energy prints', () => {
  it('2025.4, the rerun energy file: 21 frames, both terms', () => {
    expect(parseEnergyStats(fixture('gmx-2025.4/energy-stats.txt'))).toEqual({
      steps: 20001, t0: 0, t1: 20, dataSets: 2, frames: 21,
      rows: [
        { name: 'Bond', average: 172.83, errEst: 14, rmsd: 55.6169, drift: 79.6954, unit: 'kJ/mol' },
        { name: 'Potential', average: -44810, errEst: 1000, rmsd: 2686.44, drift: -6402.12, unit: 'kJ/mol' },
      ],
    });
  });

  it('2023.3, the same file: the same numbers', () => {
    const s = parseEnergyStats(fixture('gmx-2023.3/energy-stats.txt'));
    expect(s?.rows.map(r => [r.name, r.average, r.errEst])).toEqual([['Bond', 172.83, 14], ['Potential', -44810, 1000]]);
    expect(s?.frames).toBe(21);
  });

  it('a range that starts later (-b 2, real 2023.3 output): t0 is 2, 19 frames', () => {
    const text = [
      'Statistics over 18001 steps [ 2.0000 through 20.0000 ps ], 2 data sets',
      'All statistics are over 19 points (frames)',
      '',
      'Energy                      Average   Err.Est.       RMSD  Tot-Drift',
      '-------------------------------------------------------------------------------',
      'Bond                        177.885         15    43.0605    61.5418  (kJ/mol)',
      'Potential                  -45566.9        450    1136.61   -2935.35  (kJ/mol)',
    ].join('\n');
    const s = parseEnergyStats(text);
    expect([s?.steps, s?.t0, s?.t1, s?.frames]).toEqual([18001, 2, 20, 19]);
    expect(s?.rows[1]).toEqual({ name: 'Potential', average: -45566.9, errEst: 450, rmsd: 1136.61, drift: -2935.35, unit: 'kJ/mol' });
  });

  it('a short span (-b 18, 3 frames) with -sum: gmx prints -- where it has no error estimate or RMSD (real 2025.4)', () => {
    const s = parseEnergyStats(fixture('gmx-2025.4/energy-stats-short.txt'));
    expect(s?.frames).toBe(3);
    expect(s?.rows).toEqual([
      { name: 'Bond', average: 210.22, errEst: null, rmsd: 21.7977, drift: -7.08301, unit: 'kJ/mol' },
      { name: 'Potential', average: -46318.4, errEst: null, rmsd: 95.2962, drift: 158.656, unit: 'kJ/mol' },
      { name: 'Total', average: -46108.2, errEst: null, rmsd: null, drift: 151.574, unit: 'kJ/mol' },
    ]);
    // No estimate, no flag: the drift is not compared with an error that isn't there (review finding 2).
    expect(s?.rows.map(driftLarger)).toEqual([false, false, false]);
    // As the record stores it: JSON has no NaN, and a missing estimate must stay missing.
    expect(JSON.parse(JSON.stringify(s)).rows.map(driftLarger)).toEqual([false, false, false]);
  });

  it('no statistics block gives null, so nothing is shown as a result', () => {
    expect(parseEnergyStats(fixture('gmx-2025.4/energy-menu.txt'))).toBeNull();
  });
});

describe('the drift flag (R4): a drift larger than its error estimate, in either direction', () => {
  it('flags both real terms of the rerun file', () => {
    const s = parseEnergyStats(fixture('gmx-2025.4/energy-stats.txt'))!;
    expect(s.rows.map(driftLarger)).toEqual([true, true]);
  });

  it.each([
    ['inside the error', { drift: 5, errEst: 10 }, false],
    ['negative and larger', { drift: -12, errEst: 10 }, true],
    ['exactly the error', { drift: 10, errEst: 10 }, false],
    ['no error estimate', { drift: 10, errEst: null }, false],
  ])('%s', (_, r, flagged) => {
    expect(driftLarger(r)).toBe(flagged);
  });
});

describe('the energy options (R4): offered from the installed gmx energy -h', () => {
  it.each(['gmx-2025.4/energy-h.txt', 'gmx-2023.3/energy-h.txt'])('%s has the first two and the fluctuation options', (file) => {
    const flags = parseHelp(fixture(file)).map(o => o.flag);
    expect(flags).toEqual(expect.arrayContaining(['b', 'e', 'sum', 'fluct_props', 'driftcorr']));
  });

  it('neither version has -dt or -skip: the spec\'s frame options belong to other tools', () => {
    for (const file of ['gmx-2025.4/energy-h.txt', 'gmx-2023.3/energy-h.txt']) {
      const flags = parseHelp(fixture(file)).map(o => o.flag);
      expect(flags).not.toContain('dt');
      expect(flags).not.toContain('skip');
    }
  });
});
