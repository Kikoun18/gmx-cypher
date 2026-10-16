import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseHelp } from '../src/lib/gmxText';
import { awhArgv, awhFrames, awhNames, awhOptionProblems, awhTargetError, framesWritten, frameOptions, type AwhFrame } from '../src/lib/awh';
import { DEFAULT_PATTERN, detectAna, getAnalyses, parseName, parseTable } from '../../matrix/src/lib/seq';
import { parseGmxHeader } from '../../matrix/src/lib/gmxHeader';

// A real AWH run (GROMACS 2025.4, test/fixtures/awh/): one bias, AWH data every 2 ps from 0 to 20 ps, and the
// 11 files `gmx awh -o awh/awh.xvg` wrote for it.
const FIX = new URL('./fixtures/', import.meta.url);
const OUT = readdirSync(new URL('awh/out/', FIX));
const frames = awhFrames('awh', OUT);
const times = (f: AwhFrame[]) => f.map(x => x.time);
const help = parseHelp(readFileSync(new URL('gmx-2025.4/awh-h.txt', FIX), 'utf8'));

describe('the frames gmx awh writes (R5): read back from its file names', () => {
  it('the real run: 11 frames, 0 to 20 ps, one bias, in time order', () => {
    expect(times(frames)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(frames.every(f => f.bias === null)).toBe(true);
    expect(frames[10]).toEqual({ suffix: '_t20.xvg', bias: null, time: 20 });
  });

  it('two biases (2025.4 appends the bias number to the stem, with no separator), and times with decimals', () => {
    expect(awhFrames('x', ['x1_t0.xvg', 'x2_t0.xvg', 'x1_t2.5.xvg', 'notes.txt'])).toEqual([
      { suffix: '1_t0.xvg', bias: 1, time: 0 }, { suffix: '2_t0.xvg', bias: 2, time: 0 }, { suffix: '1_t2.5.xvg', bias: 1, time: 2.5 },
    ]);
  });

  it("only this stem's files: another run's files beside them are not read as frames", () => {
    expect(awhFrames('awh', ['awh_t0.xvg', 'awh (2)_t0.xvg', 'awhx_t0.xvg', 'awh_t0.xvg.bak', 'awh.xvg'])).toEqual([{ suffix: '_t0.xvg', bias: null, time: 0 }]);
  });
});

describe('the frame choice (R5): last, every N-th, or all, and how many files each writes', () => {
  it.each<[string, Parameters<typeof frameOptions>[1], Record<string, string>, number[]]>([
    ['the last time only', { kind: 'last' }, { b: '20' }, [20]],
    ['every 4th, for convergence', { kind: 'every', n: 4 }, { skip: '4' }, [0, 8, 16]],
    ['every 2nd', { kind: 'every', n: 2 }, { skip: '2' }, [0, 4, 8, 12, 16, 20]],
    ['all', { kind: 'all' }, {}, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]],
  ])('%s', (_, choice, options, written) => {
    expect(frameOptions(frames, choice)).toEqual(options);
    expect(times(framesWritten(frames, options))).toEqual(written);
  });

  // Each checked with gmx awh 2025.4 on the same file: -b and -e narrow the frames first, then -skip counts from the first left.
  it.each<[Record<string, string>, number[]]>([
    [{ b: '4', skip: '3' }, [4, 10, 16]],
    [{ e: '9', skip: '2' }, [0, 4, 8]],
    [{ b: '5', e: '15' }, [6, 8, 10, 12, 14]],
    [{ skip: '1' }, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]],
    [{ b: '20.5' }, []],
  ])('as gmx does it: %o → %o', (options, written) => {
    expect(times(framesWritten(frames, options))).toEqual(written);
  });

  it('with two biases, the last time gives a file per bias', () => {
    const two = awhFrames('x', ['x1_t0.xvg', 'x2_t0.xvg', 'x1_t2.xvg', 'x2_t2.xvg']);
    expect(frameOptions(two, { kind: 'last' })).toEqual({ b: '2' });
    expect(framesWritten(two, { b: '2' }).map(f => f.suffix)).toEqual(['1_t2.xvg', '2_t2.xvg']);
  });
});

describe('names (R5): the output stem gives the Matrix\'s own pattern', () => {
  it('a stem like hmrfast6_ha_WRWYCR gives hmrfast6_ha_WRWYCR_t20.xvg, which the Matrix reads back field by field', () => {
    const [name] = awhNames('hmrfast6_ha_WRWYCR', framesWritten(frames, { b: '20' }));
    expect(name).toBe('hmrfast6_ha_WRWYCR_t20.xvg');
    expect(parseName(name, DEFAULT_PATTERN)).toEqual({ matched: true, fields: { group: 'hmrfast6', col: 'ha', seq: 'WRWYCR', time: '20' } });
  });

  it('every frame of a run gets its own name, in time order', () => {
    expect(awhNames('awh_run', framesWritten(frames, { skip: '4' }))).toEqual(['awh_run_t0.xvg', 'awh_run_t8.xvg', 'awh_run_t16.xvg']);
  });
});

describe('the AWH output in the Matrix (R5): a PMF, and its target error', () => {
  const text = readFileSync(new URL('awh/out/awh_t20.xvg', FIX), 'utf8');

  it('is typed PMF from its header, whatever its name', () => {
    const h = parseGmxHeader(text)!, t = parseTable(text);
    expect(h.tool).toBe('gmx awh');
    expect(detectAna(getAnalyses(null), 'anything.xvg', t.head, h.tool)).toEqual({ k: 'pmf', from: 'header' });
    expect(t.head.yLabel).toBe('(kJ/mol)');
  });

  it('its target error, from the AWH metadata line', () => {
    expect(awhTargetError(text)).toEqual({ kT: 3.98, kJ: 9.94 });
    expect(awhTargetError('@ title "AWH"\n0 0\n')).toBeNull();
  });
});

describe('the awh argument list and refusals (R5)', () => {
  const io = { edr: 'awh.edr', tpr: 'topol.tpr', output: 'awh/awh_run.xvg' };

  it('the files, then only the options that differ from the installed defaults', () => {
    expect(awhArgv({ options: {} }, io, help)).toEqual(['awh', '-f', 'awh.edr', '-s', 'topol.tpr', '-o', 'awh/awh_run.xvg']);
    expect(awhArgv({ options: { b: '20', more: true } }, io, help)).toEqual(['awh', '-f', 'awh.edr', '-s', 'topol.tpr', '-o', 'awh/awh_run.xvg', '-b', '20', '-more']);
    expect(awhArgv({ options: { skip: '4' } }, io, help)).toEqual(['awh', '-f', 'awh.edr', '-s', 'topol.tpr', '-o', 'awh/awh_run.xvg', '-skip', '4']);
  });

  it('kT is not offered: vault outputs are kJ/mol (section 1.4)', () => {
    expect(() => awhArgv({ options: { kt: true } }, io, help)).toThrow('-kt is not an option gmx-cypher sets for awh');
  });

  it.each<[Record<string, string | boolean>, string[]]>([
    [{ skip: '-1' }, ['-skip must be 0 or more']],
    [{ skip: '1.5' }, ['-skip: a whole number: 1.5']],
    [{ b: 'x' }, ['-b: not a number: x']],
    [{ b: '10', e: '5' }, ['-e must be after -b']],
    [{ skip: '4', more: true }, []],
  ])('%o → %o', (options, problems) => {
    expect(awhOptionProblems(options, help)).toEqual(problems);
  });

  it('2023.3 has the same options', () => {
    const old = parseHelp(readFileSync(new URL('gmx-2023.3/awh-h.txt', FIX), 'utf8')).map(o => o.flag);
    expect(old).toEqual(help.map(o => o.flag));
  });
});
