// Any command's result in compare (R10a): its main file, which group each curve measures, what one graph may draw
// together (like quantities only), and the analysis a record and its file make, from real gmx output.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { curveGroup, mainXvg, quantityOf, unlike } from '../src/core/cards';
import { fromRecord, type RecordLike } from '../src/decypher/parse';
import { kit, parseStructure } from '../src/core/index';
import { themeTokens } from '../src/core/tokens';
import { hbondTriplets, nearestPairs } from '../src/lib/hbond';
import { compactStruct } from '../src/decypher/export';

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
    // gmx labels its y "(nm)": the quantity is named in front.
    expect([a.xlabel, a.ylabel, a.sels.length, a.sels[0].name, a.sels[0].atoms.length, a.x.slice(0, 3)]).toEqual(['Atom', 'RMSF (nm)', 1, 'sulfate', 30, [1, 2, 3]]);
  });
  it('gmx mindist: a curve per selection, the reference in ink', () => {
    const a = make(rec('mindist', [g('reference', 'sulfate', '1-30', 'coral'), g('selection', 'sodium', '31-42', 'sky'), g('selection', 'water', '43-3242', 'mint')]), F('r9/mindist/mindist_nvt.xvg'));
    expect([a.ref?.name, a.sels.map(s => s.name)]).toEqual(['sulfate', ['sodium', 'water']]);
  });
  it('gmx energy: its terms, no atoms, so no structure', () => {
    const a = make(rec('energy', []), F('gmx-2025.4/energy-potential.xvg'));
    expect([a.sels.map(s => [s.name, s.atoms.length]), a.ref, a.ylabel]).toEqual([[['Bond', 0], ['Potential', 0]], null, 'energy (kJ/mol)']);
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

describe('RMSF on the structure (R10b)', () => {
  const struct = parseStructure(F('nvt/nvt.gro'), 'gro');
  const rmsf = (file: string, res: boolean) => fromRecord({ id: 'job:r', kind: 'job', title: 't', label: 'l', source: 'job', xvg: F(file), struct: null, structNote: '',
    record: { analysis: 'rmsf', groups: [{ role: 'selection', name: 'sulfate', atoms: '1-30', tone: 'coral' }], options: [{ flag: 'res', value: res }] } });
  const molOf = (atoms: number[]) => kit.buildMol(struct, new Set(atoms), new Set(), 'frame positions');

  it('per atom: each atom of the group its own value, in nm; every other atom none', () => {
    const a = rmsf('r9/rmsf/rmsf_nvt.xvg', false), p = kit.paintOf(a, molOf(a.sels[0].atoms))!;
    expect(a.paint).toMatchObject({ by: 'atom', label: 'RMSF', unit: 'nm' });
    expect([p.values.size, p.values.get(1), p.values.get(31)]).toEqual([30, 0.6309, undefined]);
    expect([p.min, p.max]).toEqual([Math.min(...a.sels[0].y), Math.max(...a.sels[0].y)]);
  });
  it('per residue: every atom of a residue its residue\'s value', () => {
    const a = rmsf('r9/rmsf-res/rmsf_nvt.xvg', true), p = kit.paintOf(a, molOf(a.sels[0].atoms))!;
    expect(a.paint?.by).toBe('residue');
    expect([1, 2, 3, 4, 5, 6, 10, 11].map(n => p.values.get(n))).toEqual([0.6251, 0.6251, 0.6251, 0.6251, 0.6251, 0.3175, 0.3175, 0.6191]);
  });
  it('the colour is the sequential ramp: its first stop at the lowest value, its last at the highest', () => {
    const pal = kit.palette(false, themeTokens(F('../../src/tokens.json'), F('../../src/roles.json')).light);
    expect([kit.rampAt(pal, 0), kit.rampAt(pal, 1)]).toEqual([pal.ramp[0], pal.ramp[pal.ramp.length - 1]]);
    expect(pal.ramp.length).toBe(4);
  });
  it('no other command paints its structure', () => {
    expect(fromRecord({ id: 'x', kind: 'job', title: 't', label: 'l', source: 'job', xvg: F('r9/rms/rmsd_nvt.xvg'), struct: null, structNote: '', record: { analysis: 'rms', groups: [] } }).paint).toBeUndefined();
  });
});

describe('H-bond pairs on the structure (R10c)', () => {
  const ndx = F('hbond/new/hbond_nvt_hbonds.ndx'), struct = parseStructure(F('nvt/nvt.gro'), 'gro');
  it('reads the donor, hydrogen, acceptor triplets gmx hbond found, from its own index file', () => {
    const t = hbondTriplets(ndx), numbers = ndx.split('[ hbonds_sulfate-water ]')[1].trim().split(/\s+/).map(Number);
    expect(t.length).toBe(numbers.length / 3);
    expect(t.slice(0, 2)).toEqual([[67, 68, 11], [67, 69, 11]]);
    expect(hbondTriplets('[ sulfate ]\n1 2 3\n')).toEqual([]);
  });
  it('draws the shortest hydrogen…acceptor pairs at the structure\'s positions, 200 by default, and counts the rest', () => {
    const t = hbondTriplets(ndx), p = nearestPairs(t, struct);
    expect([p.total, p.drawn.length]).toEqual([t.length, Math.min(200, t.length)]);
    const at = (nr: number) => { const i = struct.nr.indexOf(nr); return struct.xyz.slice(3 * i, 3 * i + 3) };
    // Across the box edges, as gmx measures: 97 of the 569 pairs are split by them in nvt.gro.
    const d = ([, h, a]: [number, number, number]) => Math.hypot(...at(h).map((v, k) => { const x = v - at(a)[k]; return x - 3.5 * Math.round(x / 3.5) }));
    expect(p.drawn.map(d)).toEqual(p.drawn.map(d).slice().sort((x, y) => x - y));
    expect(d(p.drawn[p.drawn.length - 1])).toBeLessThanOrEqual(Math.min(...t.filter(x => !p.drawn.includes(x)).map(d)));
    expect(nearestPairs(t, struct, 5).drawn.length).toBe(5);
  });
  it('keeps the molecules of the pairs drawn, though solvent is hidden, each by its partner across the box edge', () => {
    const pairs: [number, number, number][] = [[67, 68, 11], [2707, 2709, 28]];
    const mol = kit.buildMol(struct, new Set([1, 2, 3, 4, 5]), new Set(), 'frame positions', pairs)!;
    const nrs = new Set(mol.gnr), local = (nr: number) => { const k = mol.g2l[nr]; return [0, 1, 2].map(i => mol.local[3 * k + i]) };
    expect([nrs.has(67), nrs.has(68), nrs.has(69), nrs.has(71), nrs.has(2707)]).toEqual([true, true, true, false, true]);
    // 2709 and 28 are 3.33 nm apart in the file, 0.19 nm across the edge: the water is drawn by its sulfate.
    expect(Math.hypot(...local(2709).map((v, i) => v - local(28)[i]))).toBeCloseTo(0.187, 2);
    expect(mol.links).toEqual(['67-68-11', '2707-2709-28']);
    // Side by side, solvent stays hidden and no pair is drawn.
    const flat = kit.buildMol(struct, new Set([1, 2, 3, 4, 5]), new Set(), 'side by side', pairs)!;
    expect([flat.gnr.includes(67), flat.links]).toEqual([false, []]);
  });
  it('says how many were found and drawn, or why none is', () => {
    const p = nearestPairs(hbondTriplets(ndx), struct), mol = (arrange: 'frame positions' | 'side by side') => kit.buildMol(struct, new Set([1]), new Set(), arrange, p.drawn);
    expect(kit.pairsNote({ command: 'hbond', pairs: p }, mol('frame positions'))).toBe("569 pairs found over the trajectory, drawn dashed at the structure's positions: the 200 nearest · 369 not drawn");
    expect(kit.pairsNote({ command: 'hbond', pairs: p }, mol('side by side'))).toBe('569 pairs found over the trajectory: arrange the molecules in frame positions to draw them');
    expect(kit.pairsNote({ command: 'hbond' }, null)).toBe('no pairs drawn: this result came without its _hbonds.ndx');
    expect(kit.pairsNote({ command: 'hbond-legacy' }, null)).toMatch(/^gmx hbond-legacy writes no pairs/);
    expect(kit.pairsNote({ command: 'rmsf' }, null)).toBeNull();
  });
  it('keeps the paired molecules in an export, solvent being left out', () => {
    const kept = compactStruct(struct, new Set([1]), 4000, new Set([67, 68, 11]));
    expect([kept.nr.includes(67), kept.nr.includes(70), kept.nr.includes(71)]).toEqual([true, true, false]);
    expect(compactStruct(struct, new Set([1])).nr.includes(67)).toBe(false);
  });
});
