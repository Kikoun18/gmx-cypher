import * as React from 'react'
import type { GLModel, GLViewer } from '3dmol'
import { Checkbox } from '../ui/checkbox'
import { Kbd } from '../ui/kbd'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { DisplayMenu, DisplayRow, StyleRow } from '../ui/display-menu'
import type { Style } from '../core/contract'
import { defaultView, structStyle, toPdb, type Look } from '../../../matrix/src/lib/structFile'
import { drawnNumbers, type Atom } from '../lib/atoms'
import type { Tone } from '../lib/tones'
import type { Struct } from '../core/index'
import { boxDimensions, boxEdges, outsideBox, parseBox } from '../lib/box'
import { Status } from '../ui/status'

export type PickHow = 'atom' | 'residue' | 'name'

/** The Matrix's look for each of the one set of styles (question 17); ball & stick is its sticks with a ball on each atom. */
const LOOK: Record<Style, Look> = { 'ball & stick': 'stick', sticks: 'stick', spheres: 'sphere', lines: 'line', cartoon: 'cartoon' }
const drawn = (info: Parameters<typeof structStyle>[0], style: Style, solvent: boolean) => {
  const s = structStyle(info, LOOK[style], solvent)
  return style === 'ball & stick' ? { ...s, styles: s.styles.map(([sel, st]): [object, Record<string, unknown>] => [sel, 'stick' in st ? { ...st, sphere: { scale: 0.25 } } : st]) } : s
}
/** A group's atoms in the current look: spheres stay spheres, the rest are sticks with a small ball. In `color`, else by element. */
const groupStyle = (look: Look, color?: string) => {
  const c = color ? { color } : {}
  return look === 'sphere' ? { sphere: { scale: 0.9, ...c } } : { stick: { radius: look === 'line' ? 0.06 : 0.16, ...c }, sphere: { scale: 0.28, ...c } }
}
/** The halo round a group atom while atoms keep their element colours: a translucent sphere in the group's hue. */
const haloStyle = (look: Look, color: string) => ({ sphere: { scale: look === 'sphere' ? 1.35 : 0.85, color, opacity: 0.55 } })

/** How atoms are coloured: by element, with each group a halo in its hue (the default), or in their group's hue with the rest grey. */
export type ColourBy = 'element' | 'group'
const COLOUR_KEY = 'gmx-cypher-viewer-colour'
function useColourBy() {
  const [by, setBy] = React.useState<ColourBy>(() => { try { return localStorage.getItem(COLOUR_KEY) === 'group' ? 'group' : 'element' } catch { return 'element' } })
  return [by, (v: ColourBy) => { setBy(v); try { localStorage.setItem(COLOUR_KEY, v) } catch { /* kept for this page only */ } }] as const
}

/** What is typed into: C then means the letter, not the rotation centre. */
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

/** Where to rotate the view around (T140): the atoms of a group, or one atom, named for the caption. */
export interface Centre { label: string; atoms: number[]; id: number }
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
 * The structure drawn with the Matrix's toPdb, structStyle and defaultView (R3a). It is loaded with keepH
 * and hydrogens are hidden by style, so 3Dmol's atom index k is always the k-th drawn atom, whose GROMACS
 * number is drawnNumbers(atoms)[k] (T14). Atoms keep their element colours and a group is a halo in its hue (T141), or
 * the group's atoms are drawn in the hue's strong ink and the rest in grey. C + click sets the centre of rotation (T140).
 */
export function Viewer({ text, format, model, atoms, colour, onPick, describe, groupOf, centreRequest }: {
  text: string; format: 'gro' | 'pdb'; model: Struct; atoms: Atom[]
  colour: Map<number, Tone | 'reference'>
  onPick: (nr: number, how: PickHow) => void
  describe: (nr: number) => string
  /** The group C + click rotates around for an atom (T140); null: the atom alone. */
  groupOf: (nr: number) => { name: string; atoms: number[] } | null
  /** A group card's "centre" button: rotate around these atoms. */
  centreRequest?: Centre | null
}) {
  const { pdb, info, unknown } = React.useMemo(() => toPdb(text, format), [text, format])
  // The periodic box the file records (R2, T95): drawn as its twelve edges, with its dimensions and the atoms outside it.
  const cell = React.useMemo(() => parseBox(model, format), [model, format])
  const dims = React.useMemo(() => (cell.vectors ? boxDimensions(cell.vectors) : null), [cell])
  const outside = React.useMemo(() => (cell.vectors ? outsideBox(model, cell.vectors) : null), [model, cell])
  const [showCell, setShowCell] = React.useState(true)
  const numbers = React.useMemo(() => drawnNumbers(atoms), [atoms])
  const index = React.useMemo(() => new Map(numbers.map((nr, k) => [nr, k])), [numbers])
  const byNr = React.useMemo(() => new Map(atoms.map(a => [a.nr, a])), [atoms])
  const def = React.useMemo(() => defaultView(info), [info])
  const [style, setStyle] = React.useState<Style>(def.look === 'cartoon' ? 'cartoon' : 'sticks'), look = LOOK[style]
  const [solvent, setSolvent] = React.useState(def.solvent)
  const [hydrogens, setHydrogens] = React.useState(false)
  const [hover, setHover] = React.useState<number | null>(null)
  const [viewer, setViewer] = React.useState<GLViewer | null>(null)
  const [colourBy, setColourBy] = useColourBy()
  // The structure, and (while groups show as halos) a second model of the same atoms, styled as translucent spheres.
  const main = React.useRef<GLModel | null>(null), halo = React.useRef<GLModel | null>(null)
  const box = React.useRef<HTMLDivElement>(null)
  const pick = React.useRef(onPick)
  React.useEffect(() => { pick.current = onPick }, [onPick])
  const theme = useThemeName()
  // C held: a click sets the centre of rotation instead of picking (T140).
  const [cHeld, setCHeld] = React.useState(false)
  const cDown = React.useRef(false)
  const [centre, setCentre] = React.useState<{ label: string; count: number } | null>(null)
  React.useEffect(() => {
    const set = (v: boolean) => { cDown.current = v; setCHeld(v) }
    const down = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target)) set(true) }
    const up = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'c') set(false) }
    const off = () => set(false)
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', off)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', off) }
  }, [])
  /** Rotate around the middle of these atoms' extent (3Dmol's `center`, which moves the pivot, not just the view). */
  const centreOn = React.useCallback((nrs: number[], label: string) => {
    const ks = nrs.flatMap(n => index.get(n) ?? [])
    if (!viewer || !main.current || !ks.length) return
    viewer.center({ model: main.current, index: ks } as never, 400)
    setCentre({ label, count: nrs.length })
  }, [viewer, index])
  const click = React.useRef((_nr: number) => {})
  React.useEffect(() => {
    click.current = nr => { const g = groupOf(nr); const a = byNr.get(nr); if (g) centreOn(g.atoms, g.name); else centreOn([nr], 'atom ' + nr + (a ? ' (' + a.name + ')' : '')) }
  }, [groupOf, centreOn, byNr])
  React.useEffect(() => { if (centreRequest) centreOn(centreRequest.atoms, centreRequest.label) }, [centreRequest]) // eslint-disable-line react-hooks/exhaustive-deps -- once per request
  const resetCentre = () => { viewer?.center({}, 400); setCentre(null) }

  React.useEffect(() => {
    let alive = true, v: GLViewer | null = null
    const el = box.current
    import('3dmol').then($3Dmol => {
      if (!alive || !el) return
      v = $3Dmol.createViewer(el, { backgroundColor: cssVar('--card') })
      main.current = v.addModel(pdb, 'pdb', { keepH: true })
      v.setHoverDuration(60)
      v.setHoverable({}, true, (a: { index: number }) => setHover(numbers[a.index]), () => setHover(null))
      v.setClickable({}, true, (a: { index: number }, _v: unknown, e: MouseEvent) => (cDown.current ? click.current(numbers[a.index]) : pick.current(numbers[a.index], e?.shiftKey ? 'residue' : e?.altKey ? 'name' : 'atom')))
      v.zoomTo()
      setViewer(v)
    })
    return () => { alive = false; v?.clear(); main.current = null; halo.current = null; if (el) el.innerHTML = ''; setViewer(null); setCentre(null) }
  }, [pdb, numbers])

  React.useEffect(() => {
    const m = main.current
    if (!viewer || !m) return
    viewer.setBackgroundColor(cssVar('--card'), 1)
    m.setStyle({}, {})
    // By group hue the rest is drawn in a neutral grey, so a group's hue never hides among element colours (oxygen red vs coral).
    const hues = colourBy === 'group' && colour.size > 0, rest = hues ? cssVar('--input') : null
    for (const [sel, st] of drawn(info, style, solvent).styles) m.setStyle(sel as never, (rest ? neutral(st, rest) : st) as never)
    if (!hydrogens) m.setStyle({ elem: 'H' } as never, {} as never)
    const byTone = new Map<Tone | 'reference', number[]>()
    // A group's strong hue; the reference in ink (T159).
    const ink = (t: Tone | 'reference') => cssVar(t === 'reference' ? '--foreground' : '--' + t + '-strong')
    for (const [nr, tone] of colour) { const k = index.get(nr); if (k != null) { if (!byTone.has(tone)) byTone.set(tone, []); byTone.get(tone)!.push(k) } }
    // Group atoms are drawn in the look itself and always shown (hydrogens and water included): in their hue, or by element.
    for (const [tone, ks] of byTone) m.setStyle({ index: ks } as never, groupStyle(look, hues ? ink(tone) : undefined) as never)
    // By element, a group is a halo in its hue round its atoms: a second model, made when first needed and never clickable.
    if (!hues && byTone.size && !halo.current) halo.current = viewer.addModel(pdb, 'pdb', { keepH: true })
    if (halo.current) {
      halo.current.setStyle({}, {})
      if (!hues) for (const [tone, ks] of byTone) halo.current.setStyle({ index: ks } as never, haloStyle(look, ink(tone)) as never)
    }
    viewer.render()
  }, [viewer, pdb, info, style, look, solvent, hydrogens, colour, colourBy, index, theme])

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
        <DisplayMenu summary={style + ' · ' + (colourBy === 'element' ? 'element colours' : 'group hues')}>
          <StyleRow value={style} onChange={setStyle} />
          <DisplayRow label="colours">
            <ToggleGroup type="single" size="sm" value={colourBy} onValueChange={v => v && setColourBy(v as ColourBy)} aria-label="colours">
              <ToggleGroupItem value="element" aria-label="element colours, groups as halos">element colours</ToggleGroupItem>
              <ToggleGroupItem value="group" aria-label="group hues, the rest grey">group hues</ToggleGroupItem>
            </ToggleGroup>
          </DisplayRow>
          <DisplayRow label="show">
            <label className="flex items-center gap-2 text-control"><Checkbox checked={hydrogens} onCheckedChange={c => setHydrogens(c === true)} /> hydrogens</label>
            <label className="flex items-center gap-2 text-control"><Checkbox checked={solvent} onCheckedChange={c => setSolvent(c === true)} /> water & ions</label>
            <label className="flex items-center gap-2 text-control"><Checkbox checked={showCell && !!cell.vectors} disabled={!cell.vectors} onCheckedChange={c => setShowCell(c === true)} /> box <Kbd>B</Kbd></label>
          </DisplayRow>
        </DisplayMenu>
      </div>
      <p className="m-0 text-caption text-muted-foreground">
        {info.atoms} of {atoms.length} atoms drawn{virtual ? ' · ' + virtual + ' virtual sites not drawn' : ''}{unknown.length ? ' · ' + unknown.length + ' not drawn, element unknown (' + unknown.slice(0, 3).join(', ') + ')' : ''}
        {drawn(info, style, solvent).note && ' · ' + drawn(info, style, solvent).note}
      </p>
      <p className="m-0 text-caption text-muted-foreground" aria-live="polite">
        {cell.vectors && dims ? <>box of the structure file · a {dims.a.toFixed(2)} · b {dims.b.toFixed(2)} · c {dims.c.toFixed(2)} nm · α {degrees(dims.alpha)}° β {degrees(dims.beta)}° γ {degrees(dims.gamma)}° · V {dims.volume.toFixed(3)} nm³</> : 'no box: ' + cell.problems.join(' ')}
      </p>
      {cell.vectors && (outside?.count
        ? <Status level="info" why="A molecule that crosses an edge looks broken: that is periodicity, not an error. gmx works with the box as recorded.">{outside.count} of {outside.total} atoms lie outside the box, as recorded</Status>
        : <p className="m-0 text-caption text-muted-foreground">a molecule that crosses an edge looks broken: that is periodicity, not an error</p>)}
      {colour.size > 0 && <p className="m-0 text-caption text-muted-foreground">{colourBy === 'element' ? 'group atoms keep their element colours and carry a halo in their group’s hue' : 'group atoms are drawn in their group’s hue, the rest in grey'}</p>}
      <p className="m-0 flex flex-wrap items-center gap-x-3 text-caption text-muted-foreground" aria-live="polite">
        <span>{centre ? <>rotating around <b className="text-foreground">{centre.label}</b>{centre.count > 1 ? ' · ' + centre.count + ' atoms' : ''}</> : 'rotating around the middle of the structure'}</span>
        {centre && <button type="button" className="rounded text-caption text-foreground underline underline-offset-2 hover:no-underline" onClick={resetCentre}>reset</button>}
      </p>
      {/* B toggles the box while the 3D view has focus (a click in it gives it focus), as section 9.2 asks: a control and a key. */}
      <div className={'relative h-[460px] overflow-hidden rounded-xl border border-border bg-card focus-visible:outline-2 focus-visible:outline-ring' + (cHeld ? ' cursor-crosshair' : '')} tabIndex={0} role="group" aria-label="3D view · B shows or hides the box"
        onKeyDown={e => { if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey && !e.altKey && cell.vectors) { e.preventDefault(); setShowCell(v => !v) } }}>
        <div ref={box} className="absolute inset-0" role="img" aria-label="3D structure: atoms can also be picked by rule or as a list" />
        {h && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-border bg-popover px-3 py-2 text-caption shadow-menu" aria-live="polite">
            <b>atom {h.nr}</b> · {h.name} · {h.resn} {h.resi} · {h.elem}{describe(h.nr) && <> · {describe(h.nr)}</>}
            {cHeld && <div className="mt-1 text-muted-foreground">click: rotate around {groupOf(h.nr)?.name ?? 'this atom'}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
