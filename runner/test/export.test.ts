import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { graphScene, toPDF, toSVG } from '../../matrix/src/lib/export'
import { fmtValue, parseTable } from '../../matrix/src/lib/seq'
import { graphData, resultAnalysis } from '../src/core/export'
import { curvesOf, kit, TONES, type Series } from '../src/core/index'
import { themeTokens } from '../src/core/tokens'
import { exportData, exportHtml } from '../src/decypher/export'
import { csvMeta, xvgCsv } from '../src/lib/csv'
import { peaks, resultSeries } from '../src/lib/rdf'
import type { RunRecord } from '../src/lib/record'
import { RUNNER } from './helpers'

// Every chart exports (R6a): figures through the Matrix's own pipeline, data as CSV at gmx's own precision, any result as HTML.

const F = RUNNER + 'test/fixtures/'
const read = (f: string) => readFileSync(F + f, 'utf8')
const TOKENS = themeTokens(readFileSync(RUNNER + 'src/tokens.json', 'utf8'), readFileSync(RUNNER + 'src/roles.json', 'utf8'))
const light = kit.palette(false, TOKENS.light), dark = kit.palette(true, TOKENS.dark)
const rdfSeries = (text: string): Series[] => resultSeries(text).map((s, i) => { const p = peaks(s.points); return { label: s.label, points: s.points, tone: TONES[i % TONES.length], dash: Math.floor(i / TONES.length), peak: p.maximum, shell: p.firstShell } })

describe('SVG, PDF and PNG through the Matrix (graphScene, by import)', () => {
  const text = read('decypher/rdf_o111_Methionine_H.xvg'), series = rdfSeries(text)
  const fig = { title: 'rdf_o111_Methionine_H', file: 'rdf_o111_Methionine_H', xlabel: 'r (nm)', ylabel: 'g(r)', curves: curvesOf(series, light), marks: 'both' as const, xDigits: 3 }

  it('every curve a series in its tone, its label and its dash; the maxima pinned; g = 1 a reference line; from 0', () => {
    const g = graphData(fig, 'light')
    expect(g.series).toHaveLength(13)
    expect(g.series.map(s => s.label)).toEqual(series.map(s => s.label))
    expect(g.series[0]).toMatchObject({ color: light.hues.coral.strong, dash: undefined })
    expect(g.series[8].dash).toBe('5 4')
    expect(g.series[3].x).toEqual(series[3].points.map(p => p[0]))
    expect(g.pins!.lines).toEqual([{ axis: 'y', v: 1, label: 'g = 1' }])
    expect(g.pins!.marks.filter(m => / · maximum/.test(m.curve))).toHaveLength(series.filter(s => s.peak).length)
    // As the Matrix writes pins: the y value as the label, the rule after the curve's name (its legend: `curve · rule: y at x = r`).
    expect(g.pins!.marks.find(m => m.curve === series[2].label + ' · maximum')).toMatchObject({ x: series[2].peak!.r, y: series[2].peak!.g, label: fmtValue(series[2].peak!.g) })
    // A first shell apart from the maximum is a pin of its own; on the same point, one pin says both.
    const apart = series.find(s => s.peak && s.shell && s.peak.r !== s.shell.r)!, same = series.find(s => s.peak && s.shell && s.peak.r === s.shell.r)
    expect(g.pins!.marks.filter(m => m.curve.startsWith(apart.label + ' · ')).map(m => [m.curve, m.x])).toEqual([[apart.label + ' · maximum', apart.peak!.r], [apart.label + ' · first shell', apart.shell!.r]])
    if (same) expect(g.pins!.marks.filter(m => m.curve.startsWith(same.label + ' · ')).map(m => m.curve)).toEqual([same.label + ' · maximum = first shell'])
    expect(g.domain!.lo).toBe(0)
    expect([g.xLabel, g.yLabel, g.title]).toEqual(['r (nm)', 'g(r)', 'rdf_o111_Methionine_H'])
  })

  it('the SVG: 13 curves with their dashes and colours, no external reference', () => {
    const svg = toSVG(graphScene(graphData(fig, 'light')))
    const paths = svg.match(/<path d="M[^"]*" fill="none"[^>]*>/g)!
    expect(paths).toHaveLength(13)
    expect(paths.filter(p => p.includes('stroke-dasharray="5 4"'))).toHaveLength(5)
    expect(svg).toContain('stroke="' + light.hues.sky.strong + '"')
    expect(svg.replace(' xmlns="http://www.w3.org/2000/svg"', '')).not.toMatch(/href|url\(|https?:/)
  })

  it('the dark and print themes: curves in the dark palette, or grey for print', () => {
    expect(graphData({ ...fig, curves: curvesOf(series, dark) }, 'dark').series[1].color).toBe(dark.hues.sky.strong)
    expect(graphData(fig, 'print').series[1].color).toMatch(/^#([0-9a-f]{2})\1\1$/)
  })

  it('the PDF parses: its header, one page, its trailer', async () => {
    const pdf = await toPDF(graphScene(graphData(fig, 'light'))).text()
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf).toMatch(/\/Type \/Pages[^]*\/Count 1/)
    expect(pdf).toMatch(/trailer[^]*startxref\s+\d+\s+%%EOF\s*$/)
  })

  it("WHAM's error band goes along as ± one standard deviation, thin and dashed in the curve's colour", () => {
    const c = curvesOf([{ label: 'profile', points: [[0, 0], [1, 2]], tone: 'coral', err: [0.5, 1] }], light)
    const g = graphData({ title: 'p', file: 'p', xlabel: 'ξ (nm)', ylabel: 'E (kJ/mol)', curves: c, y: 'data', rule: 0 }, 'light')
    expect(g.series.map(s => [s.label, s.y])).toEqual([['profile', [0, 2]], ['profile + σ', [0.5, 3]], ['profile − σ', [-0.5, 1]]])
    expect(g.series[1]).toMatchObject({ color: c[0].color, width: 1, dash: '2 3' })
    expect(g.domain).toBeUndefined()
    expect(g.pins!.lines).toEqual([])
  })
})

describe('CSV: every point as gmx wrote it, under one header of names and units, after where it came from', () => {
  const record = JSON.parse(read('decypher/rdf_o111_Methionine_H.run.json')) as RunRecord
  const fields = (text: string) => text.split('\n').filter(l => l.trim() && !/^[#@]/.test(l)).map(l => l.trim().split(/\s+/))
  const rows = (csv: string) => csv.split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split(','))

  it("round trip: the xvg's every field, digit for digit", () => {
    for (const f of ['decypher/rdf_o111_Methionine_H.xvg', 'gmx-2025.4/energy-potential.xvg', 'r9/rmsf/rmsf_nvt.xvg', 'wham/out/histo.xvg']) {
      const text = read(f), t = parseTable(text), n = t.cols.length - 1
      const csv = xvgCsv(Array.from({ length: n }, (_, j) => ({ text, col: j + 1, name: 'c' + j })), t.head.xLabel, t.head.yLabel, {})
      const [head, ...body] = rows(csv)
      expect(head).toHaveLength(n + 1)
      expect(body).toEqual(fields(text).map(r => r.slice(0, n + 1)))
      body.forEach((r, i) => r.forEach((v, j) => expect(Number(v)).toBe(t.cols[j][i])))
    }
  })

  it('the header: the x label with its unit, then each curve named, with the y unit when there is one', () => {
    const text = read('gmx-2025.4/energy-potential.xvg')
    expect(xvgCsv([{ text, col: 1, name: 'Bond' }, { text, col: 2, name: 'Potential, total' }], 'time (ps)', 'kJ/mol', {}).split('\n')[0]).toBe('time (ps),Bond (kJ/mol),"Potential, total (kJ/mol)"')
    expect(rows(xvgCsv([{ text: read('decypher/rdf_o111_Methionine_H.xvg'), col: 1, name: 'NH_N...S' }], 'r (nm)', 'g(r)', {}))[0]).toEqual(['r (nm)', 'NH_N...S'])
  })

  it("curves from several files (AWH's frames) share one x column when their x is the same, else each keeps its own", () => {
    const a = read('awh/out/awh_t0.xvg'), b = read('awh/out/awh_t20.xvg')
    expect(rows(xvgCsv([{ text: a, col: 1, name: 't = 0 ps' }, { text: b, col: 1, name: 't = 20 ps' }], 'x', 'PMF (kJ/mol)', {}))[0]).toEqual(['x', 't = 0 ps (kJ/mol)', 't = 20 ps (kJ/mol)'])
    const short = 'a\n1 5\n2 6\n', long = '1 7\n2 8\n3 9\n'
    expect(rows(xvgCsv([{ text: short, col: 1, name: 'a' }, { text: long, col: 1, name: 'b' }], 't (ps)', 'y', {}))).toEqual([['t (ps) · a', 'a', 't (ps) · b', 'b'], ['1', '5', '1', '7'], ['2', '6', '2', '8'], ['', '', '3', '9']])
  })

  it('# lines: the command, the gmx version, the record, the source with its SHA-256, each group label → gmx name and atoms', () => {
    const meta = csvMeta(record, '/home/me/sims/o111/rdf_o111_Methionine_H.run.json', 'rdf_o111_Methionine_H.xvg', g => g.name)
    const csv = xvgCsv([{ text: read('decypher/rdf_o111_Methionine_H.xvg'), col: 1, name: 'NH_N...S' }], 'r (nm)', 'g(r)', meta)
    const notes = csv.split('\n').filter(l => l.startsWith('#'))
    expect(notes[0]).toMatch(/^# command: gmx_mpi rdf -f 9\.multiwalker\.xtc .* -ref 'group 0' -sel 'group 1' 'group 2' /)
    expect(notes).toContain('# directory: ' + record.command.cwd)
    expect(notes).toContain('# gmx: ' + record.gmx.version)
    expect(notes).toContain('# record: /home/me/sims/o111/rdf_o111_Methionine_H.run.json')
    const xvg = record.outputs.find(o => o.path.endsWith('rdf_o111_Methionine_H.xvg'))!
    expect(notes).toContain('# source: rdf_o111_Methionine_H.xvg sha256 ' + xvg.sha256)
    expect(notes).toContain('# group ' + record.groups[0].name + ': gmx name ' + record.groups[0].name + ', atoms ' + record.groups[0].atoms)
  })
})

describe('any result as the interactive HTML page', () => {
  it('a result that is not an RDF keeps its own y range and rule on the page', () => {
    const text = read('gmx-2025.4/energy-potential.xvg'), series: Series[] = resultSeries(text).map((s, i) => ({ label: s.label, points: s.points, tone: TONES[i] }))
    const a = resultAnalysis({ id: 'energy', title: 'energy_rerun', sub: 'gmx energy', xlabel: 'time (ps)', ylabel: 'kJ/mol', series, y: 'data', rule: 0 })!
    expect(a.sels.map(s => s.name)).toEqual(series.map(s => s.label))
    expect(a.x).toEqual(series[0].points.map(p => p[0]))
    expect(a.plot).toEqual({ y: 'data', rule: 0 })
    const d = exportData({ analyses: [a], structs: {}, selected: () => a.sels.map(s => s.name), tones: {}, compare: null, view: { rep: 'ball & stick', rest: 'grey', labels: true, hydrogens: true, arrange: 'side by side' }, theme: 'light', tokens: TOKENS, structures: false, by: 'gmx-cypher' })
    expect(d.analyses[0].plot).toEqual({ y: 'data', rule: 0 })
    expect(exportHtml(d)).toContain('"plot":{"y":"data","rule":0}')
  })

  it('curves on different grids make no page: said, not drawn wrong', () => {
    expect(resultAnalysis({ id: 'x', title: 't', sub: '', xlabel: 'x', ylabel: 'y', series: [{ label: 'a', points: [[0, 1], [1, 2]], tone: 'coral' }, { label: 'b', points: [[0, 1]], tone: 'sky' }] })).toBeNull()
  })
})
