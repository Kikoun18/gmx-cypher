import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { parseTable } from '../../matrix/src/lib/seq'
import { curvesOf, kit, TONES, type Series } from '../src/core/index'
import type { VNode } from '../src/core/kit'
import { themeTokens } from '../src/core/tokens'
import { resultSeries } from '../src/lib/rdf'
import { parseHistograms } from '../src/lib/wham'
import { RUNNER } from './helpers'

// Every chart drawn by the core (R5c): result views and (de)Cypher alike, the numbers unchanged on the way.

const F = RUNNER + 'test/fixtures/'
const read = (f: string) => readFileSync(F + f, 'utf8')
const TOKENS = themeTokens(readFileSync(RUNNER + 'src/tokens.json', 'utf8'), readFileSync(RUNNER + 'src/roles.json', 'utf8'))
const pal = kit.palette(false, TOKENS.light)
/** Every node of a chart tree with its tag. */
const nodes = (n: VNode | string, tag: string): VNode[] => (typeof n === 'string' ? [] : [...(n[0] === tag ? [n] : []), ...n.slice(2).flatMap(c => nodes(c as VNode, tag))])
const texts = (n: VNode) => nodes(n, 'text').map(t => t[2])
const one = (x: number[], y: number[], extra: Partial<Series> = {}) => curvesOf([{ label: 'c', points: x.map((v, i) => [v, y[i]]), tone: 'coral', ...extra }], pal)[0]
const base = { W: 600, H: 300, xlabel: 'x', ylabel: 'y', hover: null, marks: 'none' as const, pal }

describe("the numbers don't move: every result kind through the core", () => {
  const KINDS: [string, string[]][] = [
    ['rdf', ['gmx-2025.4/rdf_nvt.xvg', 'gmx-2025.4/rdf_nvt_cn.xvg', 'decypher/rdf_o111_Methionine_H.xvg']],
    ['energy', ['gmx-2025.4/energy-potential.xvg']],
    ['awh', ['awh/out/awh_t0.xvg', 'awh/out/awh_t20.xvg']],
    ['wham', ['wham/out/profile.xvg', 'wham/out/histo.xvg', 'wham/out/bsres.xvg']],
    ['distance', ['distance/com/distance_nvt.xvg', 'distance/com/distance_nvt_hist.xvg', 'distance/pairs/distance_nvt.xvg']],
    ['hbond', ['hbond/new/hbond_nvt.xvg', 'hbond/legacy/hbond_nvt.xvg', 'hbond/legacy/hbond_nvt_dist.xvg', 'hbond/legacy/hbond_nvt_ang.xvg']],
    ['rms', ['r9/rms/rmsd_nvt.xvg', 'r9/rms-nofit/rmsd_nvt.xvg']],
    ['rmsf', ['r9/rmsf/rmsf_nvt.xvg', 'r9/rmsf-res/rmsf_nvt.xvg']],
    ['gyrate', ['r9/gyrate/gyrate_nvt.xvg', 'r9/gyrate-legacy/gyrate_nvt.xvg']],
    ['mindist', ['r9/mindist/mindist_nvt.xvg', 'r9/mindist/mindist_nvt_numcont.xvg']],
  ]
  for (const [kind, files] of KINDS) {
    it(kind + ': every point of every column as gmx wrote it, its name, and one vertex each in the drawing', () => {
      for (const f of files) {
        const text = read(f), t = parseTable(text), series = resultSeries(text)
        const curves = curvesOf(series.map((s, i) => ({ label: s.label, points: s.points, tone: TONES[i % TONES.length] })), pal)
        expect(curves.length, f).toBeGreaterThan(0)
        expect(curves.map(c => c.name)).toEqual(series.map(s => s.label))
        curves.forEach((c, j) => {
          const keep = t.cols[0].map((x, i) => Number.isFinite(x) && Number.isFinite(t.cols[j + 1][i]))
          expect(c.x, f).toEqual(t.cols[0].filter((_, i) => keep[i]))
          expect(c.y, f).toEqual(t.cols[j + 1].filter((_, i) => keep[i]))
        })
        const { tree } = kit.chart({ ...base, curves, grid: curves[0].x, xlabel: t.head.xLabel, ylabel: t.head.yLabel, y: 'data', rule: null })
        const paths = nodes(tree, 'path').filter(p => p[1].key === 'p')
        expect(paths.map(p => String(p[1].d).split(/[ML]/).length - 1), f).toEqual(curves.map(c => c.x.length))
      }
    })
  }

  it("wham's histograms: the windows drawn are the file's columns", () => {
    const text = read('wham/out/histo.xvg'), t = parseTable(text), h = parseHistograms(text)
    const curves = curvesOf(h.windows.map((c, j) => ({ label: 'window ' + (j + 1), points: h.x.map((x, i) => [x, c[i]] as [number, number]), tone: TONES[j % TONES.length] })), pal)
    expect(curves).toHaveLength(t.cols.length - 1)
    curves.forEach((c, j) => { expect(c.x).toEqual(t.cols[0]); expect(c.y).toEqual(t.cols[j + 1]) })
  })
})

describe('the core chart serves every result (R5c)', () => {
  it("a signed quantity: the data's own y range, the zero rule inside it, no g = 1", () => {
    const { tree, geom } = kit.chart({ ...base, curves: [one([0, 1, 2, 3], [-12, -3, 0, 5])], grid: [0, 1, 2, 3], y: 'data', rule: 0 })
    expect(geom.y0).toBeLessThan(-12)
    expect(geom.y1).toBeGreaterThan(5)
    expect(nodes(tree, 'line').filter(l => l[1].key === 'rule')).toHaveLength(1)
    const above = kit.chart({ ...base, curves: [one([0, 1], [3, 4])], grid: [0, 1], y: 'data', rule: 0 })
    expect(above.geom.y0).toBeGreaterThan(0)
    expect(nodes(above.tree, 'line').filter(l => l[1].key === 'rule')).toHaveLength(0)
  })

  it('g(r) from 0 with its g = 1 line (the default); a count from 0 without one', () => {
    const rdf = kit.chart({ ...base, curves: [one([0.1, 0.2, 0.3], [0, 2.5, 1])], grid: [0.1, 0.2, 0.3] })
    expect(rdf.geom.y0).toBe(0)
    expect(nodes(rdf.tree, 'line').filter(l => l[1].key === 'rule')).toHaveLength(1)
    const count = kit.chart({ ...base, curves: [one([0, 1, 2], [40, 52, 47])], grid: [0, 1, 2], y: 'zero', rule: null })
    expect(count.geom.y0).toBe(0)
    expect(count.geom.y1).toBeGreaterThan(52)
    expect(nodes(count.tree, 'line').filter(l => l[1].key === 'rule')).toHaveLength(0)
  })

  it("curves are clipped to the plot: one reaching past the leading curve's range stays inside", () => {
    const lead = one([0, 1, 2], [1, 2, 1]), long = { ...one([0, 1, 2, 3, 4], [1, 3, 2, 1, 9]), key: 'long' }
    const { tree, geom } = kit.chart({ ...base, curves: [lead, long], grid: lead.x, id: 'plot-1' })
    const [clip] = nodes(tree, 'clipPath'), [rect] = nodes(clip, 'rect')
    expect(clip[1].id).toBe('plot-1')
    expect([rect[1].x, rect[1].y, rect[1].width, rect[1].height]).toEqual([geom.m.l, geom.m.t, geom.iw, geom.ih])
    const clipped = nodes(tree, 'g').filter(g => g[1].clipPath === 'url(#plot-1)')
    expect(clipped.flatMap(g => nodes(g, 'path')).filter(p => p[1].key === 'p')).toHaveLength(2)
    expect(geom.x1).toBe(4)
  })

  it("an error band (WHAM's bootstrap): a filled path around the curve, inside the y range", () => {
    const c = one([0, 1, 2], [0, 5, 2], { err: [0.5, 1, 3] })
    const { tree, geom } = kit.chart({ ...base, curves: [c], grid: c.x, y: 'data', rule: 0 })
    const band = nodes(tree, 'path').filter(p => p[1].key === 'band')
    expect(band).toHaveLength(1)
    expect(band[0][1].fill).toBe(c.color)
    expect(geom.y1).toBeGreaterThan(6)
    expect(geom.y0).toBeLessThan(-0.5)
  })

  it('axis labels keep their case: data names and units are not shouted (contract §2a)', () => {
    const { tree } = kit.chart({ ...base, curves: [one([0, 1], [1, 2])], grid: [0, 1], xlabel: 'ξ (nm)', ylabel: 'E (kJ/mol)', y: 'data', rule: null })
    expect(texts(tree)).toContain('ξ (nm)')
    expect(texts(tree)).toContain('E (kJ/mol)')
  })

  it("a maximum's label is written at the x values' own precision: an atom number, an r", () => {
    const atoms = one([1, 2, 5, 9], [0.1, 0.4, 0.2, 0.3], { peak: { r: 2, g: 0.4 } })
    expect(texts(kit.chart({ ...base, curves: [atoms], grid: atoms.x, marks: 'maximum', y: 'data', rule: null }).tree)).toContain('2')
    const rdf = one([0.372, 0.374, 0.376], [1, 6.4, 2], { peak: { r: 0.374, g: 6.4 } })
    expect(texts(kit.chart({ ...base, curves: [rdf], grid: rdf.x, marks: 'maximum' }).tree)).toContain('0.374')
  })

  it('the hover reads the nearest point, on an uneven x too (atom numbers)', () => {
    const x = [1, 2, 5, 9], y = [10, 20, 50, 90], c = one(x, y)
    expect(kit.valAt(x, y, 4.4)).toBe(50)
    expect(kit.valAt(x, y, 3.4)).toBe(20)
    expect(kit.valAt(x, y, 100)).toBe(90)
    const { geom } = kit.chart({ ...base, curves: [c], grid: x, y: 'data', rule: null })
    const at = (v: number) => geom.m.l + ((v - geom.x0) / (geom.x1 - geom.x0)) * geom.iw
    expect(kit.hoverX(geom, at(6.9))).toBe(5)
    expect(kit.hoverX(geom, at(7.1))).toBe(9)
  })
})

/** Every .tsx file under a folder. */
const tsx = (dir: string): string[] => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? tsx(p) : n.endsWith('.tsx') ? [p] : [] })

describe('every chart comes from the core (R5c)', () => {
  it("the Morpheus LineChart copy is gone, and nothing in src/views or src/decypher draws a chart's path itself", () => {
    expect(existsSync(RUNNER + 'src/ui/line-chart.tsx')).toBe(false)
    const drawn: string[] = []
    for (const f of [...tsx(RUNNER + 'src/views'), ...tsx(RUNNER + 'src/decypher')]) {
      const text = readFileSync(f, 'utf8'), src = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX)
      if (/ui\/line-chart/.test(text)) drawn.push(relative(RUNNER, f) + ' imports line-chart')
      const visit = (n: ts.Node) => {
        // A <path d={…}> computed from data is a chart drawn by hand; the core's trees are rendered by its ChartPanel.
        if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText(src) === 'path'
          && n.attributes.properties.some(a => ts.isJsxAttribute(a) && a.name.getText(src) === 'd' && !!a.initializer && ts.isJsxExpression(a.initializer))) drawn.push(relative(RUNNER, f) + ':' + (src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1))
        ts.forEachChild(n, visit)
      }
      visit(src)
    }
    expect(drawn).toEqual([])
  })
})
