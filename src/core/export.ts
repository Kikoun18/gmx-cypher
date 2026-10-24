// Every chart exports (R6a): the core's curves as the Matrix's GraphData, drawn by its own graphScene into SVG, PDF and
// PNG (imported, so gmx-cypher's figures are the Matrix's, question 13); a result as the (de)Cypher HTML page.

import { grey, renderExport, type GraphData } from '../../../matrix/src/lib/export'
import type { ExportPrefs } from '../../../matrix/src/lib/exportPrefs'
import { fmtValue } from '../../../matrix/src/lib/seq'
import { kit, type Series } from './index'
import type { Analysis, Curve, Marks, Pins, Plot } from './kit'

/** A chart as a figure: its title and file name, axes, curves (in the export theme's palette) and how it is drawn. */
export interface Figure { title: string; sub?: string; file: string; xlabel: string; ylabel: string; curves: Curve[]; y?: 'zero' | 'data'; rule?: number | null; marks?: Marks; xDigits?: number
  /** The y range shared with other charts (R11a); the Matrix's figures take no x range, so a shared x stays on the page. */
  share?: { x?: [number, number]; y?: [number, number] }
  /** Marks and lines put on the chart (R11c), as the Matrix's pins: on their curve, named in the legend. */
  pins?: Pins }

/**
 * A figure as the Matrix's graph: each curve a series in its colour (grey for print) and dash, an error band as
 * ± σ beside it; the peaks pinned as marks; g = 1 a reference line (the Matrix draws 0 itself); from 0 when asked.
 */
export function graphData(f: Figure, theme: ExportPrefs['theme']): GraphData {
  // Print: a curve's own grey (an ordered curve's, R7a), else the Matrix's grey of its colour.
  const ink = (c: Curve) => (theme === 'print' ? c.print ?? grey(c.color) : c.color), rule = f.rule === undefined ? 1 : f.rule, marks = f.marks ?? 'none'
  const name = (c: Curve) => (c.label ?? c.name) + (c.source ? ' · ' + c.source : ''), digits = f.xDigits ?? kit.xDigitsOf(f.curves[0]?.x ?? [])
  const series = f.curves.flatMap(c => {
    // Its own width (R11b); in print, half a pixel heavier.
    const s = { x: c.x, y: c.y, label: name(c), color: ink(c), width: (c.width ?? 2) + (theme === 'print' ? 0.5 : 0), dash: c.dash === 'none' ? undefined : c.dash }
    if (!c.err) return [s]
    const band = (sign: 1 | -1) => ({ x: c.x, y: c.y.map((v, i) => v + sign * (c.err![i] || 0)), label: name(c) + (sign > 0 ? ' + σ' : ' − σ'), color: s.color, width: 1, dash: '2 3' })
    return [s, band(1), band(-1)]
  })
  // Each peak rule a pin, as the Matrix writes them: its y value on the plot, and in the legend `curve · rule: y at x = r`;
  // one pin when both rules fall on the same point.
  const pins = f.curves.flatMap(c => {
    const max = (marks === 'both' || marks === 'maximum') && c.peak ? c.peak : null, shell = (marks === 'both' || marks === 'first shell') && c.shell ? c.shell : null
    const pin = (p: { r: number; g: number }, rule: string) => ({ x: p.r, y: p.g, color: ink(c), label: fmtValue(p.g), curve: name(c) + ' · ' + rule })
    if (max && shell && max.r.toFixed(digits) === shell.r.toFixed(digits)) return [pin(max, 'maximum = first shell')]
    return [...(max ? [pin(max, 'maximum')] : []), ...(shell ? [pin(shell, 'first shell')] : [])]
  })
  let hi = -Infinity
  for (const c of f.curves) c.y.forEach((v, i) => { hi = Math.max(hi, v + (c.err?.[i] || 0)) })
  const zero = (f.y ?? 'zero') === 'zero', sy = f.share?.y, pad = sy ? (sy[1] - sy[0]) * 0.06 || Math.abs(sy[1]) * 0.06 || 1 : 0
  if (sy) hi = sy[1]
  return {
    file: f.file, title: f.title, ...(f.sub ? { sub: f.sub } : {}), xLabel: f.xlabel, yLabel: f.ylabel, series,
    ...(zero ? { domain: { lo: 0, hi: Math.max(Number.isFinite(hi) ? hi : 0, rule != null && rule > 0 ? rule : 0) * 1.12 || 1 } } : sy ? { domain: { lo: sy[0] - pad, hi: sy[1] + pad } } : {}),
    pins: {
      marks: [...pins, ...(f.pins?.points ?? []).flatMap(p => { const c = f.curves.find(x => x.key === p.key); return c && p.i < c.x.length ? [{ x: c.x[p.i], y: c.y[p.i], color: ink(c), label: p.label ?? fmtValue(c.y[p.i]), curve: name(c) }] : [] })],
      lines: [...(rule != null && rule !== 0 ? [{ axis: 'y' as const, v: rule, label: rule === 1 ? 'g = 1' : 'y = ' + rule }] : []), ...(f.pins?.lines ?? []).map(l => ({ axis: l.axis, v: l.v, label: l.label ?? (l.axis === 'x' ? 'x = ' : 'y = ') + l.v }))],
    },
  }
}

/** A figure as a file in a format, laid out by the export settings: through the Matrix's renderExport. */
export const figureFile = (f: Figure, format: 'svg' | 'pdf' | 'png', p: ExportPrefs) => renderExport({ graph: graphData(f, p.theme) }, format, p)

/**
 * A result's chart as an analysis for the HTML page (any result, R6a): its curves as groups without atoms, drawn as
 * the result draws them (`plot`). Curves on different x grids can't share one: null, and the menu says why.
 */
/** A result chart's marks and lines (R11c) as its interactive page keys them: a curve by its analysis, group and name. */
export function resultPins(pins: Pins, series: Series[]): Record<string, Pins> {
  if (!pins.points.length && !pins.lines.length) return {}
  const key = (k: string) => { const s = series[Number(k)]; return s ? 'result|' + s.label + '|' + s.label : null }
  return { result: { points: pins.points.flatMap(p => { const k = key(p.key); return k ? [{ ...p, key: k }] : [] }), lines: pins.lines } }
}

export function resultAnalysis(o: { id: string; title: string; sub: string; xlabel: string; ylabel: string; series: Series[]; y?: Plot['y']; rule?: number | null; xDigits?: number }): Analysis | null {
  const x = o.series[0]?.points.map(p => p[0]) ?? []
  if (!o.series.length || o.series.some(s => s.points.length !== x.length || s.points.some((p, i) => p[0] !== x[i]))) return null
  const plot: Plot | undefined = o.y || o.rule !== undefined ? { y: o.y ?? 'zero', rule: o.rule === undefined ? 1 : o.rule, ...(o.xDigits != null ? { xDigits: o.xDigits } : {}) } : undefined
  return {
    id: o.id, kind: 'job', title: o.title, label: o.title, sub: o.sub, x, xlabel: o.xlabel, ylabel: o.ylabel, ref: null,
    sels: o.series.map(s => ({ name: s.label, atoms: [], tone: s.tone, y: s.points.map(p => p[1]), peak: s.peak ?? null, shell: s.shell ?? null, ...(s.colors ? { colors: s.colors } : {}) })),
    struct: null, structNote: 'a result without a structure', ...(plot ? { plot } : {}),
  }
}
