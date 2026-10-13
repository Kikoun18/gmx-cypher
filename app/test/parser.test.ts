import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as lib from '../src/lib/seq';

// R1a: the parser reads every header form the example files use, commas, nan and row names.
const ex = (n: string) => lib.parseTable(readFileSync(new URL('./fixtures/examples/' + n, import.meta.url), 'utf8'));
const table = (...lines: string[]) => lib.parseTable(lines.join('\n') + '\n');
const finite = (c: number[]) => c.filter(v => isFinite(v)).length;

describe('parser: the example files (R1a)', () => {
  it.each([
    ['translocation_free_energy.dat', 365, [365, 365], '', 'distance from the transmembrane state [nm]', 'free energy difference [kJ mol^{-1}]', []],
    ['membrane_thickness.dat', 86, [86, 74], '', 'radial distance from the protein center [nm]', 'average membrane thickness [nm]', []],
    ['order_POPE.xvg', 32, [32, 32, 32, 32], 'Atomistic order parameters for molecule type POPE', 'Atom', '-Sch', ['Full membrane', 'Upper leaflet', 'Lower leaflet']],
    ['phosphorus.xvg', 50, [50, 50], 'Partial density', 'Relative position from center (nm)', 'Density (kg m^{-3})', ['P']],
    ['pressure.xvg', 25001, [25001, 25001], 'GROMACS Energies', 'Time (ps)', '(bar)', ['Pressure']],
    ['temperature.xvg', 25001, [25001, 25001, 25001, 25001], 'GROMACS Energies', 'Time (ps)', '(K)', ['Temperature', 'T-Membrane', 'T-W_ION']],
  ])('%s', (f, n, fin, title, xLabel, yLabel, legends) => {
    const t = ex(f);
    expect([t.n, t.cols.map(finite)]).toEqual([n, fin]);
    expect({ ...t.head, rowLabels: undefined }).toEqual({ title, xLabel, yLabel, legends, rowLabels: undefined });
  });
  it('order_POPE.xvg names its 32 rows from the comment above each (# Atom C22:)', () => {
    const r = ex('order_POPE.xvg').head.rowLabels!;
    expect([r.length, r[0], r[1], r[31]]).toEqual([32, 'Atom C22', 'Atom C32', 'Atom C316']);
  });
  it('a GROMACS header, or comments above only some rows, names no rows', () => {
    expect(ex('phosphorus.xvg').head.rowLabels).toBeUndefined();
    expect(table('# x y', '1 2', '2 3', '# odd', '3 4').head.rowLabels).toBeUndefined();
    expect(table('# a:', '1 2', '# b:', '2 3').head.rowLabels).toEqual(['a', 'b']);
  });
});

describe('parser: header forms', () => {
  it('reads @ xlabel / @ ylabel, quoted or not', () => {
    expect(table('@ xlabel z [nm]', '@ylabel "G (kJ/mol)"', '1 2', '2 3').head).toMatchObject({ xLabel: 'z [nm]', yLabel: 'G (kJ/mol)' });
  });
  it('a later Grace setting line never wipes a label', () => {
    expect(table('@    title "RDF"', '@    xaxis  label "r (nm)"', '@    xaxis  label char size 1.25', '@ title font 0', '1 2', '2 3').head).toMatchObject({ title: 'RDF', xLabel: 'r (nm)' });
  });
});

describe('parser: values', () => {
  it('keeps nan and inf as missing values; a row without a finite x is dropped', () => {
    const t = table('1 nan', '2 -nan', '3 NaN', '4 inf', '5 7', 'nan 8');
    expect([t.n, t.cols[0], t.cols[1].map(v => (isFinite(v) ? v : null))]).toEqual([5, [1, 2, 3, 4, 5], [null, null, null, null, 7]]);
  });
  it('reads comma-separated values; an empty field is missing; a trailing comma adds nothing', () => {
    const t = table('# x,y1,y2', '1,2,3', '2, 4, 6', '3,,9', '4,8,12,');
    expect([t.n, t.cols.length, t.cols[1].map(v => (isFinite(v) ? v : null))]).toEqual([4, 3, [2, 4, null, 8]]);
  });
});

describe('parser: label markup becomes text with ^{…} and _{…}', () => {
  const lbl = (s: string) => table('@ yaxis label "' + s + '"', '1 2', '2 3').head.yLabel;
  it.each([
    ['Density (kg m\\S-3\\N)', 'Density (kg m^{-3})'],
    ['R\\sg\\N (nm)', 'R_{g} (nm)'],
    ['\\xD\\f{}G (kJ mol\\S-1\\N)', 'ΔG (kJ mol^{-1})'],
    ['\\xx\\f{} (nm)', 'ξ (nm)'],
    ['\\f{Symbol}a\\f{}-helix', 'α-helix'],
    ['\\+big\\- text', 'big text'],
    ['kJ mol$^{-1}$', 'kJ mol^{-1}'],
    ['area (nm$^2$)', 'area (nm^{2})'],
    ['$x_{com}$', 'x_{com}'],
    ['$\\Delta G$ / $\\AA$', 'ΔG / Å'],
    ['$\\mathrm{kJ\\,mol^{-1}}$', 'kJ mol^{-1}'],
    ['plain (nm)', 'plain (nm)'],
  ])('%s → %s', (raw, want) => expect(lbl(raw)).toBe(want));
});
