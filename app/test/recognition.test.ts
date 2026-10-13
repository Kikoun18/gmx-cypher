import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as lib from '../src/lib/seq';
import { parseGmxHeader } from '../src/lib/gmxHeader';
import type { AnalysisType, XvgHead } from '../src/lib/types';

// R1b: evidence in a stated order (F114); an unknown file becomes Data, never a PMF (F83).
const types = lib.getAnalyses({});
const read = (n: string) => readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8');
const detect = (f: string, name = f.split('/').pop()!) => { const s = read(f); return lib.detectAna(types, name, lib.parseTable(s).head, parseGmxHeader(s)?.tool); };
const head = (o: Partial<XvgHead>) => ({ title: '', xLabel: '', yLabel: '', legends: [], ...o });

describe('recognition: every example file and existing fixture', () => {
  it.each([
    ['examples/translocation_free_energy.dat', 'free-energy', 'header'],
    ['examples/membrane_thickness.dat', 'data', 'generic'],
    ['examples/order_POPE.xvg', 'order', 'header'],
    ['examples/phosphorus.xvg', 'density', 'header'],
    ['examples/temperature.xvg', 'temperature', 'header'],
    ['examples/pressure.xvg', 'pressure', 'header'],
    ['hmrfast6_ha_a_t200000.xvg', 'pmf', 'header'],
    ['gmx/07.md_hbdist_protein_sugar.xvg', 'hbond', 'header'],
    ['gmx/07.md_mindist_protein_sugar.xvg', 'dist', 'header'],
    ['gmx/07.md_numcont_protein_sugar.xvg', 'data', 'generic'],
    ['gmx/07.md_rdf_protein_sugar.xvg', 'rdf', 'header'],
    ['gmx/hist_500000.xvg', 'hist', 'header'],
  ])('%s → %s (%s)', (f, k, from) => expect(detect(f)).toEqual({ k, from }));
});

describe('recognition: the rules', () => {
  const d = (name: string, h?: Partial<XvgHead>, tool: string | null = null) => lib.detectAna(types, name, h ? head(h) : null, tool);
  it('file names count as whole words, and the most matched words win', () => {
    expect(d('translocation_free_energy.dat')).toEqual({ k: 'free-energy', from: 'name' });
    expect(d('total_energy.xvg')).toEqual({ k: 'energy', from: 'name' });
    expect(d('radiality.xvg')).toEqual({ k: 'data', from: 'generic' });
    expect(d('my-rdf.xvg')).toEqual({ k: 'rdf', from: 'name' });
  });
  it('ties go by list order', () => {
    expect(d('pmf_distance_ha.xvg')).toEqual({ k: 'pmf', from: 'name' });
  });
  it('the x label is never evidence ("distance" is not a radial coordinate)', () => {
    expect(d('profile.dat', { xLabel: 'distance from the transmembrane state [nm]' })).toEqual({ k: 'data', from: 'generic' });
  });
  it('legends are header evidence; the GROMACS tool outranks words', () => {
    expect(d('x.xvg', { title: 'GROMACS Energies', yLabel: '(kJ/mol)', legends: ['Potential'] }, 'gmx energy')).toEqual({ k: 'energy', from: 'header' });
    expect(d('rdf.xvg', { title: 'GROMACS Energies', legends: ['Pressure'] }, 'gmx energy')).toEqual({ k: 'pressure', from: 'header' });
    expect(d('x.xvg', { title: 'Radial density' }, 'gmx density')).toEqual({ k: 'density', from: 'header' });
  });
  it('a bare two-column file becomes Data, never PMF', () => {
    expect(d('plain.xvg')).toEqual({ k: 'data', from: 'generic' });
    expect(d('x.xvg', { title: 'Number of Contacts' })).toEqual({ k: 'data', from: 'generic' });
  });
});

describe('the type list (F84, F114)', () => {
  const keys = (l: AnalysisType[]) => l.map(t => t.k);
  it('has the seven batch-3 built-ins, Energy recognising gmx energy, Data last', () => {
    expect(keys(types)).toEqual(['pmf', 'hist', 'rdf', 'rmsd', 'rmsf', 'rg', 'hbond', 'dist', 'energy', 'free-energy', 'density', 'order', 'temperature', 'pressure', 'data']);
    expect(types.filter(t => t.tools).map(t => [t.k, t.tools])).toEqual([['energy', 'gmx energy'], ['density', 'gmx density'], ['temperature', 'gmx energy'], ['pressure', 'gmx energy']]);
  });
  it('a list saved before batch 3 (no Data) gains the new types after its own, and built-ins gain their tools', () => {
    const saved = JSON.parse(read('formats/schema-3-vault/.matrix/settings/pmv3ncwehsvzci/analyses.json')).analyses as AnalysisType[];
    const own = { ...lib.newAnalysis(saved, 'Contacts'), match: 'contacts' };
    const l = lib.getAnalyses({ analyses: saved.filter(a => a.k !== 'rmsd').concat(own) });
    expect(keys(l)).toEqual(['pmf', 'hist', 'rdf', 'rmsf', 'rg', 'hbond', 'dist', 'energy', 'contacts', 'free-energy', 'density', 'order', 'temperature', 'pressure', 'data']);
    expect([l.find(t => t.k === 'energy')!.tools, l.find(t => t.k === 'hist')!.smooth]).toEqual(['gmx energy', 2]);
    expect(lib.projectAnalyses({ analyses: saved })).toEqual(lib.getAnalyses({ analyses: saved }).slice(1));
  });
  it('a batch-3 list keeps what you removed and the tools you cleared', () => {
    const l = lib.getAnalyses({ analyses: lib.DEFAULT_ANALYSES.filter(a => a.k !== 'pressure').map(a => (a.k === 'energy' ? { ...a, tools: '' } : a)) });
    expect([keys(l).includes('pressure'), l.find(t => t.k === 'energy')!.tools]).toEqual([false, '']);
  });
});
