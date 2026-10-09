import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseHelp } from '../src/lib/gmxText';
import { FORM, rdfArgs, rdfIo, recipeProblems, relPath } from '../src/lib/rdf';

const help = parseHelp(readFileSync(new URL('./fixtures/gmx-2025.4/rdf-h.txt', import.meta.url), 'utf8'));
const io = { trajectory: 'nvt.xtc', runInput: 'nvt.tpr', index: 'rdf/rdf_nvt.ndx', output: 'rdf/rdf_nvt.xvg', cn: 'rdf/rdf_nvt_cn.xvg' };
const base = ['rdf', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'rdf/rdf_nvt.ndx', '-o', 'rdf/rdf_nvt.xvg'];
const groups = ['-ref', 'group 0', '-sel', 'group 1'];

describe('the gmx rdf argv (T22, T23): only what differs from the installed defaults', () => {
  it.each<[string, Record<string, string | boolean>, string[]]>([
    ['defaults', {}, []],
    ['a default given again', { bin: '0.002', rmpbc: true, xy: false, norm: 'rdf', rmax: '0.000' }, []],
    ['bin', { bin: '0.01' }, ['-bin', '0.01']],
    ['frames, in the order gmx lists them', { dt: '2', e: '15', b: '5' }, ['-b', '5', '-e', '15', '-dt', '2']],
    ['a switch on', { xy: true }, ['-xy']],
    ['a switch off', { pbc: false }, ['-nopbc']],
    ['exclusions', { excl: true }, ['-excl']],
    ['enums', { norm: 'none', selrpos: 'mol_com', seltype: 'res_com', surf: 'mol' }, ['-selrpos', 'mol_com', '-seltype', 'res_com', '-norm', 'none', '-surf', 'mol']],
    ['distances', { cut: '0.3', rmax: '1.5' }, ['-cut', '0.3', '-rmax', '1.5']],
  ])('%s', (_, options, extra) => {
    expect(rdfArgs({ options, selections: 1 }, io, help)).toEqual([...base, ...extra, ...groups]);
  });

  it('the cumulative number, and several selections in one pass (T26)', () => {
    expect(rdfArgs({ options: { cn: true }, selections: 3 }, io, help)).toEqual([...base, '-cn', 'rdf/rdf_nvt_cn.xvg', '-ref', 'group 0', '-sel', 'group 1', 'group 2', 'group 3']);
  });

  it('fixes -tu ps and -xvg xmgrace, passed only where the installed default differs', () => {
    const other = help.map(o => (o.flag === 'tu' ? { ...o, default: 'ns' } : o));
    expect(rdfArgs({ options: {}, selections: 1 }, io, other)).toEqual([...base, '-tu', 'ps', ...groups]);
  });

  it('refuses options the form does not set, or this gmx does not have', () => {
    expect(() => rdfArgs({ options: { sf: 'x.dat' }, selections: 1 }, io, help)).toThrow('-sf is not an option gmx-cypher sets');
    expect(() => rdfArgs({ options: { bin: '0.01' }, selections: 1 }, io, help.filter(o => o.flag !== 'bin'))).toThrow('this gmx rdf has no -bin');
  });

  it('offers the options of section 10.1 plus -pbc and -rmpbc', () => {
    expect(FORM.map(f => f.flag).sort()).toEqual(['b', 'bin', 'cn', 'cut', 'dt', 'e', 'excl', 'norm', 'pbc', 'rmax', 'rmpbc', 'selrpos', 'seltype', 'surf', 'xy'].sort());
  });
});

describe('options gmx would refuse, said before running (checked with 2025.4)', () => {
  it.each<[Record<string, string | boolean>, string[]]>([
    [{}, []],
    [{ excl: true }, []],
    [{ excl: true, seltype: 'mol_com' }, ['-excl needs atom positions: set -seltype to atom']],
    [{ surf: 'mol' }, []],
    [{ surf: 'mol', seltype: 'mol_com' }, ['-surf needs atom positions: set -seltype to atom']],
    [{ surf: 'res', norm: 'none' }, ["-surf can't be combined with -norm: gmx normalises nothing with -surf"]],
    [{ bin: '0' }, ['-bin must be above 0']],
    [{ bin: 'x', rmax: '-1' }, ['-bin: not a number: x', '-rmax must be 0 or more']],
    [{ norm: 'other' }, ['-norm: one of rdf, number_density, none']],
    [{ b: '10', e: '5' }, ['-e must be after -b']],
  ])('%j → %j', (options, want) => expect(recipeProblems(options, help)).toEqual(want));
});

describe('paths as gmx gets them: relative to the trajectory folder (T29)', () => {
  it.each([
    ['/sim/nvt', '/sim/nvt/nvt.tpr', 'nvt.tpr'],
    ['/sim/nvt', '/sim/nvt.tpr', '../nvt.tpr'],
    ['/sim/nvt', '/sim/eq/em.tpr', '../eq/em.tpr'],
    ['/sim/nvt', '/sim/nvt/rdf/a.xvg', 'rdf/a.xvg'],
    ['/a/b/c', '/x/y.tpr', '../../../x/y.tpr'],
  ])('from %s: %s → %s', (from, to, want) => expect(relPath(from, to)).toBe(want));

  it('plans the run in the trajectory folder, outputs in rdf/', () => {
    expect(rdfIo({ trajectory: '/sim/nvt/nvt.xtc', runInput: '/sim/nvt.tpr' }, 'rdf_nvt')).toEqual({
      cwd: '/sim/nvt', io: { trajectory: 'nvt.xtc', runInput: '../nvt.tpr', index: 'rdf/rdf_nvt.ndx', output: 'rdf/rdf_nvt.xvg', cn: 'rdf/rdf_nvt_cn.xvg' },
    });
  });
});
