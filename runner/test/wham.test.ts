import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseHelp } from '../src/lib/gmxText';
import {
  commonFolder, listFile, matchesGlob, naturalCompare, neighbourOverlaps, overlapNotes, parseBootstrap, parseHistograms, parseRefT, pullFileOf,
  whamArgv, whamOptionProblems, whamOutputNames,
} from '../src/lib/wham';

const FIX = new URL('./fixtures/', import.meta.url);
const text = (p: string) => readFileSync(new URL(p, FIX), 'utf8');
const help = parseHelp(text('gmx-2025.4/wham-h.txt'));

describe('window lists (R6): built from a folder template over the window folders', () => {
  it.each<[string, string, boolean]>([
    ['*/umbrella.tpr', 'win03/umbrella.tpr', true],
    ['*/umbrella.tpr', 'win03/sub/umbrella.tpr', false],
    ['win*/umbrella.tpr', 'window3/umbrella.tpr', true],
    ['win*/umbrella.tpr', 'run3/umbrella.tpr', false],
    ['*/*/topol.tpr', 'us/w10/topol.tpr', true],
    ['*/umbrella.tpr', 'win03/umbrella.tpr.bak', false],
    ['w?n*/x.tpr', 'win1/x.tpr', false], // only * is a wildcard: a ? is a letter of the name
  ])('%s against %s: %s', (glob, rel, match) => {
    expect(matchesGlob(glob, rel)).toBe(match);
  });

  it('windows in natural order: win2 before win10', () => {
    expect(['win10/a.tpr', 'win2/a.tpr', 'win1/a.tpr'].sort(naturalCompare)).toEqual(['win1/a.tpr', 'win2/a.tpr', 'win10/a.tpr']);
  });

  it.each<[string, 'pullx' | 'pullf', string[], string | null]>([
    ['umbrella.tpr', 'pullx', ['umbrella.tpr', 'umbrella_pullx.xvg', 'umbrella_pullf.xvg'], 'umbrella_pullx.xvg'],
    ['umbrella.tpr', 'pullf', ['umbrella.tpr', 'umbrella_pullx.xvg', 'umbrella_pullf.xvg'], 'umbrella_pullf.xvg'],
    ['topol.tpr', 'pullx', ['topol.tpr', 'pullx.xvg'], 'pullx.xvg'],
    ['umbrella.tpr', 'pullx', ['umbrella.tpr', 'pullx.xvg', 'umbrella_pullx.xvg'], 'umbrella_pullx.xvg'],
    ['umbrella.tpr', 'pullx', ['umbrella.tpr', 'other_pullx.xvg'], null],
  ])('%s, %s, beside %j → %s', (tpr, kind, siblings, pull) => {
    expect(pullFileOf(tpr, kind, siblings)).toBe(pull);
  });

  it('a list file is one path per line, as gmx wham reads it', () => {
    expect(listFile(['/sim/win00/umbrella.tpr', '/sim/win01/umbrella.tpr'])).toBe('/sim/win00/umbrella.tpr\n/sim/win01/umbrella.tpr\n');
  });

  it('the fixture lists are in that shape', () => {
    expect(text('wham/tpr-files.dat').trim().split('\n')).toHaveLength(9);
  });
});

describe('the overlap check (R6): neighbouring windows, sorted by where each histogram peaks', () => {
  // Your 21-window fixture: its columns are not in pull order (Phase 0 §4.1).
  const yours = neighbourOverlaps(parseHistograms(readFileSync(new URL('../../app/test/fixtures/gmx/hist_500000.xvg', import.meta.url), 'utf8')));

  it('your fixture: windows sorted by peak, 1, 12, 14 … 11, 13', () => {
    expect(yours.order).toEqual([1, 12, 14, 15, 16, 17, 18, 19, 20, 21, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13]);
    expect(yours.order.map(w => yours.peaks[w - 1].toFixed(2)).slice(0, 3)).toEqual(['1.65', '1.83', '2.01']);
  });

  it('your fixture: 20 neighbour pairs, overlap 0.036 to 0.222, 19 of them below 0.10 (Phase 0 §4.1)', () => {
    const o = yours.pairs.map(p => p.overlap);
    expect(o).toHaveLength(20);
    expect(Math.min(...o)).toBeCloseTo(0.0361, 4);
    expect(Math.max(...o)).toBeCloseTo(0.2221, 4);
    expect(o.filter(x => x < 0.1)).toHaveLength(19);
    expect(yours.pairs[0]).toMatchObject({ a: 1, b: 12 });
    expect(yours.pairs[19]).toMatchObject({ a: 11, b: 13 });
  });

  it('numbers without a verdict (question 29): the lowest pair is named, no threshold is applied', () => {
    expect(overlapNotes(yours.pairs)).toEqual(['lowest overlap: windows 18 and 19, 0.036']);
  });

  it('a gap is named by its windows: WHAM across it is not reliable', () => {
    const h = { x: [1, 2, 3, 4, 5, 6], windows: [[5, 9, 2, 0, 0, 0], [0, 0, 0, 0, 3, 8], [0, 1, 7, 4, 0, 0]] };
    const r = neighbourOverlaps(h);
    expect(r.order).toEqual([1, 3, 2]);
    expect(r.pairs.map(p => [p.a, p.b, +p.overlap.toFixed(3)])).toEqual([[1, 3, 0.208], [3, 2, 0]]);
    expect(overlapNotes(r.pairs)).toEqual(['windows 3 and 2 do not overlap at all: WHAM across a gap is not reliable', 'lowest overlap: windows 3 and 2, 0.000']);
  });

  it('the umbrella set made here: 9 windows in list order, each overlapping its neighbour', () => {
    const r = neighbourOverlaps(parseHistograms(text('wham/out/histo.xvg')));
    expect(r.order).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(r.pairs.every(p => p.overlap > 0)).toBe(true);
  });
});

describe('the bootstrap result (R6): the profile with its standard deviation', () => {
  it('reads the xydy columns of bsres.xvg', () => {
    const b = parseBootstrap(text('wham/out/bsres.xvg'));
    expect(b.length).toBe(200);
    expect(b[1]).toEqual([0.2601025, expect.any(Number), expect.any(Number)]);
    expect(b.every(([, , sd]) => sd >= 0)).toBe(true);
  });
});

describe('the run inputs\' temperature (R6): gmx wham does not read it, so gmx-cypher does', () => {
  it.each<[string, number[]]>([
    ['grpopts:\n   nrdf:        6599\n   ref-t:         300\n   tau-t:         0.1\n', [300]],
    ['   ref-t:         360         360\n', [360, 360]],
    ['no such line\n', []],
  ])('%j', (dump, t) => expect(parseRefT(dump)).toEqual(t));

  it('the nvt dump: two groups at 360 K', () => {
    expect(parseRefT(text('gmx-2025.4/dump-head.txt'))).toEqual([360, 360]);
  });
});

describe('the wham argument list, outputs and refusals (R6)', () => {
  const io = { tpr: 'wham/w_tpr-files.dat', pull: 'wham/w_pull-files.dat', profile: 'wham/w_profile.xvg', hist: 'wham/w_histo.xvg', bsres: 'wham/w_bsres.xvg', bsprof: 'wham/w_bsprof.xvg' };

  it('the lists, the profile and the histograms, then only what differs from the installed defaults', () => {
    expect(whamArgv({ options: { temp: '300', b: '2' }, pull: 'pullx' }, io, help)).toEqual([
      'wham', '-it', 'wham/w_tpr-files.dat', '-ix', 'wham/w_pull-files.dat', '-o', 'wham/w_profile.xvg', '-hist', 'wham/w_histo.xvg', '-temp', '300', '-b', '2',
    ]);
  });

  it('force files go in as -if; bootstrap adds its two files', () => {
    expect(whamArgv({ options: { nBootstrap: '50' }, pull: 'pullf' }, io, help)).toEqual([
      'wham', '-it', 'wham/w_tpr-files.dat', '-if', 'wham/w_pull-files.dat', '-o', 'wham/w_profile.xvg', '-hist', 'wham/w_histo.xvg',
      '-bsres', 'wham/w_bsres.xvg', '-bsprof', 'wham/w_bsprof.xvg', '-nBootstrap', '50',
    ]);
  });

  it('kJ only: -unit is not offered (section 1.4)', () => {
    expect(() => whamArgv({ options: { unit: 'kCal' }, pull: 'pullx' }, io, help)).toThrow('-unit is not an option gmx-cypher sets for wham');
  });

  it('the files of a run: histograms for the vault (question 28), the profile and the lists beside them', () => {
    expect(whamOutputNames('w', false)).toEqual({ xvg: 'w_histo.xvg', record: 'w.run.json', more: ['w_profile.xvg', 'w_tpr-files.dat', 'w_pull-files.dat'] });
    expect(whamOutputNames('w', true).more).toEqual(['w_profile.xvg', 'w_tpr-files.dat', 'w_pull-files.dat', 'w_bsres.xvg', 'w_bsprof.xvg']);
  });

  it('the run is named after the folder that holds all its windows', () => {
    expect(commonFolder(['/sim/us/win00/umbrella.tpr', '/sim/us/win01/umbrella.tpr'])).toBe('/sim/us');
    expect(commonFolder(['/sim/us/a.tpr', '/sim/us/b.tpr'])).toBe('/sim/us');
    expect(commonFolder(['/sim/us/win00/x.tpr', '/sim/usb/win00/x.tpr'])).toBe('/sim');
  });

  it.each<[Record<string, string | boolean>, string[]]>([
    [{ b: '2', temp: '300' }, []],
    [{ temp: '0' }, ['-temp must be above 0 K']],
    [{ nBootstrap: '1.5' }, ['-nBootstrap: a whole number: 1.5']],
    [{ nBootstrap: '-3' }, ['-nBootstrap must be 0 or more']],
    [{ b: '10', e: '5' }, ['-e must be after -b']],
    [{ 'bs-method': 'magic' }, ['-bs-method: one of b-hist, hist, traj, traj-gauss']],
    [{ bins: '0' }, ['-bins must be above 0']],
  ])('%o → %o', (options, problems) => {
    expect(whamOptionProblems(options, help)).toEqual(problems);
  });

  it('2023.3 has the same options', () => {
    expect(parseHelp(text('gmx-2023.3/wham-h.txt')).map(o => o.flag)).toEqual(help.map(o => o.flag));
  });
});
