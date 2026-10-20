// Graph settings (R11): the same scale across charts of like quantities.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { kit } from '../src/core/index'
import { graphData } from '../src/core/export'
import { themeTokens } from '../src/core/tokens'
import { exportData } from '../src/decypher/export'
import { fromFiles } from '../src/decypher/parse'
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
    const view = { rep: 'ball & stick' as const, rest: 'grey' as const, labels: true, hydrogens: true, arrange: 'side by side' as const, scale: 'y' as const, ownScale: [analyses[1].id, 'gone'] }
    const d = exportData({ analyses, structs, selected: () => [], tones: {}, compare: null, view, theme: 'light', tokens: TOKENS, structures: false, by: 'x' })
    expect([d.view.scale, d.view.ownScale]).toEqual(['y', ['a2']])
  })
})
