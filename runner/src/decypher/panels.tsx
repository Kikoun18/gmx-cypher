// The structure half of an analysis in (de)Cypher (the kit's canvas view) and the table under its g(r); the chart
// itself is the core's ChartPanel. Both draw with the same code as the exported page.

import * as React from 'react'
import { cn } from '../lib/utils'
import { Swatch } from '../core/Chart'
import { Legend } from '../ui/legend'
import type { AtomHover, Curve, Group, HeldKeys, LineStyle, Mol, Paint, Palette, SceneState } from '../core/kit'
import { pressed, useBindings } from '../lib/shortcuts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Status } from '../ui/status'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { modName } from '../lib/platform'
import { setLabel } from '../lib/labels'
import { Input } from '../ui/input'
import type { View } from './state'
import { kit } from '../core/theme'

/** The view's controls; `png` is the picture as drawn now (R6a), at the screen's resolution. */
export interface StructureHandle { fit: () => void; reset: () => void; where: (nr: number) => { x: number; y: number } | null; png: () => Promise<Blob | null> }

export const StructurePanel = React.forwardRef<StructureHandle, {
  mol: Mol | null; pal: Palette; view: View; sels: Group[]; selected: number[]; refs: { label: string; atoms: number[]; on?: boolean }[]
  hoverSel: number; hoverRef?: number; onPick: (sels: number[], add: boolean) => void; onPickRef?: (ref: number, add: boolean) => void; onActive?: () => void; className?: string; empty: React.ReactNode
  /** Values painted on the atoms (R10b), atoms ringed from the chart, and the atom under the pointer for the chart. */
  paint?: Paint | null; ring?: number[]; onAtom?: (nr: number | null) => void
  /** H-bond pairs drawn dashed (R10c): donor, hydrogen, acceptor; lines of the plotted groups and gmx rms's fit group (R10d). */
  pairs?: [number, number, number][]; lines?: SceneState['lines']; fit?: SceneState['fit']
}>(function StructurePanel({ mol, pal, view, sels, selected, refs, hoverSel, hoverRef = -1, onPick, onPickRef, onActive, className, empty, paint = null, ring, onAtom, pairs, lines, fit }, ref) {
  const wrap = React.useRef<HTMLDivElement>(null), canvas = React.useRef<HTMLCanvasElement>(null)
  const ctl = React.useRef<ReturnType<typeof kit.structureView> | null>(null)
  const [tip, setTip] = React.useState<AtomHover | null>(null)
  const atom = React.useRef(onAtom)
  React.useLayoutEffect(() => { atom.current = onAtom })
  React.useEffect(() => { atom.current?.(tip?.nr ?? null) }, [tip?.nr])
  const pick = React.useRef(onPick), pickRef = React.useRef(onPickRef)
  // The held keys, from the registry: read by the view at each press, so a key rebound in settings applies at once.
  const [bindings] = useBindings(), held = React.useRef<HeldKeys>({ centre: 'c', pan: ' ' })
  held.current.centre = bindings.centre?.key ?? ''
  React.useLayoutEffect(() => { pick.current = onPick; pickRef.current = onPickRef })
  React.useImperativeHandle(ref, () => ({ fit: () => ctl.current?.fit(), reset: () => ctl.current?.reset(), where: nr => ctl.current?.where(nr) ?? null, png: () => new Promise(ok => (canvas.current ? canvas.current.toBlob(ok, 'image/png') : ok(null))) }), [])
  React.useEffect(() => {
    if (!wrap.current || !canvas.current || !mol) return
    const c = kit.structureView(canvas.current, wrap.current, { hover: setTip, pick: (i, add) => pick.current(i, add), pickRef: (i, add) => pickRef.current?.(i, add) }, held.current)
    ctl.current = c
    if (document.fonts?.ready) document.fonts.ready.then(() => c.redraw())
    return () => { c.destroy(); ctl.current = null }
  }, [!!mol]) // eslint-disable-line react-hooks/exhaustive-deps -- made once while there is a structure; set() brings each change
  React.useEffect(() => {
    const st: SceneState = { mol, pal, rep: view.rep, rest: view.rest, labels: view.labels, hydrogens: view.hydrogens, sels, selected, refs, hoverSel, hoverRef, paint, ring, pairs, lines, fit }
    ctl.current?.set(st)
  }, [mol, pal, view.rep, view.rest, view.labels, view.hydrogens, sels, selected, refs, hoverSel, hoverRef, paint, ring, pairs, lines, fit])
  if (!mol) return <div className={cn('flex flex-col items-center justify-center gap-1.5 p-6 text-center', className)}>{empty}</div>
  const mod = modName(), g = tip && tip.sel >= 0 ? sels[tip.sel] : null, r = tip && tip.ref >= 0 ? refs[tip.ref] : null, on = g ? selected.includes(sels.indexOf(g)) : false
  return (
    <div ref={wrap} className={cn('relative min-h-[340px]', className)} onPointerDown={onActive} onMouseEnter={onActive}>
      <canvas ref={canvas} className="absolute inset-0 block size-full cursor-grab touch-none" aria-label="structure: drag to rotate, right- or Space-drag to pan, scroll to zoom, double-click to fit the plotted groups; Shift-click takes a residue, Alt-click an atom name, C + click centres" />
      <div className="pointer-events-none absolute inset-x-3.5 bottom-2.5 flex flex-wrap items-end justify-between gap-x-3.5 gap-y-1.5 text-caption text-muted-foreground">
        {/* Painted values (R10b): the ramp's scale, lowest to highest, in place of the plotted / not plotted key. */}
        {paint ? <span className="inline-flex items-center gap-2">{paint.label} ({paint.unit}) {fmtStat(paint.min)}
          <span aria-hidden className="h-1.5 w-28 rounded-full" style={{ background: 'linear-gradient(to right, ' + pal.ramp.join(', ') + ')' }} />{fmtStat(paint.max)} · the rest neutral</span> : <div className="flex flex-wrap gap-3.5">
          <span className="inline-flex items-center gap-[7px]"><span className="size-2.5 rounded-full bg-coral shadow-[0_0_0_1.5px_var(--coral-strong),0_0_9px_var(--coral-strong)]" />plotted</span>
          <span className="inline-flex items-center gap-[7px]"><span className="size-2.5 rounded-full" style={{ background: pal.neutral.O }} />not plotted</span>
          <span className="inline-flex items-center gap-[7px]"><span className="size-2 rounded-full bg-foreground shadow-[0_0_0_1.5px_var(--card),0_0_0_2.7px_var(--foreground)]" />reference</span>
          {fit && <span className="inline-flex items-center gap-[7px]"><span className="size-2.5 rounded-full border-[1.5px] border-dashed border-foreground" />fit group</span>}
        </div>}
        <span>{mol.n} atoms · solvent hidden{mol.links.length ? ' but for the pairs\' molecules' : ''}{mol.truncated ? ' · first 4000' : ''} · drag rotate · right- or Space-drag pan · scroll zoom · F fit</span>
      </div>
      {tip && (
        <div className="pointer-events-none absolute z-[2] flex w-60 flex-col gap-0.5 rounded-lg border border-border bg-popover px-2.5 py-2 shadow-menu" style={{ left: tip.left, top: tip.top }}>
          <span className="text-caption text-muted-foreground">{tip.atom}</span>
          {tip.value != null && paint && <span className="text-control font-bold">{paint.label} {fmtStat(tip.value)} {paint.unit}</span>}
          <span className="text-control font-bold" style={{ color: g ? pal.hues[g.tone].strong : r ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
            {g ? kit.shownName(g) + ' · ' + g.atoms.length + ' atoms' : r ? 'reference · ' + r.label : 'not in any group'}
          </span>
          {(g || r) && <span className="text-caption text-muted-foreground">{g ? (on ? (selected.length > 1 ? 'click: plot alone · ' + mod + '-click: remove' : 'click: remove') : 'click: plot alone · ' + mod + '-click: add') + ' · Shift: its residue' : onPickRef ? 'click: plot only this one · ' + mod + '-click: add or remove' : 'g(r) is measured from these atoms'}</span>}
        </div>
      )}
    </div>
  )
})

const mean = (y: number[]) => { const v = y.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN }
const fmtStat = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(4)).toString() : '—')

/** The curves under a chart: series, source, atoms, then an RDF's both peak rules (R3d), or any other result's mean and range (R10a); × takes one off the plot. */
/**
 * A curve's style of its own (R11b), from its swatch: the dash by the Matrix's name, the width (1.5 or 2 px), the shade
 * a step lighter or darker; reset to the curve as drawn. Esc or a click outside closes it.
 */
function StyleMenu({ curve, style, onStyle }: { curve: Curve; style: LineStyle | undefined; onStyle: (s: LineStyle | null) => void }) {
  // Placed on the window, not in the table's scrolling box: below the swatch, or above it near the window's foot.
  const [open, setOpen] = React.useState<React.CSSProperties | null>(null), box = React.useRef<HTMLDivElement>(null), s = style ?? {}
  const toggle = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    setOpen(o => (o ? null : r.bottom + 220 > window.innerHeight ? { left: r.left, bottom: window.innerHeight - r.top + 4 } : { left: r.left, top: r.bottom + 4 }))
  }
  React.useEffect(() => {
    if (!open) return
    // The dash's list opens in a portal of its own: a pick there is not a click outside.
    const out = (e: PointerEvent) => { const t = e.target as Element; if (!box.current?.contains(t) && !t.closest?.('[data-radix-popper-content-wrapper]')) setOpen(null) }
    document.addEventListener('pointerdown', out)
    return () => document.removeEventListener('pointerdown', out)
  }, [open])
  const set = (p: LineStyle) => { const n = kit.cleanStyles({ k: { ...s, ...p } }).k; onStyle(n ?? null) }
  const shade = s.shade ?? 0
  return (
    <div ref={box} className="relative" onKeyDown={e => { if (open && pressed(e, 'escape')) { e.stopPropagation(); setOpen(null) } }}>
      <button type="button" aria-expanded={!!open} aria-label={'style of ' + curve.name + (curve.source ? ' · ' + curve.source : '')} title="its dash, width and shade" onClick={toggle}
        className="grid h-[22px] w-[26px] place-items-center rounded hover:bg-accent"><Swatch color={curve.color} dash={curve.dash} /></button>
      {open && (
        <div role="group" aria-label={'style of ' + curve.name} style={open} className="fixed z-30 flex w-max flex-col gap-2.5 rounded-lg border border-border bg-popover p-3 shadow-menu">
          <Select value={s.dash ?? ''} onValueChange={v => set({ dash: v })}>
            <SelectTrigger size="sm" className="w-40" aria-label="dash"><SelectValue placeholder="dash · as drawn" /></SelectTrigger>
            <SelectContent>{kit.DASH_NAMES.map((n, i) => <SelectItem key={n} value={n}><span className="inline-flex items-center gap-2"><Swatch color="currentColor" dash={kit.DASH[i]} />{n}</span></SelectItem>)}</SelectContent>
          </Select>
          <ToggleGroup type="single" size="sm" value={String(s.width ?? curve.width ?? 2)} onValueChange={v => v && set({ width: Number(v) })} aria-label="width">
            <ToggleGroupItem value="1.5">1.5 px</ToggleGroupItem><ToggleGroupItem value="2">2 px</ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center gap-1.5 text-caption">
            <span className="text-muted-foreground">shade</span>
            <button type="button" className="rounded px-2 py-0.5 hover:bg-accent disabled:opacity-40" disabled={shade <= -3} onClick={() => set({ shade: shade - 1 })}>darker</button>
            <span className="w-5 text-center">{shade > 0 ? '+' + shade : shade}</span>
            <button type="button" className="rounded px-2 py-0.5 hover:bg-accent disabled:opacity-40" disabled={shade >= 3} onClick={() => set({ shade: shade + 1 })}>lighter</button>
          </div>
          <button type="button" className="self-start text-caption text-muted-foreground underline underline-offset-2 hover:text-foreground" disabled={!style} onClick={() => onStyle(null)}>as drawn</button>
        </div>
      )}
    </div>
  )
}

export function CurveTable({ curves, onRemove, onHover, source = true, stats = 'peaks', styles, onStyle }: {
  curves: Curve[]; onRemove: (name: string) => void; onHover: (c: Curve | null) => void; source?: boolean; stats?: 'peaks' | 'series'
  /** Curves' styles of their own (R11b), and setting one (null: as drawn). */
  styles?: Record<string, LineStyle>; onStyle?: (key: string, s: LineStyle | null) => void
}) {
  if (!curves.length) return null
  // Never by hue alone (Morpheus): a style that makes two curves of one tone alike is said, with the way out.
  const alike = kit.sameLooks(curves), who = (c: Curve) => c.name + (source && c.source ? ' · ' + c.source : '')
  const cols = source ? 'grid-cols-[26px_minmax(0,1fr)_minmax(0,1.1fr)_44px_96px_96px_26px]' : 'grid-cols-[26px_minmax(0,1fr)_44px_96px_96px_26px]'
  return (
    <div className="flex max-h-64 flex-col gap-0.5 overflow-auto">
      <div className={cn('grid items-center gap-2 pb-1 text-label uppercase text-muted-foreground', cols)}>
        <span /><span className="truncate">series</span>{source && <span className="truncate">source</span>}<span className="text-right">atoms</span>{stats === 'peaks' ? <><span className="text-right">maximum r · g</span><span className="text-right">first shell r · g</span></> : <><span className="text-right">mean</span><span className="text-right">min – max</span></>}<span />
      </div>
      {curves.map(c => (
        <div key={c.key} className={cn('grid min-h-[26px] items-center gap-2 text-control', cols)} onMouseEnter={() => onHover(c)} onMouseLeave={() => onHover(null)}>
          {onStyle ? <StyleMenu curve={c} style={styles?.[c.key]} onStyle={s => onStyle(c.key, s)} /> : <Swatch color={c.color} dash={c.dash} />}
          <span className="truncate font-bold" style={{ color: c.color }} title={c.label ? 'gmx name: ' + c.name : undefined}>{c.label ?? c.name}</span>
          {source && <span className="truncate text-muted-foreground">{c.source}</span>}
          <span className="text-right">{c.atoms || '—'}</span>
          {stats === 'peaks' ? <>
            <span className="text-right">{c.peak ? c.peak.r.toFixed(3) + ' · ' + c.peak.g.toFixed(2) : '—'}</span>
            <span className="text-right">{c.shell ? c.shell.r.toFixed(3) + ' · ' + c.shell.g.toFixed(2) : '—'}</span>
          </> : <>
            <span className="text-right">{fmtStat(mean(c.y))}</span>
            <span className="text-right">{fmtStat(Math.min(...c.y.filter(Number.isFinite))) + ' – ' + fmtStat(Math.max(...c.y.filter(Number.isFinite)))}</span>
          </>}
          <button type="button" aria-label={'take ' + c.name + ' off the plot'} onClick={() => onRemove(c.name)} className="grid size-[22px] place-items-center justify-self-end rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">×</button>
        </div>
      ))}
      {alike.map(w => <Status key={w.a.key + w.b.key} level="warning">{who(w.a) + ' and ' + who(w.b) + (w.why === 'same' ? ' look the same' : ' differ by shade alone') + ': give one another dash or width'}</Status>)}
    </div>
  )
}

/** The reference and the groups as chips, by the one legend's rules (R8a). */
export function GroupChips({ refs, sels, selected, pal, dim, hover, onShown, onPickRef, onHover }: {
  refs: { label: string; count: number; dashed: boolean; on?: boolean; plain?: boolean }[]; sels: Group[]; selected: string[]; pal: Palette; dim: boolean; hover: string | null
  /** The groups plotted after a click, by the one legend's rules (R8a). */
  onShown: (names: string[]) => void; onHover: (name: string | null) => void
  /** Given where RDFs are morphed: the references are buttons, one, the other or both plotted. */
  onPickRef?: (ref: number, add: boolean) => void
}) {
  // Curves of a result without atom groups (energy terms) have no atoms to count.
  const counts = refs.length > 0 || sels.some(g => g.atoms.length)
  return (
    <div className="flex flex-wrap gap-1.5">
      {refs.map((r, i) => {
        const cls = cn('inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-foreground px-2.5 text-caption', r.dashed || r.on === false ? 'border-dashed text-foreground' : 'text-foreground', r.on === false && 'opacity-45')
        const body = <>{r.plain ? '' : 'ref '}{r.label}{!r.plain && <span className="opacity-70">{r.count || '—'}</span>}</>
        return onPickRef
          ? <button key={r.label} type="button" aria-pressed={r.on !== false} title={'click: plot only this reference · ' + modName() + '-click: add or remove'} className={cn(cls, 'cursor-pointer')} onClick={e => onPickRef(i, e.metaKey || e.ctrlKey)}>{body}</button>
          : <span key={r.label} className={cls}>{body}</span>
      })}
      <Legend label="groups" className="contents" items={sels.map(g => ({ key: g.name, label: kit.shownName(g), g }))} shown={selected} onShown={onShown} onHover={onHover}
        itemClass={(_, on) => cn('inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-caption transition-[background-color,box-shadow] duration-[120ms]', on && 'font-bold')}
        itemStyle={({ g }, on) => { const t = pal.hues[g.tone]; return { background: on ? t.base : dim ? pal.secondary : t.soft, color: on ? t.fg : dim ? pal.muted : t.strong, boxShadow: hover === g.name ? '0 0 0 2px ' + pal.fg : 'none' } }}
        item={({ g }, on) => <><span className="size-[7px] shrink-0 rounded-full" style={{ background: on ? pal.hues[g.tone].fg : pal.hues[g.tone].strong }} /><span title={g.label ? 'gmx name: ' + g.name : undefined}>{kit.shownName(g)}</span>{counts && <span className="opacity-70">{g.atoms.length || '—'}</span>}</>} />
    </div>
  )
}

/**
 * Labels for an analysis's reference and groups (R11d), shown in their place here, in results and in exports: each gmx
 * name with a label (empty: the name). A label is not the data: the record, the .ndx and the .xvg keep gmx's names.
 */
export function Renames({ a }: { a: { id: string; ref: Group | null; sels: Group[] } }) {
  const [open, setOpen] = React.useState(false)
  const groups = [...(a.ref ? [{ g: a.ref, ref: true }] : []), ...a.sels.map(g => ({ g, ref: false }))]
  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" aria-expanded={open} className="self-start text-caption text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setOpen(o => !o)}>{open ? 'done renaming' : 'rename groups'}</button>
      {open && (
        <div className="grid max-w-[520px] grid-cols-[minmax(0,1fr)_minmax(0,220px)] items-center gap-x-3 gap-y-1 text-caption">
          {groups.map(({ g, ref }) => (
            <React.Fragment key={g.name}>
              <span className="truncate text-muted-foreground">{(ref ? 'ref ' : '') + g.name}</span>
              <Input className="h-6 text-caption" defaultValue={g.label ?? ''} placeholder={g.name} aria-label={'label for ' + g.name} onChange={e => setLabel(a.id, g.name, e.target.value)} />
            </React.Fragment>
          ))}
          <span className="col-span-2 text-muted-foreground">a label shows here, in results and in exports; the record, the .ndx and the .xvg keep gmx's names</span>
        </div>
      )}
    </div>
  )
}
