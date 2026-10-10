import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseHelp } from '../src/lib/gmxText';
import {
  hbondArgv, hbondGroupProblems, hbondKind, hbondNames, hbondOptionProblems, HBOND_SUMMARY,
  legacyArgv, legacyNames, legacyOptionProblems, LEGACY_SUMMARY, legacyStdin, summaryLines,
} from '../src/lib/hbond';
import { hbondCommand, hbondLegacyCommand, roleProblems } from '../src/lib/commands';
import { curveStats as countStats } from '../src/lib/curves';
import { detectAna, getAnalyses, parseTable } from '../../app/src/lib/seq';
import { resultSeries } from '../src/lib/rdf';
import { parseGmxHeader } from '../../app/src/lib/gmxHeader';

const FIX = new URL('./fixtures/', import.meta.url);
const text = (p: string) => readFileSync(new URL(p, FIX), 'utf8');
const help = (p: string) => parseHelp(text(p));
const NEW = help('gmx-2025.4/hbond-h.txt'), LEGACY = help('gmx-2025.4/hbond-legacy-h.txt');

describe('which H-bond tool a gmx has (R8): read from its -h', () => {
  it.each<[string, string, 'selection' | 'legacy' | null]>([
    ['2025.4 gmx hbond', 'gmx-2025.4/hbond-h.txt', 'selection'],
    ['2025.4 gmx hbond-legacy', 'gmx-2025.4/hbond-legacy-h.txt', 'legacy'],
    // 2023.3's gmx hbond is still the old tool: -r is a distance, and there is no hbond-legacy (help-commands.txt).
    ['2023.3 gmx hbond', 'gmx-2023.3/hbond-h.txt', 'legacy'],
    ['gmx rdf', 'gmx-2025.4/rdf-h.txt', null],
  ])('%s → %s', (_, file, kind) => {
    expect(hbondKind(help(file))).toBe(kind);
  });

  it('the tool lists say the same: 2025.4 has both, 2023.3 one', () => {
    expect(text('gmx-2025.4/help-commands.txt')).toMatch(/^\s+hbond-legacy\s/m);
    expect(text('gmx-2023.3/help-commands.txt')).not.toMatch(/hbond-legacy/);
    expect(text('gmx-2023.3/hbond-legacy.stderr')).toMatch(/'hbond-legacy' is not a GROMACS command/);
  });
});

describe('the selection tool, gmx hbond 2024+ (R8)', () => {
  const io = { trajectory: 'nvt.xtc', runInput: 'nvt.tpr', index: 'hbond/h.ndx', output: 'hbond/h.xvg', hbonds: 'hbond/h_hbonds.ndx', dist: 'hbond/h_dist.xvg', ang: 'hbond/h_ang.xvg', dan: 'hbond/h_dan.xvg' };
  const base = ['hbond', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'hbond/h.ndx', '-o', 'hbond/h_hbonds.ndx', '-num', 'hbond/h.xvg'];

  it('the reference and the target by number, the criteria only where changed', () => {
    expect(hbondArgv({ options: {}, selections: 1 }, io, NEW)).toEqual([...base, '-r', 'group 0', '-t', 'group 1']);
    expect(hbondArgv({ options: { hba: '25', dist: true, de: 'N O S' }, selections: 1 }, io, NEW)).toEqual([
      ...base, '-dist', 'hbond/h_dist.xvg', '-hba', '25', '-de', 'N', 'O', 'S', '-r', 'group 0', '-t', 'group 1',
    ]);
  });

  it.each<[Record<string, string | boolean>, string[]]>([
    [{}, []],
    [{ cutoff: '0.3' }, ['-cutoff must be 0.35 nm or more']],
    [{ hbr: '0.4' }, ['-hbr must not exceed -cutoff (0.35 nm)']],
    [{ cutoff: '0.5', hbr: '0.4' }, []],
    [{ hba: '0' }, ['-hba must be above 0']],
    [{ de: '' }, []],
    [{ ae: 'N 1' }, ['-ae: element symbols, e.g. N O']],
  ])('refusals, each as 2025.4 refuses: %o → %o', (options, problems) => {
    expect(hbondOptionProblems(options, NEW)).toEqual(problems);
  });

  it('one target; the same atoms as the reference or none of them', () => {
    const names = ['sulfate', 'water'];
    expect(hbondGroupProblems({}, [30, 3200], names, [[1, 2], [3, 4]])).toEqual([]);
    expect(hbondGroupProblems({}, [2, 2], names, [[1, 2], [1, 2]])).toEqual([]);
    expect(hbondGroupProblems({}, [2, 2], names, [[1, 2], [2, 3]])).toEqual(['sulfate and water share 1 atom: gmx hbond needs the same atoms or none in common']);
    expect(roleProblems(hbondCommand, 3)).toEqual(['gmx hbond takes one target group after the reference, not 2']);
    expect(roleProblems(hbondCommand, 1)).toEqual(['a reference and at least one target are needed']);
  });

  it('its files: the count over time for the vault (question 34), gmx\'s own index of the bonds, the rest when asked', () => {
    expect(hbondNames('h', {})).toEqual({ xvg: 'h.xvg', ndx: 'h.ndx', record: 'h.run.json', more: ['h_hbonds.ndx'] });
    expect(hbondNames('h', { dist: true, ang: true, dan: true }).more).toEqual(['h_hbonds.ndx', 'h_dist.xvg', 'h_ang.xvg', 'h_dan.xvg']);
  });

  it('what it printed: acceptors and donors per selection (real 2025.4)', () => {
    expect(summaryLines(text('hbond/new/run.stdout'), HBOND_SUMMARY)).toEqual([
      "Selection 'sulfate' has 24 acceptors and 0 donors.", "Selection 'water' has 800 acceptors and 800 donors.",
    ]);
  });
});

describe('the legacy tool, gmx hbond-legacy (and gmx hbond before 2024) (R8)', () => {
  const io = { trajectory: 'nvt.xtc', runInput: 'nvt.tpr', index: 'hbond/h.ndx', output: 'hbond/h.xvg', dist: 'hbond/h_dist.xvg', ang: 'hbond/h_ang.xvg' };

  it('the groups on stdin, by number: the reference, then the target', () => {
    expect(legacyArgv({ options: { r: '0.3' }, selections: 1 }, io, LEGACY)).toEqual(['hbond-legacy', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'hbond/h.ndx', '-num', 'hbond/h.xvg', '-r', '0.3']);
    expect(legacyStdin()).toBe('0\n1\n');
  });

  it('its own criteria, never the new tool\'s: -r is the distance here', () => {
    expect(() => legacyArgv({ options: { hbr: '0.3' }, selections: 1 }, io, LEGACY)).toThrow('-hbr is not an option gmx-cypher sets for hbond-legacy');
    expect(() => hbondArgv({ options: { a: '25' }, selections: 1 }, { ...io, hbonds: 'x', dan: 'y' }, NEW)).toThrow('-a is not an option gmx-cypher sets for hbond');
  });

  it.each<[Record<string, string | boolean>, string[]]>([
    [{ ang: true }, ["the angle distribution can't be written while H-bonds are merged: switch merging off (-nomerge)"]],
    [{ ang: true, merge: false }, []],
    [{ r: '-1' }, ['-r must be above 0']],
  ])('%o → %o (checked with 2025.4: "Can\'t combine merging hbonds and writing angle distribution")', (options, problems) => {
    expect(legacyOptionProblems(options, LEGACY)).toEqual(problems);
  });

  it('one target', () => {
    expect(roleProblems(hbondLegacyCommand, 3)).toEqual(['gmx hbond-legacy takes one target group after the reference, not 2']);
  });

  it('its files and what it printed', () => {
    expect(legacyNames('h', { dist: true })).toEqual({ xvg: 'h.xvg', ndx: 'h.ndx', record: 'h.run.json', more: ['h_dist.xvg'] });
    expect(summaryLines(text('hbond/legacy/run.stdout'), LEGACY_SUMMARY)).toEqual(['Found 800 donors and 824 acceptors', 'Average number of hbonds per timeframe 67.476 out of 329600 possible']);
  });
});

describe('the count over time in numbers (R8)', () => {
  it('its mean per frame is the average the legacy tool prints: 67.476 for its own file', () => {
    const [bonds, pairs] = resultSeries(text('hbond/legacy/hbond_nvt.xvg'));
    expect(countStats(bonds.points)!.mean.toFixed(3)).toBe('67.476');
    expect(pairs.label).toBe('Pairs within 0.35 nm');
    expect(countStats(resultSeries(text('hbond/new/hbond_nvt.xvg'))[0].points)).toMatchObject({ frames: 21, min: 30 });
    expect(countStats([])).toBeNull();
  });

  it('the distributions of both tools are densities: each integrates to 1 over nm or over degrees', () => {
    for (const f of ['new/hbond_nvt_dist', 'new/hbond_nvt_ang', 'legacy/hbond_nvt_dist', 'legacy/hbond_nvt_ang']) {
      const p = resultSeries(text('hbond/' + f + '.xvg'))[0].points, bin = p[1][0] - p[0][0];
      expect(p.reduce((s, [, y]) => s + y * bin, 0)).toBeCloseTo(1, 3);
    }
  });
});

describe('the outputs in PMF Sequences (R8, section 4)', () => {
  it.each([
    ['hbond/new/hbond_nvt.xvg', 'hbond_nvt.xvg', 'hbond'],
    ['hbond/legacy/hbond_nvt.xvg', 'hbond_nvt.xvg', 'hbond'],
    // Mislabelled, so not sent by default (question 34): the distributions read as an umbrella Histogram or as H-bonds,
    // and the donor and acceptor counts as H-bonds, from the "hbond" in their file name.
    ['hbond/new/hbond_nvt_dist.xvg', 'hbond_nvt_dist.xvg', 'hist'],
    ['hbond/new/hbond_nvt_ang.xvg', 'hbond_nvt_ang.xvg', 'hist'],
    ['hbond/new/hbond_nvt_dan.xvg', 'hbond_nvt_dan.xvg', 'hbond'],
    ['hbond/legacy/hbond_nvt_dist.xvg', 'hbond_nvt_dist.xvg', 'hbond'],
    ['hbond/legacy/hbond_nvt_ang.xvg', 'hbond_nvt_ang.xvg', 'hbond'],
  ])('%s → %s', (fixture, name, k) => {
    const t = text(fixture);
    expect(detectAna(getAnalyses(null), name, parseTable(t).head, parseGmxHeader(t)?.tool ?? null).k).toBe(k);
  });
});
