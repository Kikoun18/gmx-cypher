// Graph settings (R11): the same scale across charts of like quantities.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { kit } from '../src/core/index'
import { graphData } from '../src/core/export'
import { themeTokens } from '../src/core/tokens'
import { exportData } from '../src/decypher/export'
import { fromFiles } from '../src/decypher/parse'
import { pinNotes, withNotes } from '../src/lib/csv'
import { RUNNER } from './helpers'

const TOKENS = themeTokens(readFileSync(RUNNER + 'src/tokens.json', 'utf8'), readFileSync(RUNNER + 'src/roles.json', 'utf8'))
const pal = kit.palette(false, TOKENS.light)

describe('the same scale (R11a)', () => {
  it('takes the range over several series: empty series and NaN values left out, an error band counted', () => {
    const series = [{ x: [0, 1, 2], y: [1, NaN, 3] }, { x: [], y: [] }, { x: [-1, NaN, 5], y: [2, -4, NaN] }]
    expect([kit.sharedDomain(series, 'x'), kit.sharedDomain(series, 'y')]).toEqual([[-1, 5], [-4, 3]])
    expect(kit.sharedDomain([{ x: [], y: [] }, { x: [NaN], y: [NaN] }], 'y')).toBeNull()
    expect(kit.sharedDomain([{ x: [0, 1], y: [1, 2], err: [0.5, NaN] }], 'y')).toEqual([0.5, 2])
  })
  const c = (id: string, xlabel: string, ylabel: string, x: number[], y: number[]) => ({ id, xlabel, ylabel, curves: [{ x, y }] })
  const charts = [
    c('rms', 'Time (ps)', 'RMSD (nm)', [0, 10], [0.1, 0.5]), c('dist', 'Time (ps)', 'Distance (nm)', [0, 20], [1, 2]),
    c('rdf', 'r (nm)', 'g(r)', [0, 1.5], [0, 3]), c('energy', 'Time (ps)', '(kJ/mol)', [0, 20], [-500, -400]), c('none', 'Time (ps)', 'RMSD (nm)', [], []),
  ]
  it('shares x, y or both among the charts of like quantities only', () => {
    const both = kit.sharedScales(charts, 'both', [])
    // An RMSD and a distance: nm over ps. The RDF is alone in its quantities; the energy shares only its time.
    expect([both.rms, both.dist, both.rdf, both.energy]).toEqual([{ x: [0, 20], y: [0.1, 2] }, { x: [0, 20], y: [0.1, 2] }, { x: [0, 1.5], y: [0, 3] }, { x: [0, 20], y: [-500, -400] }])
    expect(both.none).toEqual({ x: [0, 20], y: [0.1, 2] })
    expect([kit.sharedScales(charts, 'x', []).rms, kit.sharedScales(charts, 'y', []).rms]).toEqual([{ x: [0, 20] }, { y: [0.1, 2] }])
    expect(kit.sharedScales(charts, 'own', [])).toEqual({})
  })
  it('leaves a chart reset to its own scale out, on both sides', () => {
    const s = kit.sharedScales(charts, 'both', ['dist'])
    expect([s.dist, s.rms]).toEqual([undefined, { x: [0, 20], y: [0.1, 0.5] }])
  })
  it('draws a chart on the shared range', () => {
    const curve = { key: 'k', name: 'g', source: '', analysis: 'a', x: [0, 5, 10], y: [0.1, 0.3, 0.5], color: '#000', dash: 'none', peak: null, atoms: 1 }
    const draw = (share?: { x?: [number, number]; y?: [number, number] }) => kit.chart({ W: 400, H: 300, curves: [curve], grid: curve.x, xlabel: 'Time (ps)', ylabel: 'RMSD (nm)', hover: null, marks: 'none', pal, y: 'data', share }).geom
    const own = draw(), shared = draw({ x: [0, 20], y: [0.1, 2] })
    expect([own.x0, own.x1, shared.x0, shared.x1]).toEqual([0, 10, 0, 20])
    expect(shared.y0).toBeCloseTo(0.1 - 1.9 * 0.06, 9)
    expect(shared.y1).toBeCloseTo(2 + 1.9 * 0.06, 9)
  })
  it('carries a shared y into figures (the Matrix\'s take no x range), and a result that is not an RDF keeps its own rule', () => {
    const curve = { key: 'k', name: 'g', source: '', analysis: 'a', x: [0, 5, 10], y: [0.1, 0.3, 0.5], color: '#000', dash: 'none', peak: null, atoms: 1 }
    const fig = (o: object) => graphData({ title: 't', file: 'f', xlabel: 'Time (ps)', ylabel: 'RMSD (nm)', curves: [curve], ...o }, 'light')
    const d = fig({ y: 'data', rule: null, share: { x: [0, 20], y: [0.1, 2] } })
    expect([d.domain!.lo, d.domain!.hi].map(v => +v.toFixed(9))).toEqual([0.1 - 1.9 * 0.06, 2 + 1.9 * 0.06].map(v => +v.toFixed(9)))
    expect(fig({ y: 'zero', share: { y: [0, 3] } }).domain).toEqual({ lo: 0, hi: 3 * 1.12 })
    expect([fig({ y: 'data', rule: null }).domain, fig({ y: 'data', rule: null }).pins!.lines]).toEqual([undefined, []])
  })
  it('the export says which axes are shared, and which charts are reset, by their ids in the export', () => {
    const NAMES = ['9.multiwalker.gro', 'rdf_o111_Methionine_H.ndx', 'rdf_o111_Methionine_H.run.json', 'rdf_o111_Methionine_H.xvg', 'rdf_o111_Methionine_S.ndx', 'rdf_o111_Methionine_S.run.json', 'rdf_o111_Methionine_S.xvg']
    const { analyses, structs } = fromFiles(NAMES.map(n => ({ path: '/sims/' + n, text: readFileSync(RUNNER + 'test/fixtures/decypher/' + n, 'utf8') })))
    const styles = { [analyses[1].id + '|O5...S|O5...S']: { dash: 'dotted' }, 'job:gone|x|x': { width: 1.5 } }
    const view = { rep: 'ball & stick' as const, rest: 'grey' as const, labels: true, hydrogens: true, arrange: 'side by side' as const, scale: 'y' as const, ownScale: [analyses[1].id, 'gone'], styles }
    const d = exportData({ analyses, structs, selected: () => [], tones: {}, compare: null, view, theme: 'light', tokens: TOKENS, structures: false, by: 'x' })
    // The line styles (R11b) too, by the curves' keys in the export.
    expect([d.view.scale, d.view.ownScale, d.view.styles]).toEqual(['y', ['a2'], { 'a2|O5...S|O5...S': { dash: 'dotted' } }])
  })
})

describe('line styles (R11b)', () => {
  const curve = (key: string, tone: 'coral' | 'sky', color: string, dash = 'none') => ({ key, name: key, source: '', analysis: 'a', x: [0, 1], y: [1, 2], color, dash, peak: null, atoms: 1, tone })
  const [a, b, c] = [curve('a', 'coral', '#c0392b'), curve('b', 'coral', '#d4675c', '5 4'), curve('c', 'sky', '#2471a3')]
  it('takes a dash by its Matrix name, a width within 1.5–2 px, a shade within three steps; anything else is left out', () => {
    expect(kit.cleanStyles({ a: { dash: 'dotted', width: 1.5, shade: 2 }, b: { dash: 'wavy', width: 3, shade: 9 }, c: { width: NaN }, d: 'x', e: { dash: 'solid' } })).toEqual({ a: { dash: 'dotted', width: 1.5, shade: 2 }, b: { width: 2, shade: 3 }, e: { dash: 'solid' } })
    const [sa, sb] = kit.styleCurves([a, b], { a: { dash: 'dotted', width: 1.5 }, b: { dash: 'solid' } }, pal)
    expect([sa.dash, sa.width, sa.styled, sb.dash, sb.width]).toEqual(['2 3', 1.5, true, 'none', undefined])
  })
  it('shades a curve lighter or darker, never below 3:1 against the card', () => {
    const lighter = kit.styleCurves([a], { a: { shade: 3 } }, pal)[0].color, darker = kit.styleCurves([a], { a: { shade: -1 } }, pal)[0].color
    expect([lighter !== a.color, darker !== a.color]).toEqual([true, true])
    expect(kit.contrast(lighter, pal.card)).toBeGreaterThanOrEqual(3)
    expect(kit.contrast(kit.styleCurves([c], { c: { shade: 3 } }, pal)[0].color, pal.card)).toBeGreaterThanOrEqual(3)
  })
  it('warns when a choice makes two curves of one tone alike: the same, or apart by shade alone', () => {
    // As drawn: a tone's curves apart by their dash, nothing to say.
    expect(kit.sameLooks([a, b, c])).toEqual([])
    const solid = kit.styleCurves([a, b, c], { b: { dash: 'solid' } }, pal)
    expect(kit.sameLooks(solid).map(w => [w.a.key, w.b.key, w.why])).toEqual([['a', 'b', 'shade']])
    const same = kit.styleCurves([a, { ...b, color: a.color }, c], { b: { dash: 'solid' } }, pal)
    expect(kit.sameLooks(same).map(w => w.why)).toEqual(['same'])
    // A width apart is enough; another tone is another hue.
    expect(kit.sameLooks(kit.styleCurves([a, b, c], { b: { dash: 'solid', width: 1.5 }, c: { dash: 'solid' } }, pal))).toEqual([])
  })
  it('draws a curve at its own width, and figures in print a half pixel heavier', () => {
    const sa = kit.styleCurves([a], { a: { width: 1.5 } }, pal)[0]
    const path = (kit.chart({ W: 300, H: 200, curves: [sa], grid: sa.x, xlabel: 'x', ylabel: 'y', hover: null, marks: 'none', pal }).tree as unknown as unknown[])
    expect(JSON.stringify(path)).toContain('"strokeWidth":1.5')
    const fig = (theme: 'light' | 'print') => graphData({ title: 't', file: 'f', xlabel: 'x', ylabel: 'y', curves: [sa, b] }, theme).series.map(s => s.width)
    expect([fig('light'), fig('print')]).toEqual([[1.5, 2], [2, 2.5]])
  })
})

describe('marks and lines (R11c)', () => {
  const curve = { key: 'job:a|sodium|sodium', name: 'sodium', source: 'rdf_a', analysis: 'job:a', x: [0, 0.5, 1], y: [0, 2.25, 1], color: '#2471a3', dash: 'none', peak: null, atoms: 6 }
  const pins = { points: [{ key: curve.key, i: 1, label: 'first shell' }, { key: curve.key, i: 2 }, { key: 'gone', i: 0 }], lines: [{ axis: 'x' as const, v: 0.35 }, { axis: 'y' as const, v: 1, label: 'bulk' }] }
  it('keeps what a saved view may hold: points by curve key and index, lines on x or y, labels as text', () => {
    expect(kit.cleanPins({ points: [{ key: 'k', i: 2, label: 'a' }, { key: 'k', i: -1 }, { i: 1 }, { key: 'k', i: 1, label: 3 }], lines: [{ axis: 'z', v: 1 }, { axis: 'y', v: NaN }, { axis: 'x', v: 0.4, label: '' }] }))
      .toEqual({ points: [{ key: 'k', i: 2, label: 'a' }, { key: 'k', i: 1 }], lines: [{ axis: 'x', v: 0.4 }] })
    expect(kit.cleanPins('x')).toEqual({ points: [], lines: [] })
  })
  it('draws each on the chart with its label, or its value when it has none; a point of a curve not drawn is left out', () => {
    const tree = JSON.stringify(kit.chart({ W: 400, H: 300, curves: [curve], grid: curve.x, xlabel: 'r (nm)', ylabel: 'g(r)', hover: null, marks: 'none', pal, pins, xDigits: 3 }).tree)
    expect(['first shell', '1.000, 1.00', 'x = 0.35', 'bulk'].map(t => tree.includes(t))).toEqual([true, true, true, true])
  })
  it('go into figures as the Matrix\'s pins: on their curve, in the legend by the curve\'s name; lines with their labels', () => {
    const d = graphData({ title: 't', file: 'f', xlabel: 'r (nm)', ylabel: 'g(r)', curves: [curve], marks: 'none', pins }, 'light')
    expect(d.pins!.marks).toEqual([{ x: 0.5, y: 2.25, color: '#2471a3', label: 'first shell', curve: 'sodium · rdf_a' }, { x: 1, y: 1, color: '#2471a3', label: '1.00', curve: 'sodium · rdf_a' }])
    expect(d.pins!.lines).toEqual([{ axis: 'y', v: 1, label: 'g = 1' }, { axis: 'x', v: 0.35, label: 'x = 0.35' }, { axis: 'y', v: 1, label: 'bulk' }])
  })
  it('and into the CSV, as comment lines above the header, at full precision', () => {
    expect(pinNotes(pins, [curve])).toEqual(['mark first shell: sodium · rdf_a at x = 0.5, y = 2.25', 'mark: sodium · rdf_a at x = 1, y = 1', 'line: x = 0.35', 'line bulk: y = 1'])
    expect(withNotes('# command: gmx rdf\nr,g\n0,0\n', ['line: x = 0.35'])).toBe('# line: x = 0.35\n# command: gmx rdf\nr,g\n0,0\n')
  })
  it('and into the HTML export, keyed as the export keys its curves', () => {
    const NAMES = ['9.multiwalker.gro', 'rdf_o111_Methionine_H.ndx', 'rdf_o111_Methionine_H.run.json', 'rdf_o111_Methionine_H.xvg']
    const { analyses, structs } = fromFiles(NAMES.map(n => ({ path: '/sims/' + n, text: readFileSync(RUNNER + 'test/fixtures/decypher/' + n, 'utf8') })))
    const id = analyses[0].id, view = { rep: 'ball & stick' as const, rest: 'grey' as const, labels: true, hydrogens: true, arrange: 'side by side' as const, pins: { [id]: { points: [{ key: id + '|O5...S|O5...S', i: 3, label: 'here' }], lines: [{ axis: 'x' as const, v: 0.3 }] }, gone: { points: [], lines: [] } } }
    const d = exportData({ analyses, structs, selected: () => [], tones: {}, compare: null, view, theme: 'light', tokens: TOKENS, structures: false, by: 'x' })
    expect(d.view.pins).toEqual({ a1: { points: [{ key: 'a1|O5...S|O5...S', i: 3, label: 'here' }], lines: [{ axis: 'x', v: 0.3 }] } })
  })
})
