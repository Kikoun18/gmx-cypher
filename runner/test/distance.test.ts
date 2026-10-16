import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseHelp } from '../src/lib/gmxText';
import { distanceArgv, distanceNames, distanceOptionProblems, distancePairProblems, distanceSelections, parseDistanceStats } from '../src/lib/distance';
import { detectAna, getAnalyses, parseTable } from '../../matrix/src/lib/seq';
import { parseGmxHeader } from '../../matrix/src/lib/gmxHeader';

const FIX = new URL('./fixtures/', import.meta.url);
const text = (p: string) => readFileSync(new URL(p, FIX), 'utf8');
const help = parseHelp(text('gmx-2025.4/distance-h.txt'));

describe('what is measured (R7): the selection text, built from the groups by number (T17)', () => {
  it.each<['com' | 'cog' | 'pairs', string[]]>([
    ['com', ['com of group 0 plus com of group 1', 'com of group 0 plus com of group 2']],
    ['cog', ['cog of group 0 plus cog of group 1', 'cog of group 0 plus cog of group 2']],
    // Checked with 2025.4: merge is infix; "merge A B" is refused.
    ['pairs', ['group 0 merge group 1', 'group 0 merge group 2']],
  ])('%s: one distance set per selection, against the reference', (measure, sels) => {
    expect(distanceSelections(measure, 2)).toEqual(sels);
  });

  it('group names never enter the text, so + . : - in a name change nothing', () => {
    expect(distanceSelections('com', 1).join(' ')).not.toMatch(/[+.:]/);
  });

  it.each<[string, number[], string[]]>([
    ['pairs need equal sizes: 2 against 6 is refused (gmx 2025.4 would pair them silently)', [6, 6, 2], ['pairs need as many atoms in water_O as in sulfur: 2 and 6']],
    ['equal sizes', [6, 6, 6], []],
  ])('%s', (_, counts, problems) => {
    expect(distancePairProblems({ measure: 'pairs' }, counts, ['sulfur', 'sodium', 'water_O'])).toEqual(problems);
    expect(distancePairProblems({ measure: 'com' }, counts, ['sulfur', 'sodium', 'water_O'])).toEqual([]);
  });
});

describe('the distance argument list (R7)', () => {
  const io = { trajectory: 'nvt.xtc', runInput: 'nvt.tpr', index: 'distance/d.ndx', output: 'distance/d.xvg', all: 'distance/d_all.xvg', xyz: 'distance/d_xyz.xvg', hist: 'distance/d_hist.xvg' };
  const base = ['distance', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'distance/d.ndx', '-oav', 'distance/d.xvg'];

  it('centres of mass by default; only what differs from the installed defaults', () => {
    expect(distanceArgv({ options: {}, selections: 2 }, io, help)).toEqual([...base, '-select', 'com of group 0 plus com of group 1', 'com of group 0 plus com of group 2']);
  });

  it('every distance, the histogram with its range and bin, pairs', () => {
    expect(distanceArgv({ options: { all: true, hist: true, len: '0.5', binw: '0.05', measure: 'pairs' }, selections: 1 }, io, help)).toEqual([
      ...base, '-oall', 'distance/d_all.xvg', '-oh', 'distance/d_hist.xvg', '-len', '0.5', '-binw', '0.05', '-select', 'group 0 merge group 1',
    ]);
  });

  it('an option not offered is refused', () => {
    expect(() => distanceArgv({ options: { oallstat: true }, selections: 1 }, io, help)).toThrow('-oallstat is not an option gmx-cypher sets for distance');
  });

  it('the file names: the averages for the vault (question 32), the others when asked', () => {
    expect(distanceNames('d', {})).toEqual({ xvg: 'd.xvg', ndx: 'd.ndx', record: 'd.run.json', more: [] });
    expect(distanceNames('d', { all: true, xyz: true, hist: true }).more).toEqual(['d_all.xvg', 'd_xyz.xvg', 'd_hist.xvg']);
  });

  it.each<[Record<string, string | boolean>, string[]]>([
    [{ b: '5', e: '2' }, ['-e must be after -b']],
    [{ binw: '0' }, ['-binw must be above 0']],
    [{ len: '-1' }, ['-len must be above 0']],
    [{ measure: 'middle' }, ['measure: one of com, cog, pairs']],
    [{ dt: 'x' }, ['-dt: not a number: x']],
  ])('%o → %o', (options, problems) => {
    expect(distanceOptionProblems(options, help)).toEqual(problems);
  });

  it('2023.3 has the same options', () => {
    expect(parseHelp(text('gmx-2023.3/distance-h.txt')).map(o => o.flag)).toEqual(help.map(o => o.flag));
  });
});

describe('the averages gmx distance prints (R7)', () => {
  it('per selection: samples, average and standard deviation (real 2025.4 stdout)', () => {
    expect(parseDistanceStats(text('distance/pairs/run.stdout'))).toEqual([
      { selection: 'group 0 merge group 1', samples: 126, average: 1.6424, sd: 0.66729 },
      { selection: 'group 0 merge group 2', samples: 126, average: 2.00448, sd: 0.44211 },
    ]);
    expect(parseDistanceStats('nothing')).toEqual([]);
  });
});

describe('the outputs in the Matrix (R7, section 4)', () => {
  it.each([
    ['distance/com/distance_nvt.xvg', 'distance_nvt.xvg', 'dist'],
    ['distance/com/distance_nvt_all.xvg', 'distance_nvt_all.xvg', 'dist'],
    // -oh: a distance distribution, read as an umbrella Histogram: not sent by default.
    ['distance/com/distance_nvt_hist.xvg', 'distance_nvt_hist.xvg', 'hist'],
  ])('%s → %s', (fixture, name, k) => {
    const t = text(fixture);
    expect(detectAna(getAnalyses(null), name, parseTable(t).head, parseGmxHeader(t)?.tool ?? null).k).toBe(k);
  });

  it('The Matrix takes one curve of a distance file (its yCols is 2): the first selection', () => {
    expect(getAnalyses(null).find(a => a.k === 'dist')?.yCols).toBe('2');
  });
});
