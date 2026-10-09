import * as React from 'react'
import type { GLViewer } from '3dmol'
import { Checkbox } from '../ui/checkbox'
import { Kbd } from '../ui/kbd'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { defaultView, structStyle, toPdb, type Look } from '../../../app/src/lib/structFile'
import { drawnNumbers, type Atom } from '../lib/atoms'
import type { Tone } from '../lib/tones'
import { boxDimensions, boxEdges, outsideBox, parseBox } from '../lib/box'

export type PickHow = 'atom' | 'residue' | 'name'

const LOOKS: { v: Look; label: string }[] = [{ v: 'cartoon', label: 'cartoon' }, { v: 'stick', label: 'sticks' }, { v: 'sphere', label: 'spheres' }, { v: 'line', label: 'lines' }]
/** A group's atoms in the current look, coloured: spheres stay spheres, the rest are sticks with a small ball. */
const groupStyle = (look: Look, color: string) =>
  look === 'sphere' ? { sphere: { scale: 0.9, color } } : { stick: { radius: look === 'line' ? 0.06 : 0.16, color }, sphere: { scale: 0.28, color } }
/** The rest in one neutral colour: 3Dmol takes one opacity per model, so fading by opacity would fade the groups too. */
const neutral = (style: Record<string, unknown>, color: string) =>
  Object.fromEntries(Object.entries(style).map(([k, v]) => { const { colorscheme: _, ...rest } = v as Record<string, unknown>; return [k, { ...rest, color }] }))
const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
/** A box corner in nm, as the structure's own units (Å). */
const angstrom = (p: number[]) => ({ x: p[0] * 10, y: p[1] * 10, z: p[2] * 10 })
/** A box angle: whole when it is whole (90°), else one decimal. */
const degrees = (a: number) => (Math.abs(a - Math.round(a)) < 0.05 ? String(Math.round(a)) : a.toFixed(1))

/** The theme in use, so colours read from the tokens follow a switch. */
function useThemeName() {
  const [theme, setTheme] = React.useState(document.documentElement.dataset.theme)
  React.useEffect(() => {
    const o = new MutationObserver(() => setTheme(document.documentElement.dataset.theme))
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => o.disconnect()
  }, [])
  return theme
}

/**
 * The structure drawn with PMF Sequences' toPdb, structStyle and defaultView (R3a). It is loaded with keepH
 * and hydrogens are hidden by style, so 3Dmol's atom index k is always the k-th drawn atom, whose GROMACS
 * number is drawnNumbers(atoms)[k] (T14). Group atoms are drawn in their hue's strong ink.
 */
export function Viewer({ text, format, atoms, colour, onPick, describe }: {
  text: string; format: 'gro' | 'pdb'; atoms: Atom[]
  colour: Map<number, Tone>
  onPick: (nr: number, how: PickHow) => void
  describe: (nr: number) => string
}) {
  const { pdb, info, unknown } = React.useMemo(() => toPdb(text, format), [text, format])
  // The periodic box the file records (R2, T95): drawn as its twelve edges, with its dimensions and the atoms outside it.
  const cell = React.useMemo(() => parseBox(text, format), [text, format])
  const dims = React.useMemo(() => (cell.vectors ? boxDimensions(cell.vectors) : null), [cell])
  const outside = React.useMemo(() => (cell.vectors ? outsideBox(text, format, cell.vectors) : null), [text, format, cell])
  const [showCell, setShowCell] = React.useState(true)
  const numbers = React.useMemo(() => drawnNumbers(atoms), [atoms])
  const index = React.useMemo(() => new Map(numbers.map((nr, k) => [nr, k])), [numbers])
  const byNr = React.useMemo(() => new Map(atoms.map(a => [a.nr, a])), [atoms])
  const def = React.useMemo(() => defaultView(info), [info])
  const [look, setLook] = React.useState<Look>(def.look)
  const [solvent, setSolvent] = React.useState(def.solvent)
  const [hydrogens, setHydrogens] = React.useState(false)
  const [hover, setHover] = React.useState<number | null>(null)
  const [viewer, setViewer] = React.useState<GLViewer | null>(null)
  const box = React.useRef<HTMLDivElement>(null)
  const pick = React.useRef(onPick)
  React.useEffect(() => { pick.current = onPick }, [onPick])
  const theme = useThemeName()

  React.useEffect(() => {
    let alive = true, v: GLViewer | null = null
    const el = box.current
    import('3dmol').then($3Dmol => {
      if (!alive || !el) return
      v = $3Dmol.createViewer(el, { backgroundColor: cssVar('--card') })
      v.addModel(pdb, 'pdb', { keepH: true })
      v.setHoverDuration(60)
      v.setHoverable({}, true, (a: { index: number }) => setHover(numbers[a.index]), () => setHover(null))
      v.setClickable({}, true, (a: { index: number }, _v: unknown, e: MouseEvent) => pick.current(numbers[a.index], e?.shiftKey ? 'residue' : e?.altKey ? 'name' : 'atom'))
      v.zoomTo()
      setViewer(v)
    })
    return () => { alive = false; v?.clear(); if (el) el.innerHTML = ''; setViewer(null) }
  }, [pdb, numbers])

  React.useEffect(() => {
    if (!viewer) return
    viewer.setBackgroundColor(cssVar('--card'), 1)
    viewer.setStyle({}, {})
    // With groups, the rest is drawn in a neutral grey, so a group's hue never hides among element colours (oxygen red vs coral).
    const rest = colour.size > 0 ? cssVar('--input') : null
    for (const [sel, style] of structStyle(info, look, solvent).styles) viewer.setStyle(sel as never, (rest ? neutral(style, rest) : style) as never)
    if (!hydrogens) viewer.setStyle({ elem: 'H' } as never, {} as never)
    const byTone = new Map<Tone, number[]>()
    for (const [nr, tone] of colour) { const k = index.get(nr); if (k != null) { if (!byTone.has(tone)) byTone.set(tone, []); byTone.get(tone)!.push(k) } }
    // Group atoms are drawn in the look itself, in their hue, and always shown (hydrogens and water included).
    for (const [tone, ks] of byTone) viewer.setStyle({ index: ks } as never, groupStyle(look, cssVar('--' + tone + '-strong')) as never)
    viewer.render()
  }, [viewer, info, look, solvent, hydrogens, colour, index, theme])

  // The box is shapes, not styles: its own layer, redrawn when it is switched or the theme changes.
  React.useEffect(() => {
    if (!viewer) return
    viewer.removeAllShapes()
    if (showCell && cell.vectors) {
      const edge = cssVar('--muted-foreground')
      for (const [p, q] of boxEdges(cell.vectors)) viewer.addLine({ start: angstrom(p), end: angstrom(q), color: edge })
    }
    viewer.render()
  }, [viewer, cell, showCell, theme])

  const h = hover != null ? byNr.get(hover) : null
  const virtual = atoms.filter(a => a.elem === 'virtual').length
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup type="single" value={look} onValueChange={v => v && setLook(v as Look)} aria-label="look">
          {LOOKS.map(l => <ToggleGroupItem key={l.v} value={l.v}>{l.label}</ToggleGroupItem>)}
        </ToggleGroup>
        <label className="flex items-center gap-2 text-control"><Checkbox checked={hydrogens} onCheckedChange={c => setHydrogens(c === true)} /> hydrogens</label>
        <label className="flex items-center gap-2 text-control"><Checkbox checked={solvent} onCheckedChange={c => setSolvent(c === true)} /> water & ions</label>
        <label className="flex items-center gap-2 text-control"><Checkbox checked={showCell && !!cell.vectors} disabled={!cell.vectors} onCheckedChange={c => setShowCell(c === true)} /> box <Kbd>B</Kbd></label>
      </div>
      <p className="m-0 text-caption text-muted-foreground">
        {info.atoms} of {atoms.length} atoms drawn{virtual ? ' · ' + virtual + ' virtual sites not drawn' : ''}{unknown.length ? ' · ' + unknown.length + ' not drawn, element unknown (' + unknown.slice(0, 3).join(', ') + ')' : ''}
        {structStyle(info, look, solvent).note && ' · ' + structStyle(info, look, solvent).note}
      </p>
      <p className="m-0 text-caption text-muted-foreground" aria-live="polite">
        {cell.vectors && dims ? <>box of the structure file · a {dims.a.toFixed(2)} · b {dims.b.toFixed(2)} · c {dims.c.toFixed(2)} nm · α {degrees(dims.alpha)}° β {degrees(dims.beta)}° γ {degrees(dims.gamma)}° · V {dims.volume.toFixed(3)} nm³{outside && outside.count ? ' · ' + outside.count + ' of ' + outside.total + ' atoms lie outside it, as recorded' : ''}</> : 'no box: ' + cell.problems.join(' ')}
      </p>
      {cell.vectors && <p className="m-0 text-caption text-muted-foreground">a molecule that crosses an edge looks broken: that is periodicity, not an error</p>}
      {/* B toggles the box while the 3D view has focus (a click in it gives it focus), as section 9.2 asks: a control and a key. */}
      <div className="relative h-[460px] overflow-hidden rounded-xl border border-border bg-card focus-visible:outline-2 focus-visible:outline-ring" tabIndex={0} role="group" aria-label="3D view · B shows or hides the box"
        onKeyDown={e => { if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey && !e.altKey && cell.vectors) { e.preventDefault(); setShowCell(v => !v) } }}>
        <div ref={box} className="absolute inset-0" role="img" aria-label="3D structure: atoms can also be picked by rule or as a list" />
        {h && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-border bg-popover px-3 py-2 text-caption shadow-menu" aria-live="polite">
            <b>atom {h.nr}</b> · {h.name} · {h.resn} {h.resi} · {h.elem}{describe(h.nr) && <> · {describe(h.nr)}</>}
          </div>
        )}
      </div>
    </div>
  )
}
