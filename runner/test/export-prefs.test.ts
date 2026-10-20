// Export settings (R6b): the Matrix's ExportPrefs, kept under gmx-cypher's own key, and file names from a template
// with gmx-cypher's fields.
import { describe, expect, it } from 'vitest';
import { cleanPrefs, fileName, PREFS, PREFS_KEY } from '../src/core/exportPrefs';
import { nameFields, type Naming } from '../src/lib/displayName';

const pg: Naming = { project: 'p1', name: 'Peptides', pathPattern: '{method}/{column}/{name}/{*}/{run}', columns: [{ k: 'SO4', label: 'sulfate' }] };
const job = (cwd: string) => ({ id: 'j1', title: 'rdf_nvt · sulfur → water_O', kind: 'rdf', cwd, created: '2026-10-19T18:02:00.000Z' });
const F = { project: 'Peptides', sequence: 'NA2SO4', column: 'sulfate', run: 'a', command: 'rdf', group: 'sulfur', date: '2026-10-20', file: 'rdf_nvt' };

describe('file names from the template', () => {
  it.each([
    ['the default: the run\'s own file', '{file}', F, 'svg', 'rdf_nvt.svg'],
    ['the project and the run\'s place in it', '{project}_{sequence}_{column}_{run}_{command}', F, 'pdf', 'Peptides_NA2SO4_sulfate_a_rdf.pdf'],
    ['the group and the date', '{sequence}-{group}-{date}', F, 'png', 'NA2SO4-sulfur-2026-10-20.png'],
    ['an empty field drops the separator before it', '{sequence}_{column}_{file}', { ...F, column: '' }, 'csv', 'NA2SO4_rdf_nvt.csv'],
    ['a leading empty field leaves no separator', '{project}_{file}', { ...F, project: '' }, 'svg', 'rdf_nvt.svg'],
    ['a field that is not one stays as its name', '{tab}_{file}', F, 'svg', 'tab_rdf_nvt.svg'],
    ['what a file name can\'t hold becomes _', '{file}', { ...F, file: 'rdf_nvt (3)' }, 'pdf', 'rdf_nvt_3.pdf'],
  ])('%s', (_, template, fields, ext, name) => expect(fileName(template, fields, ext)).toBe(name));

  it('a name taken (any case) gets -2, -3', () => {
    const taken = new Set<string>();
    expect(['{file}', '{file}', '{FILE}'].map(t => fileName(t, F, 'svg', taken))).toEqual(['rdf_nvt.svg', 'rdf_nvt-2.svg', 'FILE.svg']);
    expect(fileName('{file}', { ...F, file: 'RDF_NVT' }, 'svg', taken)).toBe('RDF_NVT-3.svg');
  });

  it("the date defaults to today's", () => {
    expect(fileName('{date}', { file: 'x' }, 'svg')).toMatch(/^\d{4}-\d{2}-\d{2}\.svg$/);
  });
});

describe("the fields: the connected project's name, the run's place by its pattern", () => {
  it.each([
    ['matched: the row, the column\'s label, the run', job('/home/me/sims/hmr+fast+6/so4/NA2SO4/9.multiwalker/1'), pg, { project: 'Peptides', sequence: 'NA2SO4', column: 'sulfate', run: 'a' }],
    ['a folder the pattern does not match: the project only', job('/home/me/scratch'), pg, { project: 'Peptides', sequence: '', column: '', run: '' }],
    ['no connected project: none', job('/home/me/sims/hmr+fast+6/so4/NA2SO4/9.multiwalker/1'), null, { project: '', sequence: '', column: '', run: '' }],
  ])('%s', (_, j, n, fields) => expect(nameFields(j, n)).toEqual(fields));
});

describe("the settings: the Matrix's fields, kept in this browser under gmx-cypher's own key", () => {
  it('nothing stored: the defaults, the file named as the run names it', () => {
    expect(PREFS_KEY).toBe('gmx-cypher-export');
    expect(cleanPrefs(null)).toEqual(PREFS);
    expect(PREFS).toMatchObject({ format: 'pdf', theme: 'light', unit: 'px', w: 0, font: 11, name: '{file}', layout: 'pdf', gridCols: 2 });
  });

  it('what is valid is kept; anything else falls back to its default', () => {
    const p = cleanPrefs({ format: 'svg', theme: 'print', w: 85, unit: 'mm', name: '{sequence}_{file}', font: 99, layout: 'grid', gridCols: 3, legendAt: 'nowhere' });
    expect(p).toMatchObject({ format: 'svg', theme: 'print', w: 85, unit: 'mm', name: '{sequence}_{file}', font: 11, layout: 'grid', gridCols: 3, legendAt: 'below' });
    expect(cleanPrefs({ name: '   ' }).name).toBe('{file}');
    expect(cleanPrefs({ format: 'xvg' }).format).toBe('pdf');
  });
});
