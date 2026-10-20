// Any command's result in compare (R10a): its main file, which group each curve measures, what one graph may draw
// together (like quantities only), and the analysis a record and its file make, from real gmx output.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { curveGroup, mainXvg, quantityOf, unlike } from '../src/core/cards';
import { fromRecord, type RecordLike } from '../src/decypher/parse';

const F = (p: string) => readFileSync(new URL('./fixtures/' + p, import.meta.url), 'utf8');
const out = (...names: string[]) => names.map(n => ({ kind: n.endsWith('.ndx') ? 'ndx' : 'xvg', path: '/sim/out/' + n }));

describe('the main file of a result', () => {
  it.each([
    ['rdf_nvt', out('rdf_nvt.xvg', 'rdf_nvt_cn.xvg', 'rdf_nvt.ndx'), 'rdf_nvt.xvg'],
    ['distance_nvt', out('distance_nvt_hist.xvg', 'distance_nvt.xvg', 'distance_nvt.ndx'), 'distance_nvt.xvg'],
    ['mindist_nvt', out('mindist_nvt_contacts.xvg', 'mindist_nvt.xvg'), 'mindist_nvt.xvg'],
    ['hbond_nvt', out('hbond_nvt_hbonds.ndx', 'hbond_nvt.xvg', 'hbond_nvt.ndx'), 'hbond_nvt.xvg'],
    // AWH: the last frame written; WHAM: the profile.
    ['awh_awh', out('awh_awh_t0.xvg', 'awh_awh_t10.xvg', 'awh_awh_t2.xvg'), 'awh_awh_t10.xvg'],
    ['wham_wham', out('wham_wham_profile.xvg', 'wham_wham_histo.xvg'), 'wham_wham_profile.xvg'],
    ['rdf_x', out('rdf_x.ndx'), null],
  ])('%s', (stem, outputs, want) => expect(mainXvg(outputs, stem)?.split('/').pop() ?? null).toBe(want));
});

describe('which group each curve measures', () => {
  const groups = [{ role: 'reference', name: 'sulfate' }, { role: 'selection', name: 'sodium' }, { role: 'selection', name: 'water' }];
  it.each([
    ['rdf', [1, 2, null]], ['distance', [1, 2, null]], ['mindist', [1, 2, null]], ['hbond', [1, null, null]],
    // gmx rms measures the fit group first, then each further one; rmsf and gyrate one group (gyrate's x, y, z parts none).
    ['rms', [0, 1, 2]], ['rmsf', [0, null, null]], ['gyrate', [0, null, null]], ['gyrate-legacy', [0, null, null]],
    ['energy', [null, null, null]], ['awh', [null, null, null]], ['wham', [null, null, null]],
  ] as const)('%s', (command, want) => expect([0, 1, 2].map(i => { const g = curveGroup(command, groups, i); return g ? groups.indexOf(g) : null })).toEqual(want));
});

describe('one graph draws only like quantities', () => {
  const r = (label: string, xlabel: string, ylabel: string) => ({ label, xlabel, ylabel });
  const rdf = r('rdf_a', 'r (nm)', 'g(r)'), rdf2 = r('rdf_b', 'r (nm)', 'g(r)'), rms = r('rms_a', 'Time (ps)', 'RMSD (nm)'), dist = r('distance_a', 'Time (ps)', 'Distance (nm)')
  const rmsf = r('rmsf_a', 'Atom', '(nm)'), energy = r('energy_a', 'Time (ps)', '(kJ/mol)'), gyr = r('gyrate_a', 'Time (ps)', 'Radius (nm)'), hb = r('hbond_a', 'Time (ps)', 'Number')
  it.each([
    ['two RDFs', rdf, rdf2, null],
    ['an RMSD and a distance: both nm over time', rms, dist, null],
    ['a radius and an RMSD', gyr, rms, null],
    ['per atom against over time', rms, rmsf, "rmsf_a's x is Atom, rms_a's Time (ps): one graph draws only like quantities"],
    ['g(r) against r and RMSD against time', rdf, rms, "rms_a's x is Time (ps), rdf_a's r (nm): one graph draws only like quantities"],
    ['kJ/mol against nm', rms, energy, "energy_a's y is in kJ/mol, rms_a's in nm: one graph draws only like quantities"],
    ['a count against a length', rms, hb, "hbond_a's y is Number, rms_a's RMSD (nm): one graph draws only like quantities"],
  ])('%s', (_, a, b, want) => expect(unlike(a, b)).toBe(want));
  it('reads a label\'s quantity and unit', () => {
    expect([quantityOf('RMSD (nm)'), quantityOf('(kJ/mol)'), quantityOf('g(r)'), quantityOf('Time (ps)')]).toEqual([
      { name: 'rmsd', unit: 'nm' }, { name: '', unit: 'kJ/mol' }, { name: 'g(r)', unit: '' }, { name: 'time', unit: 'ps' }])
  });
});

describe('a record and its main file as an analysis', () => {
  const rec = (analysis: string, groups: RecordLike['groups']): RecordLike => ({ analysis, groups, frames: { analysed: 21, lastTime: 20 } });
  const g = (role: string, name: string, atoms: string, tone: string) => ({ role, name, atoms, tone });
  const make = (r: RecordLike, xvg: string) => fromRecord({ id: 'job:x', kind: 'job', title: 't', label: 'l', source: 'job', record: r, xvg, struct: null, structNote: '' });

  it('gmx rms: a curve per group, the fit group first, each with its atoms; drawn from the data, no rule, no peaks', () => {
    const a = make(rec('rms', [g('reference', 'sulfate', '1-30', 'coral'), g('selection', 'sodium', '31-42', 'sky')]), F('r9/rms/rmsd_nvt.xvg'));
    expect([a.command, a.xlabel, a.ylabel, a.plot]).toEqual(['rms', 'Time (ps)', 'RMSD (nm)', { y: 'data', rule: null }]);
    expect(a.sels.map(s => [s.name, s.atoms.length, s.tone, s.peak])).toEqual([['sulfate', 30, 'coral', null], ['sodium', 12, 'sky', null]]);
    expect(a.ref).toBeNull();
  });
  it('gmx rmsf: one curve along the atoms of its group', () => {
    const a = make(rec('rmsf', [g('selection', 'sulfate', '1-30', 'coral')]), F('r9/rmsf/rmsf_nvt.xvg'));
    expect([a.xlabel, a.ylabel, a.sels.length, a.sels[0].name, a.sels[0].atoms.length, a.x.slice(0, 3)]).toEqual(['Atom', '(nm)', 1, 'sulfate', 30, [1, 2, 3]]);
  });
  it('gmx mindist: a curve per selection, the reference in ink', () => {
    const a = make(rec('mindist', [g('reference', 'sulfate', '1-30', 'coral'), g('selection', 'sodium', '31-42', 'sky'), g('selection', 'water', '43-3242', 'mint')]), F('r9/mindist/mindist_nvt.xvg'));
    expect([a.ref?.name, a.sels.map(s => s.name)]).toEqual(['sulfate', ['sodium', 'water']]);
  });
  it('gmx energy: its terms, no atoms, so no structure', () => {
    const a = make(rec('energy', []), F('gmx-2025.4/energy-potential.xvg'));
    expect([a.sels.map(s => [s.name, s.atoms.length]), a.ref, a.ylabel]).toEqual([[['Bond', 0], ['Potential', 0]], null, '(kJ/mol)']);
  });
  it('gmx gyrate: Rg is its group\'s; the parts about x, y and z are named so', () => {
    const a = make(rec('gyrate', [g('selection', 'sulfate', '1-30', 'coral')]), F('r9/gyrate/gyrate_nvt.xvg'));
    expect(a.sels.map(s => [s.name, s.atoms.length])).toEqual([['sulfate', 30], ['about x', 0], ['about y', 0], ['about z', 0]]);
  });
  it('an RDF stays as it was: g(r) from zero, with both peak rules', () => {
    const a = make(rec('rdf', [g('reference', 'sulfur', '5-30:5', 'coral'), g('selection', 'water_O', '43-3239:4', 'sky')]), F('gmx-2025.4/rdf_nvt.xvg'));
    expect([a.command, a.plot, a.sels[0].name, !!a.sels[0].peak]).toEqual([undefined, undefined, 'water_O', true]);
  });
});
