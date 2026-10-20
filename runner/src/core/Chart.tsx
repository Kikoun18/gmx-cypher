// The core's chart in React (R5c): the kit's SVG tree rendered as elements, filling its box, with a rule, a dot on
// each curve and their values under the pointer, highest first (T153). (de)Cypher and every result view draw with
// it, and the HTML export draws the same tree with the DOM.

import * as React from 'react'
import { Download } from 'lucide-react'
import { download } from '../../../matrix/src/lib/export'
import { formatHints } from '../../../matrix/src/lib/exportPrefs'
import { Select, SelectContent, SelectItem, SelectTrigger } from '../ui/select'
import { cn } from '../lib/utils'
import { figureFile, resultAnalysis } from './export'
import { fileName, useExportPrefs, type NameFields } from './exportPrefs'
import { curvesOf, kit, type Series } from './index'
import type { ChartGeom, Curve, Marks, Palette, VNode } from './kit'
import { PALETTES, TOKENS_BY_THEME, usePageTheme } from './theme'

/** A line of a curve in its colour and dash, for legends, tables and readouts. */
export function Swatch({ color, dash, width = 22 }: { color: string; dash: string; width?: number }) {
  return <svg width={width} height={6} aria-hidden className="shrink-0"><line x1={1} x2={width - 1} y1={3} y2={3} stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={dash === 'none' ? undefined : dash} /></svg>
}

/** A kit chart tree as React elements. */
function toReact(n: VNode | string, i: number): React.ReactNode {
  if (typeof n === 'string') return n
  const [tag, { key, ...attrs }, ...kids] = n
  return React.createElement(tag, { ...attrs, key: (key as string | undefined) ?? i }, ...kids.map((c, j) => toReact(c, j)))
}

export interface ChartOptions {
  /** `zero`: from 0 (g(r), counts); `data`: the data's own range. */
  y?: 'zero' | 'data'
  /** A dashed rule: g = 1 (the default), 0 for a signed quantity, null for none. */
  rule?: number | null
  /** Digits of x in peak labels and the readout (an RDF's r: 3); by default as the grid's values are written. */
  xDigits?: number
}

/** The chart, filling its box (or `height` tall); under the pointer, a rule, a dot on each curve and their values. */
export function ChartPanel({ curves, grid, xlabel, ylabel, pal, marks, y, rule, xDigits, height, className, empty }: ChartOptions & {
  curves: Curve[]; grid: number[]; xlabel: string; ylabel: string; pal: Palette; marks: Marks; height?: number; className?: string; empty?: { title: string; hint: string } | null
}) {
  const box = React.useRef<HTMLDivElement>(null)
  const id = 'plot-' + React.useId().replace(/[^\w-]/g, '')
  const [size, setSize] = React.useState({ w: 0, h: 0 })
  const [hover, setHover] = React.useState<number | null>(null), [near, setNear] = React.useState<string | null>(null)
  React.useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize(s => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight })))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // The curve nearest the pointer is drawn over the others, which dim (Morpheus's 40 %, R7a).
  const drawn = React.useMemo(() => (near && curves.length > 1 ? curves.map(c => (c.key === near ? { ...c, hot: true, dim: false } : { ...c, dim: true })) : curves), [curves, near])
  const out = React.useMemo(() => (size.w && size.h ? kit.chart({ W: size.w, H: size.h, curves: drawn, grid, xlabel, ylabel, hover, marks, pal, animate: true, y, rule, id, xDigits }) : null), [size, drawn, grid, xlabel, ylabel, hover, marks, pal, y, rule, id, xDigits])
  const geom: ChartGeom | null = out?.geom ?? null
  const xv = geom && hover != null ? geom.m.l + ((hover - geom.x0) / (geom.x1 - geom.x0 || 1)) * geom.iw : 0
  return (
    <div ref={box} data-slot="chart" className={cn('relative', height ? null : 'min-h-[260px]', className)} style={height ? { height } : undefined}
      onMouseMove={e => {
        if (!geom) return
        const box = e.currentTarget.getBoundingClientRect(), r = kit.hoverX(geom, e.clientX - box.left), py = e.clientY - box.top
        if (r !== hover) setHover(r)
        // Within 10 px of a curve at this x: that one.
        let best: string | null = null, d = 10
        if (r != null) for (const c of curves) { const at = geom.m.t + geom.ih - ((kit.valAt(c.x, c.y, r) - geom.y0) / (geom.y1 - geom.y0 || 1)) * geom.ih; if (Math.abs(at - py) < d) { d = Math.abs(at - py); best = c.key } }
        if (best !== near) setNear(best)
      }}
      onMouseLeave={() => { setHover(null); setNear(null) }}>
      <div className="absolute inset-0">{out && toReact(out.tree, 0)}</div>
      {empty && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
          <div className="text-heading font-bold">{empty.title}</div>
          <div className="max-w-[46ch] text-caption text-muted-foreground">{empty.hint}</div>
        </div>
      )}
      {geom && hover != null && curves.length > 0 && (
        <div data-slot="readout" className="pointer-events-none absolute z-10 flex w-[300px] flex-col gap-1 rounded-lg border border-border bg-popover px-2.5 py-2 shadow-menu" style={{ left: Math.max(0, xv + 314 > size.w ? xv - 314 : xv + 14), top: geom.m.t + 4 }}>
          <div className="text-caption text-muted-foreground">{kit.readoutTitle(geom, xlabel, ylabel, hover)}</div>
          {kit.hoverRows(curves, hover).slice(0, 14).map(({ curve: c, v }) => (
            <div key={c.key} className="grid grid-cols-[22px_minmax(0,1fr)_auto_auto] items-center gap-[7px] text-caption">
              <Swatch color={c.color} dash={c.dash} />
              <span className="truncate font-bold" style={{ color: c.color }}>{c.name}</span>
              <span className="truncate text-muted-foreground">{c.source}</span>
              <span>{v.toFixed(geom.yDigits)}</span>
            </div>
          ))}
          {curves.length > 14 && <div className="text-caption text-muted-foreground">+ {curves.length - 14} more</div>}
        </div>
      )}
    </div>
  )
}

/** What a chart exports under (R6a): its file's own name and the fields of the name template (R6b), its title, its data as CSV, and (when it can be one) an HTML page. */
export interface ChartExport { file: string; fields?: NameFields; title: string; sub?: string; csv: () => string; html?: (() => Promise<string>) | null; why?: string }

/**
 * A chart's export menu (R6a): SVG, PDF and PNG through the Matrix's figures, in the export theme's palette; CSV at
 * gmx's own precision; the interactive HTML page when the chart can be one (else why not).
 */
export function ExportMenu({ exp, curves, xlabel, ylabel, marks, className, ...o }: ChartOptions & {
  exp: ChartExport; curves: (pal: Palette) => Curve[]; xlabel: string; ylabel: string; marks: Marks; className?: string
}) {
  const [busy, setBusy] = React.useState(false), [prefs] = useExportPrefs(), hints = formatHints(prefs, '')
  const go = async (f: string) => {
    setBusy(true)
    try {
      const name = (ext: string) => fileName(prefs.name, { ...exp.fields, file: exp.file }, ext)
      if (f === 'csv') download(new Blob([exp.csv()], { type: 'text/csv;charset=utf-8' }), name('csv'))
      else if (f === 'html') { if (exp.html) download(new Blob([await exp.html()], { type: 'text/html;charset=utf-8' }), name('html')) }
      else if (f === 'svg' || f === 'pdf' || f === 'png') {
        const pal = PALETTES[prefs.theme === 'dark' ? 'dark' : 'light']
        download(await figureFile({ title: exp.title, sub: exp.sub, file: exp.file, xlabel, ylabel, curves: curves(pal), marks, ...o }, f, prefs), name(f))
      }
    } finally { setBusy(false) }
  }
  return (
    <Select value="" onValueChange={v => void go(v)}>
      <SelectTrigger size="sm" className={cn('h-7 gap-1.5 border-transparent bg-transparent px-2 text-muted-foreground hover:text-foreground', className)} aria-label={'export ' + exp.title} disabled={busy}>
        <Download className="size-3.5" />{busy ? 'exporting…' : 'export'}
      </SelectTrigger>
      <SelectContent align="end">
        {(['svg', 'pdf', 'png'] as const).map(f => <SelectItem key={f} value={f}>{f} · {hints[f]}{prefs.format === f ? ' · default' : ''}</SelectItem>)}
        <SelectItem value="csv">csv · every point as gmx wrote it</SelectItem>
        {exp.html !== undefined && <SelectItem value="html" disabled={!exp.html}>html · {exp.html ? 'interactive page, one file' : exp.why}</SelectItem>}
      </SelectContent>
    </Select>
  )
}

/** The interactive page of a result's chart (R6a), from the (de)Cypher export, loaded when asked. */
async function resultHtml(exp: ChartExport, series: Series[], xlabel: string, ylabel: string, o: ChartOptions) {
  const { exportData, exportHtml, fontData } = await import('../decypher/export')
  const a = resultAnalysis({ id: 'result', title: exp.title, sub: exp.sub ?? '', xlabel, ylabel, series, y: o.y ?? 'zero', rule: o.rule === undefined ? 1 : o.rule, xDigits: o.xDigits })!
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  const d = exportData({ analyses: [a], structs: {}, selected: () => a.sels.map(g => g.name), tones: {}, compare: null, view: { rep: 'ball & stick', rest: 'grey', labels: true, hydrogens: true, arrange: 'side by side' }, theme, tokens: TOKENS_BY_THEME, structures: false, by: 'gmx-cypher', header: exp.title })
  return exportHtml(d, await fontData())
}

/**
 * A result's chart (R5c): its series as the core's curves, in the page's theme, and under it, when asked, a legend
 * of each curve's line and name (dimmed ones dimmed); with `exp`, its export menu (R6a).
 */
export function SeriesChart({ series, xlabel, ylabel, marks = 'none', height = 240, legend = false, ramp, exp, ...o }: ChartOptions & {
  series: Series[]; xlabel: string; ylabel: string; marks?: Marks; height?: number; legend?: boolean; exp?: ChartExport
  /** Ordered curves (R7a): the legend is a bar of their ramp, from the first curve's name to the last's. */
  ramp?: { first: string; last: string }
}) {
  const pal = PALETTES[usePageTheme()]
  const curves = React.useMemo(() => curvesOf(series, pal), [series, pal])
  const full = React.useMemo(() => exp && { ...exp, ...(resultAnalysis({ id: 'r', title: '', sub: '', xlabel, ylabel, series }) ? { html: () => resultHtml(exp, series, xlabel, ylabel, o) } : { html: null, why: 'its curves are on different x grids' }) },
    [exp, series, xlabel, ylabel, o.y, o.rule, o.xDigits])
  return (
    <figure className="relative m-0 flex flex-col gap-2">
      {full && <ExportMenu className="absolute right-0 top-0 z-[1]" exp={full} curves={p => curvesOf(series, p)} xlabel={xlabel} ylabel={ylabel} marks={marks} {...o} />}
      <ChartPanel curves={curves} grid={curves[0]?.x ?? []} xlabel={xlabel} ylabel={ylabel} pal={pal} marks={marks} height={height} {...o} />
      {ramp && curves.length > 1 && (
        <figcaption className="flex flex-wrap items-center gap-x-3 text-caption text-muted-foreground">
          <span>{ramp.first}</span>
          <span aria-hidden className="h-1.5 w-48 rounded-full" style={{ background: 'linear-gradient(to right, ' + curves.map(c => c.color).join(', ') + ')' }} />
          <span>{ramp.last}</span>
          <span>· {curves.length} curves, in order · hover one to see it alone</span>
        </figcaption>
      )}
      {legend && !ramp && (
        <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
          {curves.map(c => <span key={c.key} className="inline-flex items-center gap-2" style={{ opacity: c.dim ? 0.4 : 1 }}><Swatch color={c.color} dash={c.dash} />{c.name}</span>)}
        </figcaption>
      )}
    </figure>
  )
}
