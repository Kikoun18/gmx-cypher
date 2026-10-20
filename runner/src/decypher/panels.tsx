// The structure half of an analysis in (de)Cypher (the kit's canvas view) and the table under its g(r); the chart
// itself is the core's ChartPanel. Both draw with the same code as the exported page.

import * as React from 'react'
import { cn } from '../lib/utils'
import { Swatch } from '../core/Chart'
import type { AtomHover, Curve, Group, Mol, Palette, SceneState } from '../core/kit'
import type { View } from './state'
import { kit } from '../core/theme'

/** The view's controls; `png` is the picture as drawn now (R6a), at the screen's resolution. */
export interface StructureHandle { fit: () => void; reset: () => void; where: (nr: number) => { x: number; y: number } | null; png: () => Promise<Blob | null> }

export const StructurePanel = React.forwardRef<StructureHandle, {
  mol: Mol | null; pal: Palette; view: View; sels: Group[]; selected: number[]; refs: { label: string; atoms: number[]; on?: boolean }[]
  hoverSel: number; hoverRef?: number; onPick: (sel: number, add: boolean) => void; onPickRef?: (ref: number, add: boolean) => void; onActive?: () => void; className?: string; empty: React.ReactNode
}>(function StructurePanel({ mol, pal, view, sels, selected, refs, hoverSel, hoverRef = -1, onPick, onPickRef, onActive, className, empty }, ref) {
  const wrap = React.useRef<HTMLDivElement>(null), canvas = React.useRef<HTMLCanvasElement>(null)
  const ctl = React.useRef<ReturnType<typeof kit.structureView> | null>(null)
  const [tip, setTip] = React.useState<AtomHover | null>(null)
  const pick = React.useRef(onPick), pickRef = React.useRef(onPickRef)
  React.useLayoutEffect(() => { pick.current = onPick; pickRef.current = onPickRef })
  React.useImperativeHandle(ref, () => ({ fit: () => ctl.current?.fit(), reset: () => ctl.current?.reset(), where: nr => ctl.current?.where(nr) ?? null, png: () => new Promise(ok => (canvas.current ? canvas.current.toBlob(ok, 'image/png') : ok(null))) }), [])
  React.useEffect(() => {
    if (!wrap.current || !canvas.current || !mol) return
    const c = kit.structureView(canvas.current, wrap.current, { hover: setTip, pick: (i, add) => pick.current(i, add), pickRef: (i, add) => pickRef.current?.(i, add) })
    ctl.current = c
    if (document.fonts?.ready) document.fonts.ready.then(() => c.redraw())
    return () => { c.destroy(); ctl.current = null }
  }, [!!mol]) // eslint-disable-line react-hooks/exhaustive-deps -- made once while there is a structure; set() brings each change
  React.useEffect(() => {
    const st: SceneState = { mol, pal, rep: view.rep, rest: view.rest, labels: view.labels, hydrogens: view.hydrogens, sels, selected, refs, hoverSel, hoverRef }
    ctl.current?.set(st)
  }, [mol, pal, view.rep, view.rest, view.labels, view.hydrogens, sels, selected, refs, hoverSel, hoverRef])
  if (!mol) return <div className={cn('flex flex-col items-center justify-center gap-1.5 p-6 text-center', className)}>{empty}</div>
  const g = tip && tip.sel >= 0 ? sels[tip.sel] : null, r = tip && tip.ref >= 0 ? refs[tip.ref] : null, on = g ? selected.includes(sels.indexOf(g)) : false
  return (
    <div ref={wrap} className={cn('relative min-h-[340px]', className)} onPointerDown={onActive} onMouseEnter={onActive}>
      <canvas ref={canvas} className="absolute inset-0 block size-full cursor-grab touch-none" aria-label="structure: drag to rotate, right-drag to pan, scroll to zoom, double-click to fit the plotted groups" />
      <div className="pointer-events-none absolute inset-x-3.5 bottom-2.5 flex flex-wrap items-end justify-between gap-x-3.5 gap-y-1.5 text-caption text-muted-foreground">
        <div className="flex flex-wrap gap-3.5">
          <span className="inline-flex items-center gap-[7px]"><span className="size-2.5 rounded-full bg-coral shadow-[0_0_0_1.5px_var(--coral-strong),0_0_9px_var(--coral-strong)]" />plotted</span>
          <span className="inline-flex items-center gap-[7px]"><span className="size-2.5 rounded-full" style={{ background: pal.neutral.O }} />not plotted</span>
          <span className="inline-flex items-center gap-[7px]"><span className="size-2 rounded-full bg-foreground shadow-[0_0_0_1.5px_var(--card),0_0_0_2.7px_var(--foreground)]" />reference</span>
        </div>
        <span>{mol.n} atoms · solvent hidden{mol.truncated ? ' · first 4000' : ''} · drag rotate · right-drag pan · scroll zoom · F fit</span>
      </div>
      {tip && (
        <div className="pointer-events-none absolute z-[2] flex w-60 flex-col gap-0.5 rounded-lg border border-border bg-popover px-2.5 py-2 shadow-menu" style={{ left: tip.left, top: tip.top }}>
          <span className="text-caption text-muted-foreground">{tip.atom}</span>
          <span className="text-control font-bold" style={{ color: g ? pal.hues[g.tone].strong : r ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
            {g ? g.name + ' · ' + g.atoms.length + ' atoms' : r ? 'reference · ' + r.label : 'not in any group'}
          </span>
          {(g || r) && <span className="text-caption text-muted-foreground">{g ? (on ? (selected.length > 1 ? 'click: plot alone · ⌘-click: remove' : 'click: remove') : 'click: plot · ⌘-click: add') : onPickRef ? 'click: plot only this one · ⌘-click: add or remove' : 'g(r) is measured from these atoms'}</span>}
        </div>
      )}
    </div>
  )
})

/** The curves under a chart: series, source, atoms, both peak rules (R3d); × takes a group off the plot. */
export function CurveTable({ curves, onRemove, onHover, source = true }: { curves: Curve[]; onRemove: (name: string) => void; onHover: (c: Curve | null) => void; source?: boolean }) {
  if (!curves.length) return null
  const cols = source ? 'grid-cols-[26px_minmax(0,1fr)_minmax(0,1.1fr)_44px_96px_96px_26px]' : 'grid-cols-[26px_minmax(0,1fr)_44px_96px_96px_26px]'
  return (
    <div className="flex max-h-64 flex-col gap-0.5 overflow-auto">
      <div className={cn('grid items-center gap-2 pb-1 text-label uppercase text-muted-foreground', cols)}>
        <span /><span>series</span>{source && <span>source</span>}<span className="text-right">atoms</span><span className="text-right">maximum r · g</span><span className="text-right">first shell r · g</span><span />
      </div>
      {curves.map(c => (
        <div key={c.key} className={cn('grid min-h-[26px] items-center gap-2 text-control', cols)} onMouseEnter={() => onHover(c)} onMouseLeave={() => onHover(null)}>
          <Swatch color={c.color} dash={c.dash} />
          <span className="truncate font-bold" style={{ color: c.color }}>{c.name}</span>
          {source && <span className="truncate text-muted-foreground">{c.source}</span>}
          <span className="text-right">{c.atoms || '—'}</span>
          <span className="text-right">{c.peak ? c.peak.r.toFixed(3) + ' · ' + c.peak.g.toFixed(2) : '—'}</span>
          <span className="text-right">{c.shell ? c.shell.r.toFixed(3) + ' · ' + c.shell.g.toFixed(2) : '—'}</span>
          <button type="button" aria-label={'take ' + c.name + ' off the plot'} onClick={() => onRemove(c.name)} className="grid size-[22px] place-items-center justify-self-end rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">×</button>
        </div>
      ))}
    </div>
  )
}

/** The reference and the groups as chips: a click plots one group (or clears it), ⌘, ctrl or shift adds it. */
export function GroupChips({ refs, sels, selected, pal, dim, hover, onPick, onPickRef, onHover }: {
  refs: { label: string; count: number; dashed: boolean; on?: boolean; plain?: boolean }[]; sels: Group[]; selected: string[]; pal: Palette; dim: boolean; hover: string | null
  onPick: (name: string, add: boolean) => void; onHover: (name: string | null) => void
  /** Given where RDFs are morphed: the references are buttons, one, the other or both plotted. */
  onPickRef?: (ref: number, add: boolean) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {refs.map((r, i) => {
        const cls = cn('inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-foreground px-2.5 text-caption', r.dashed || r.on === false ? 'border-dashed text-foreground' : 'text-foreground', r.on === false && 'opacity-45')
        const body = <>{r.plain ? '' : 'ref '}{r.label}{!r.plain && <span className="opacity-70">{r.count || '—'}</span>}</>
        return onPickRef
          ? <button key={r.label} type="button" aria-pressed={r.on !== false} title="click: plot only this reference · ⌘-click: add or remove" className={cn(cls, 'cursor-pointer')} onClick={e => onPickRef(i, e.metaKey || e.ctrlKey || e.shiftKey)}>{body}</button>
          : <span key={r.label} className={cls}>{body}</span>
      })}
      {sels.map(g => {
        const on = selected.includes(g.name), t = pal.hues[g.tone]
        return (
          <button key={g.name} type="button" aria-pressed={on} onClick={e => onPick(g.name, e.metaKey || e.ctrlKey || e.shiftKey)} onMouseEnter={() => onHover(g.name)} onMouseLeave={() => onHover(null)}
            className={cn('inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-caption transition-[background-color,box-shadow] duration-[120ms]', on && 'font-bold')}
            style={{ background: on ? t.base : dim ? pal.secondary : t.soft, color: on ? t.fg : dim ? pal.muted : t.strong, boxShadow: hover === g.name ? '0 0 0 2px ' + pal.fg : 'none' }}>
            <span className="size-[7px] shrink-0 rounded-full" style={{ background: on ? t.fg : t.strong }} />
            {g.name}<span className="opacity-70">{g.atoms.length || '—'}</span>
          </button>
        )
      })}
    </div>
  )
}
