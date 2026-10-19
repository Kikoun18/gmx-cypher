import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decypherKit, type Analysis, type VNode } from '../src/decypher/kit'
import { fromFiles, fromRecord, fromVault, parseGro, parsePdb, parseXvg, peakOf, shortLabels, type RecordLike } from '../src/decypher/parse'
import { themeTokens } from '../src/decypher/tokens'
import { RUNNER } from './helpers'

const kit = decypherKit()
const F = RUNNER + 'test/fixtures/decypher/'
const read = (n: string) => readFileSync(F + n, 'utf8')
const NAMES = ['9.multiwalker.gro', 'mmmmmmmm.gro', 'rdf_o111_Methionine_H.ndx', 'rdf_o111_Methionine_H.run.json', 'rdf_o111_Methionine_H.xvg', 'rdf_o111_Methionine_S.ndx', 'rdf_o111_Methionine_S.run.json', 'rdf_o111_Methionine_S.xvg']
const files = () => fromFiles(NAMES.map(n => ({ path: 'o111/' + n, text: read(n) })))
const TOKENS = themeTokens(read('../../../src/tokens.json'))
const tokens = (dark: boolean) => TOKENS[dark ? 'dark' : 'light']
const pal = kit.palette(true, tokens(true))
/** Every node of a chart tree with its tag. */
const nodes = (n: VNode | string, tag: string): VNode[] => (typeof n === 'string' ? [] : [...(n[0] === tag ? [n] : []), ...n.slice(2).flatMap(c => nodes(c as VNode, tag))])

describe('(de)Cypher reads your runs as the RDF Explorer design does', () => {
  it('links each .xvg to its record, index and the structure with enough atoms', () => {
    const { analyses, files: rows } = files()
    expect(analyses.map(a => a.title)).toEqual(['rdf_o111_Methionine_H.xvg', 'rdf_o111_Methionine_S.xvg'])
    const [h, s] = analyses
    expect(h.ref).toMatchObject({ name: 'H_Met' })
    expect(h.ref!.atoms).toHaveLength(24)
    // Your S run's reference is the sulfurs, under the name H_Met: the same name, other atoms.
    expect(s.ref).toMatchObject({ name: 'H_Met', atoms: [123, 140, 157, 174, 191, 208, 225, 242] })
    expect(h.sels.map(g => g.name)).toEqual(['NH_N...S', 'NH_H...S', 'O5...S', 'O...S', 'OH_O...S', 'OH_H...S', 'CH...S', 'CH2...S', 'CH3_C...S', 'CH3_H...S', 'CH2OH_CH2...S', 'CH2OH_O...S', 'CH2OH_H...S'])
    // The hues the groups had in gmx-cypher; atoms from the index.
    expect(h.sels[0]).toMatchObject({ tone: 'aqua', atoms: [10] })
    expect(h.sels[2].atoms).toEqual([7, 34, 55, 75, 95])
    // The peptide alone has 139 atoms; the groups reach atom 246: only the system's structure fits.
    expect(h.struct).toBe('file:o111/9.multiwalker.gro')
    expect(h.sub).toBe('files · 51 frames · bin 0.03 nm · ref H_Met')
    expect(rows.find(r => r.path.endsWith('mmmmmmmm.gro'))!.status).toBe('✓ 139 atoms · not linked')
    expect(rows.find(r => r.path.endsWith('Methionine_H.xvg'))!.status).toBe('✓ 13 curves · 115 points → rdf_o111_Methionine_H.run.json, rdf_o111_Methionine_H.ndx, 9.multiwalker.gro')
    expect(shortLabels(analyses.map(a => a.label))).toEqual(['Methionine_H', 'Methionine_S'])
  })

  it("a dropped record whose job didn't finish is not used: its row says so (R2b)", () => {
    const rec = JSON.parse(read('rdf_o111_Methionine_H.run.json'))
    const { files } = fromFiles([{ path: 'cut.run.json', text: JSON.stringify({ ...rec, status: 'running', complete: false }) }])
    expect(files[0].status).toBe("✗ an incomplete record: its job didn't finish")
  })

  it('a peak is the highest point of the curve, not the first shell\'s; an index without a record names the groups by the legends', () => {
    const { analyses } = fromFiles(['rdf_o111_Methionine_H.xvg', 'rdf_o111_Methionine_H.ndx'].map(n => ({ path: n, text: read(n) })))
    const a = analyses[0], x = parseXvg(read('rdf_o111_Methionine_H.xvg'))
    expect(a.ref!.name).toBe('H_Met')
    expect(a.sels.map(g => g.name)).toEqual(x.legends)
    expect(a.struct).toBeNull()
    expect(a.structNote).toBe('no .gro or .pdb among the files')
    // Every curve's peak is its highest value, at the r where it is.
    for (const g of a.sels) {
      const top = Math.max(...g.y)
      if (top > 0) expect(g.peak).toEqual({ r: a.x[g.y.indexOf(top)], g: top })
      else expect(g.peak).toBeNull()
    }
  })

  it('peakOf: an early rise to 2 is not the peak when the curve climbs to 8.7 after it', () => {
    const x = [0.1, 0.2, 0.27, 0.3, 0.33, 0.4, 0.5], y = [0, 0, 2, 1.5, 8.7, 4, 1]
    expect(peakOf(x, y)).toEqual({ r: 0.33, g: 8.7 })
    expect(peakOf(x, [0, 3, 1, 3, 2, 0, 0])).toEqual({ r: 0.2, g: 3 })
    expect(peakOf(x, [0, 0, 0, 0, 0, 0, 0])).toBeNull()
    expect(peakOf([], [])).toBeNull()
  })

  it('values under the pointer come highest first, equal ones in the curves\' order', () => {
    const [h, s] = files().analyses
    const curves = kit.buildCurves({ focus: h, plotted: [h, s], selected: h.sels.map(g => g.name), colorBy: 'group', pal, tones: {} })
    const r = h.x[10], rows = kit.hoverRows(curves, r)
    expect(rows).toHaveLength(curves.length)
    expect(rows.map(x => x.v)).toEqual(rows.map(x => x.v).slice().sort((p, q) => q - p))
    expect(rows.map(x => x.v).sort((p, q) => p - q)).toEqual(curves.map(c => kit.valAt(c.x, c.y, r)).sort((p, q) => p - q))
    const flat = curves.slice(0, 3).map((c, i) => ({ ...c, key: 'f' + i, y: c.y.map(() => 1) }))
    expect(kit.hoverRows(flat, r).map(x => x.curve.key)).toEqual(['f0', 'f1', 'f2'])
  })

  it('a job: its record and its g(r)', () => {
    const rec = JSON.parse(read('rdf_o111_Methionine_S.run.json')) as RecordLike
    const a = fromRecord({ id: 'job:x', kind: 'job', title: 'rdf_o111_Methionine_S', label: 'rdf_o111_Methionine_S', source: 'job', record: rec, xvg: read('rdf_o111_Methionine_S.xvg'), struct: 's', structNote: '' })
    expect(a.ref).toMatchObject({ name: 'H_Met', tone: rec.groups[0].tone })
    expect(a.sels).toHaveLength(13)
    expect(a.sels[1].atoms).toEqual([11])
    expect(a.x).toHaveLength(115)
    expect(a.sub).toBe('job · 51 frames · bin 0.03 nm · ref H_Met · 8 atoms')
  })

  it('an RDF of the vault: columns as the vault records them, atoms from the run that wrote the file', () => {
    const text = read('rdf_o111_Methionine_H.xvg'), rec = JSON.parse(read('rdf_o111_Methionine_H.run.json')) as RecordLike
    const a = fromVault({ id: 'vault:p/r/a', title: 'WRWYCR × HA', label: 'WRWYCR', source: 'vault', curves: [{ label: 'O5…S', text, xCol: 1, yCol: 4, xScale: 1 }, { label: 'CH', text, xCol: 1, yCol: 8, xScale: 1 }], record: rec, struct: null, structNote: '' })
    expect(a.sels.map(g => [g.name, g.atoms])).toEqual([['O5…S', [7, 34, 55, 75, 95]], ['CH', [2, 6, 9, 19, 22, 31, 33, 36, 40, 44, 52, 54, 57, 61, 64, 72, 74, 77, 84, 92, 94, 97, 104]]])
    expect(a.sels[0].y).toEqual(parseXvg(text).ys[2])
    expect(a.ref!.name).toBe('H_Met')
    const bare = fromVault({ id: 'v', title: 't', label: 'l', source: 'vault', curves: [{ label: 'a', text, xCol: 1, yCol: 2, xScale: 1 }], record: null, struct: null, structNote: '' })
    expect(bare.sels[0].atoms).toEqual([])
    expect(bare.sub).toContain('no atom groups (no run of this gmx-cypher wrote this file)')
  })

  it('structures: a .gro in nm, a .pdb from Å, and the drawable molecule without solvent', () => {
    const g = parseGro(read('9.multiwalker.gro'))
    expect(g).toMatchObject({ n: 279, box: [6.95022, 6.95022, 6.95022] })
    expect(g.nr[278]).toBe(279)
    const p = parsePdb('CRYST1   30.000   30.000   30.000  90.00  90.00  90.00 P 1\nATOM      1  N   MET A   1      -4.700  -2.470   5.000  1.00  0.00           N\nATOM      2  CA  MET A   1      -3.700  -2.470   5.000  1.00  0.00           C\nEND\n')
    expect(p).toMatchObject({ n: 2, box: [3, 3, 3], name: ['N', 'CA'], resn: ['MET', 'MET'] })
    expect(p.xyz[0]).toBeCloseTo(-0.47)
    const mol = kit.buildMol(g, new Set([10]), new Set([125]), 'side by side')!
    expect(mol.n).toBe(249)
    expect(mol.hidden).toBe(30)
    expect(mol.molLabels).toContain('MET × 8')
    expect(mol.g2l[10]).toBeGreaterThanOrEqual(0)
    expect(mol.g2l[260] ?? -1).toBe(-1)
    // The molecule with a plotted atom is laid out first.
    expect(mol.comp[mol.g2l[10]]).toBe(0)
  })

  it('compares: the same group in another run by its atoms; curves differ by hue and dash', () => {
    const [h, s] = files().analyses
    const g = h.sels[2], m = kit.matchGroup(g, s, h)
    expect(m!.name).toBe(g.name)
    expect(m!.y).not.toEqual(g.y)
    const byGroup = kit.buildCurves({ focus: h, plotted: [h, s], selected: ['O5...S', 'CH...S'], colorBy: 'group', pal, tones: {} })
    expect(byGroup.map(c => [c.name, c.analysis, c.dash])).toEqual([['O5...S', h.id, 'none'], ['O5...S', s.id, '5 4'], ['CH...S', h.id, 'none'], ['CH...S', s.id, '5 4']])
    expect(byGroup[0].color).toBe(pal.hues[g.tone].strong)
    expect(new Set(byGroup.map(c => c.color)).size).toBe(4)
    const byJob = kit.buildCurves({ focus: h, plotted: [h, s], selected: ['O5...S', 'CH...S'], colorBy: 'job', pal, tones: { [h.id]: 'sky', [s.id]: 'rose' } })
    expect(byJob[0].color).toBe(pal.hues.sky.strong)
    expect(byJob[1].color).toBe(pal.hues.rose.strong)
    expect(byJob.map(c => c.dash)).toEqual(['none', 'none', '5 4', '5 4'])
  })

  it('the chart: axes, a path and a peak per curve, a rule where the pointer is', () => {
    const [h] = files().analyses
    const curves = kit.buildCurves({ focus: h, plotted: [h], selected: ['O5...S'], colorBy: 'group', pal, tones: {} })
    const { tree, geom } = kit.chart({ W: 600, H: 360, curves, grid: h.x, xlabel: h.xlabel, ylabel: h.ylabel, hover: 0.6, peaks: true, pal })
    expect(tree[0]).toBe('svg')
    expect(nodes(tree, 'path')).toHaveLength(2)
    expect(nodes(tree, 'circle')).toHaveLength(2)
    expect(nodes(tree, 'text').map(t => t[2])).toContain('R (NM)')
    expect(kit.hoverX(geom, geom.m.l)).toBe(h.x[0])
    expect(kit.hoverX(geom, geom.m.l + geom.iw + 5)).toBeNull()
    expect(kit.valAt(h.x, h.sels[2].y, h.x[10])).toBe(h.sels[2].y[10])
  })

  it('peak labels never overlap: moved up a line, or left out (the dot stays)', () => {
    const [h] = files().analyses
    const one = kit.buildCurves({ focus: h, plotted: [h], selected: ['O5...S'], colorBy: 'group', pal, tones: {} })[0]
    const curves = [0, 1, 2, 3].map(i => ({ ...one, key: 'k' + i }))
    const { tree } = kit.chart({ W: 600, H: 360, curves, grid: h.x, xlabel: '', ylabel: '', hover: null, peaks: true, pal })
    const labels = nodes(tree, 'text').filter(t => t[2] === one.peak!.r.toFixed(3))
    expect(labels.map(t => t[1].y)).toEqual([-8, -21, -34])
    expect(nodes(tree, 'circle')).toHaveLength(4)
  })

  it('is self-contained: its source text alone makes the same kit (the HTML export carries it)', () => {
    const src = decypherKit.toString()
    expect(src).not.toMatch(/<\/script/i)
    const again = new Function('return (' + src + ')()')() as typeof kit
    const g = parseGro(read('9.multiwalker.gro'))
    expect(again.ranges('43-49:3, 5')).toEqual([43, 46, 49, 5])
    const a = again.buildMol(g, new Set([10]), new Set(), 'side by side')!, b = kit.buildMol(g, new Set([10]), new Set(), 'side by side')!
    expect(Array.from(a.local)).toEqual(Array.from(b.local))
    const [h] = files().analyses as Analysis[]
    const c = again.buildCurves({ focus: h, plotted: [h], selected: ['CH...S'], colorBy: 'group', pal: again.palette(false, tokens(false)), tones: {} })
    expect(again.chart({ W: 400, H: 300, curves: c, grid: h.x, xlabel: '', ylabel: '', hover: null, peaks: true, pal: again.palette(false, tokens(false)) }).tree[0]).toBe('svg')
  })
})
