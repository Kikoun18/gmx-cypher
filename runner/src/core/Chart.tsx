// The core's chart in React (R5c): the kit's SVG tree rendered as elements, filling its box, with a rule, a dot on
// each curve and their values under the pointer, highest first (T153). (de)Cypher and every result view draw with
// it, and the HTML export draws the same tree with the DOM.

import * as React from 'react'
import { cn } from '../lib/utils'
import { curvesOf, kit, type Series } from './index'
import type { ChartGeom, Curve, Marks, Palette, VNode } from './kit'
import { PALETTES, usePageTheme } from './theme'

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
  const [hover, setHover] = React.useState<number | null>(null)
  React.useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize(s => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight })))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const out = React.useMemo(() => (size.w && size.h ? kit.chart({ W: size.w, H: size.h, curves, grid, xlabel, ylabel, hover, marks, pal, animate: true, y, rule, id, xDigits }) : null), [size, curves, grid, xlabel, ylabel, hover, marks, pal, y, rule, id, xDigits])
  const geom: ChartGeom | null = out?.geom ?? null
  const xv = geom && hover != null ? geom.m.l + ((hover - geom.x0) / (geom.x1 - geom.x0 || 1)) * geom.iw : 0
  return (
    <div ref={box} data-slot="chart" className={cn('relative', height ? null : 'min-h-[260px]', className)} style={height ? { height } : undefined}
      onMouseMove={e => { if (!geom) return; const r = kit.hoverX(geom, e.clientX - e.currentTarget.getBoundingClientRect().left); if (r !== hover) setHover(r) }}
      onMouseLeave={() => setHover(null)}>
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

/**
 * A result's chart (R5c): its series as the core's curves, in the page's theme, and under it, when asked, a legend
 * of each curve's line and name (dimmed ones dimmed).
 */
export function SeriesChart({ series, xlabel, ylabel, marks = 'none', height = 240, legend = false, ...o }: ChartOptions & {
  series: Series[]; xlabel: string; ylabel: string; marks?: Marks; height?: number; legend?: boolean
}) {
  const pal = PALETTES[usePageTheme()]
  const curves = React.useMemo(() => curvesOf(series, pal), [series, pal])
  return (
    <figure className="m-0 flex flex-col gap-2">
      <ChartPanel curves={curves} grid={curves[0]?.x ?? []} xlabel={xlabel} ylabel={ylabel} pal={pal} marks={marks} height={height} {...o} />
      {legend && (
        <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
          {curves.map(c => <span key={c.key} className="inline-flex items-center gap-2" style={{ opacity: c.dim ? 0.4 : 1 }}><Swatch color={c.color} dash={c.dash} />{c.name}</span>)}
        </figcaption>
      )}
    </figure>
  )
}
