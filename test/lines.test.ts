// The lines compare draws on a structure (R10d): gmx distance's centres or pairs, gmx mindist's closest atoms, each
// with its length in this structure beside gmx's average; and the fit group of gmx rms. Measured on nvt.gro.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { kit, parseStructure } from '../src/core/index';
import { measureLines } from '../src/decypher/lines';
import { fromRecord, type RecordLike } from '../src/decypher/parse';
import { parseNdx } from '../src/lib/ndx';

const F = (p: string) => readFileSync(new URL('./fixtures/' + p, import.meta.url), 'utf8');
const struct = parseStructure(F('nvt/nvt.gro'), 'gro'), L = 3.5;
const groups = Object.fromEntries(parseNdx(F('distance/groups.ndx')).map(g => [g.name, g.atoms]));
const at = (nr: number) => { const i = struct.nr.indexOf(nr); return [0, 1, 2].map(k => struct.xyz[3 * i + k]) };
const mic = (v: number[]) => v.map(d => d - L * Math.round(d / L));
const len = (v: number[]) => Math.hypot(...v);
const sel = (name: string, atoms = groups[name]) => ({ name, atoms, y: [1, 2, 3] });
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
/** gmx's own value at nvt.gro's frame (t = 20 ps, the last row of its file): what each line's length here must be. */
const lastRow = (file: string) => F(file).split('\n').filter(l => l.trim() && !/^[#@]/.test(l)).pop()!.trim().split(/\s+/).slice(1).map(Number);

describe('the lines of gmx distance and gmx mindist (R10d)', () => {
  it('distance between centres: one line from the reference\'s centre to each group\'s, as long as gmx measured it in this frame', () => {
    const lines = measureLines('distance', 'com', { atoms: groups.sulfur }, [sel('sodium'), sel('water_O')], struct, [0.73881, 1.46874]);
    expect(lines.map(l => [l.group, l.kind, l.segs.length, l.gmx])).toEqual([['sodium', 'com', 1, 0.73881], ['water_O', 'com', 1, 1.46874]]);
    // Each of these groups is one element, so its centre of geometry is its centre of mass: gmx's own, across the box edges.
    const gmx = lastRow('distance/com/distance_nvt.xvg');
    lines.forEach((l, i) => { expect(l.here).toBeCloseTo(gmx[i], 2); expect(len(l.segs[0].v)).toBeCloseTo(l.here, 9); expect(l.segs[0].at).toEqual(groups.sulfur) });
  });
  it('anchors a line at the end that is drawn: a solvent reference is hidden, so the group\'s end holds it', () => {
    const [there] = measureLines('distance', 'cog', { atoms: groups.sulfur }, [sel('water_O')], struct, []);
    const [line] = measureLines('distance', 'cog', { atoms: groups.water_O }, [sel('sulfur')], struct, []);
    expect([line.segs[0].at, line.gmx]).toEqual([groups.sulfur, 2]);
    line.segs[0].v.forEach((v, k) => expect(v).toBeCloseTo(there.segs[0].v[k], 9));
  });
  it('distance between pairs: atom k with atom k, the mean length here', () => {
    const lines = measureLines('distance', 'pairs', { atoms: groups.sulfur }, [sel('sodium'), sel('water_O')], struct, [1.6424, 2.00448]);
    expect([lines[0].kind, lines[0].segs.map(s => s.at)]).toEqual(['pairs', groups.sulfur.map(a => [a])]);
    lastRow('distance/pairs/distance_nvt.xvg').forEach((v, i) => expect(lines[i].here).toBeCloseTo(v, 2));
    const want = groups.sulfur.map((a, k) => mic(at(groups.sodium[k]).map((v, j) => v - at(a)[j])));
    lines[0].segs.forEach((s, k) => s.v.forEach((v, j) => expect(v).toBeCloseTo(want[k][j], 9)));
  });
  it('mindist: the closest two atoms, across the box edges, and the mean of its curve as gmx\'s', () => {
    const lines = measureLines('mindist', null, { atoms: range(1, 30) }, [sel('sodium', range(31, 42)), sel('water', range(43, 3242))], struct, []);
    expect(lines.map(l => [l.kind, l.segs.length, l.gmx])).toEqual([['closest', 1, 2], ['closest', 1, 2]]);
    lastRow('r9/mindist/mindist_nvt.xvg').forEach((v, i) => { expect(lines[i].here).toBeCloseTo(v, 3); expect(len(lines[i].segs[0].v)).toBeCloseTo(v, 3) });
  });
  it('draws none without a reference, or for another command', () => {
    expect(measureLines('distance', 'com', null, [sel('sodium')], struct, [])).toEqual([]);
    expect(measureLines('rdf', null, { atoms: groups.sulfur }, [sel('sodium')], struct, [])).toEqual([]);
  });
  it('says what is drawn, and why a frame-positions view is needed', () => {
    const lines = measureLines('distance', 'com', { atoms: groups.sulfur }, [sel('sodium')], struct, [0.73881]);
    const mol = (arrange: 'frame positions' | 'side by side') => kit.buildMol(struct, new Set(groups.sulfur), new Set(), arrange);
    const a = { command: 'distance', lines, ref: { name: 'sulfur', atoms: groups.sulfur, tone: 'coral' as const } };
    expect(kit.structureNote(a, mol('frame positions'))).toBe("dashed: from sulfur's centre to each plotted group's, at the structure's positions, its length here beside gmx's average · centres of geometry: gmx measured centres of mass, which a structure file can't give");
    expect(kit.structureNote(a, mol('side by side'))).toMatch(/: arrange the molecules in frame positions to draw them$/);
    expect(kit.structureNote({ ...a, lines: measureLines('mindist', null, { atoms: groups.sulfur }, [sel('sodium')], struct, []) }, mol('frame positions'))).toMatch(/^dashed: the closest atoms of sulfur and each plotted group/);
    expect(kit.structureNote({ ...a, lines: measureLines('distance', 'cog', { atoms: groups.sulfur }, [sel('sodium')], struct, []) }, mol('frame positions'))).toMatch(/ · centres of geometry, as gmx measured$/);
  });
});

describe('the fit group of gmx rms (R10d)', () => {
  const g = (role: string, name: string, atoms: string, tone: string) => ({ role, name, atoms, tone });
  const rec = (fit?: string): RecordLike => ({ analysis: 'rms', groups: [g('reference', 'sulfate', '1-30', 'coral'), g('selection', 'sodium', '31-42', 'sky')], options: fit ? [{ flag: 'fit', value: fit }] : [] });
  const make = (r: RecordLike) => fromRecord({ id: 'x', kind: 'job', title: 't', label: 'l', source: 'job', xvg: F('r9/rms/rmsd_nvt.xvg'), struct: null, structNote: '', record: r });
  it('is shown on the structure, measured first, and named in the facts', () => {
    const a = make(rec());
    expect([a.fit?.name, a.fit?.atoms.length, a.sels[0].name]).toEqual(['sulfate', 30, 'sulfate']);
    expect(a.sub).toContain('fit on sulfate');
    expect(kit.structureNote(a, null)).toBe('fitted on sulfate, which is measured first; each further group is measured after the same fit');
  });
  it('is none with -fit none', () => {
    const a = make(rec('none'));
    expect([a.fit, a.sub.includes('no fit'), kit.structureNote(a, null)]).toEqual([undefined, true, 'no fit: each group is measured where it is']);
  });
});
