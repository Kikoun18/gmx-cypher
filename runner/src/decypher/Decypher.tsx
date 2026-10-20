// (de)Cypher: results of several jobs at once (RDFs first, any command's since R10a), each with the structure its groups are atoms of, side by side or on
// one graph, from gmx-cypher's own jobs, from the Matrix's vault (with the row's structure), or from files.
// The RDF Explorer design (v3) in Morpheus, as gmx-cypher's own view: compare, in the results' detail pane at
// #compare?jobs=… (R9a), opened from the jobs list, a result, or with a key.

import * as React from 'react'
import { ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogHeading, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Field, FieldHint, Label } from '../ui/label'
import { Section } from '../ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { getJson, postJson } from '../api'
import type { Job } from '../jobs'
import { Status } from '../ui/status'
import { cn } from '../lib/utils'
import type { Analysis, Curve, LineStyle, Marks, Mol, Palette, Pins, Rep, Struct, Tone } from '../core/kit'
import type { KeyAction, Style } from '../core/contract'
import { isKey, keyLabel, pressed, useBindings } from '../lib/shortcuts'
import { modName } from '../lib/platform'
import { DisplayMenu, DisplayRow, StyleRow } from '../ui/display-menu'
import { ResultPage } from '../ui/result-page'
import { ChartPanel, ExportMenu, Swatch, type ChartExport } from '../core/Chart'
import { curvesCsv } from '../lib/csv'
import { unlike } from '../core/cards'
import { download as downloadBlob, renderBatch } from '../../../matrix/src/lib/export'
import { graphData } from '../core/export'
import { fileName, useExportPrefs } from '../core/exportPrefs'
import { fileBase } from '../../../matrix/src/lib/exportPrefs'
import { CurveTable, GroupChips, StructurePanel, type StructureHandle } from './panels'
import type { LoadedFile } from './parse'
import { useAnalyses, type Item } from './sources'
import { pickGroups } from '../core/gestures'
import { activeMorphs, joinMorph, refKey, setMorphRefs, splitMorph, useView, type ActiveMorph, type DecypherSources, type SourceRef, type View } from './state'
import { kit, PALETTES, TOKENS_BY_THEME, usePageTheme } from '../core/theme'
import type { VaultRdfs } from './vaultTypes'
import { cardsOf, cardTitle, DEFAULT_HEADER, download, exportData, exportHtml, exportName, fontData } from './export'

const pad = (n: number) => String(n).padStart(2, '0')
const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many)
const WANTED = /\.(gro|pdb|ndx|xvg|json)$/i
const NO_MORPHS: ActiveMorph[] = []
/** What compare's renderer can't draw of the one set of styles, and why (question 17). */
export const CANNOT: Partial<Record<Style, string>> = { lines: 'compare draws every atom, so no bonds alone', cartoon: 'compare reads no secondary structure, so no ribbon' }
const MARKS: readonly Marks[] = ['both', 'maximum', 'first shell', 'none']

/** How an analysis's chart is drawn: an RDF from zero with g = 1 and its peak marks; any other result as its plot says (R10a). */
const chartOf = (a: Analysis, marks: Marks) => (a.plot ? { y: a.plot.y, rule: a.plot.rule, xDigits: a.plot.xDigits, marks: 'none' as Marks } : { marks, xDigits: 3 })
type Share = { x?: [number, number]; y?: [number, number] }
const SCALE_WORDS = ['off', 'x', 'y', 'x and y'] as const
const SCALE_WORD: Record<View['scale'], (typeof SCALE_WORDS)[number]> = { own: 'off', x: 'x', y: 'y', both: 'x and y' }
const SCALE_OF = { off: 'own', x: 'x', y: 'y', 'x and y': 'both' } as const
/** Each card's ranges shared with the others (R11a), from the curves it draws, by its lead's id. */
function cardShares(cards: { lead: Analysis; members: Analysis[]; on: string[] }[], selectedOf: (a: Analysis) => string[], pal: Palette, tones: Record<string, Tone>, view: View): Record<string, Share> {
  if (view.scale === 'own') return {}
  return kit.sharedScales(cards.map(c => ({ id: c.lead.id, xlabel: c.lead.xlabel, ylabel: c.lead.ylabel,
    curves: kit.buildCurves({ focus: c.lead, plotted: c.members, selected: selectedOf(c.lead), colorBy: 'group', pal, tones }).filter(x => c.on.includes(x.analysis)) })), view.scale, view.ownScale)
}

/** The peak marks a chart draws (R3d), in the chart's header (R9b): the maximum filled, the first shell hollow. */
function MarksSelect({ value, onChange }: { value: Marks; onChange: (m: Marks) => void }) {
  return (
    <Select value={value} onValueChange={v => onChange(v as Marks)}>
      <SelectTrigger size="sm" className="h-7 gap-1.5 border-transparent bg-transparent px-2" aria-label="marks" title="● maximum · ○ first shell"><span className="text-muted-foreground">marks</span><SelectValue /></SelectTrigger>
      <SelectContent>{MARKS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
    </Select>
  )
}

/** A toggle chip: an ink fill when on (UI state, T159), its state also in weight and in aria-pressed. */
function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button type="button" aria-pressed={on} title={title} onClick={onClick}
      className={cn('h-[26px] whitespace-nowrap rounded-full border px-3 text-caption transition-colors duration-[120ms]', on ? 'border-state bg-state font-bold text-state-foreground' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground')}>
      {children}
    </button>
  )
}

function Seg<T extends string>({ label, value, options, onChange, labels }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; labels?: Partial<Record<T, string>> }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-label uppercase text-muted-foreground">{label}</span>
      <ToggleGroup type="single" size="sm" value={value} onValueChange={v => v && onChange(v as T)} aria-label={label.toLowerCase()}>
        {options.map(o => <ToggleGroupItem key={o} value={o}>{labels?.[o] ?? o}</ToggleGroupItem>)}
      </ToggleGroup>
    </div>
  )
}

/** The same groups in another analysis: by atoms of the same structure, else by name, else by place. */
function remap(from: Analysis | undefined, to: Analysis, names: string[]): string[] {
  const out: string[] = []
  for (const nm of names) {
    const g = from?.sels.find(s => s.name === nm), t = g && from ? kit.matchGroup(g, to, from) : to.sels.find(s => s.name === nm)
    if (t && !out.includes(t.name)) out.push(t.name)
  }
  return out
}

interface CardProps {
  /** One RDF, or several that differ only in their reference (morphed): the first leads. */
  members: Analysis[]
  /** The members whose reference is plotted. */
  on: string[]
  tone: Tone; mol: Mol | null; pal: Palette; view: View; selected: string[]; tones: Record<string, Tone>
  /** The other RDFs shown, with why one can't join this card (null: it can): they have the groups this card's lead has. */
  candidates: { a: Analysis; why: string | null }[]
  onMorph: (id: string) => void; onSplit: () => void; onRefs: (on: string[]) => void
  onSelect: (names: string[]) => void; handle: (h: StructureHandle | null) => void; onActive: () => void
  /** The 3D view's display menu and the chart's marks, the same on every card (R9b). */
  display: React.ReactNode; marks: React.ReactNode
  /** While charts share a scale (R11a): this one's ranges, whether it is reset to its own, and the switch. */
  scale?: { share?: Share; own: boolean; toggle: () => void }
  /** Setting a curve's style of its own (R11b). */
  onStyle?: (key: string, s: LineStyle | null) => void
  /** Its chart's marks and lines (R11c), kept with the view. */
  pins?: Pins; onPins?: (p: Pins) => void
}

/** A structure view's picture as a PNG file (R6a). */
async function savePng(h: StructureHandle | null, label: string) {
  const blob = await h?.png()
  if (blob) downloadBlob(blob, fileBase(label + '_structure') + '.png')
}

/** One analysis: its structure beside its g(r), its groups as chips, its curves with their highest points. Morphed: one card for RDFs that differ only in their reference, which one picks, atom or chip, one, the other or both. */
export function AnalysisCard({ members, on, tone, mol, pal, view, selected, tones, candidates, onMorph, onSplit, onRefs, onSelect, handle, onActive, display, marks, scale, onStyle, pins, onPins }: CardProps) {
  const a = members[0], many = members.length > 1
  const [hover, setHover] = React.useState<string | null>(null), [hot, setHot] = React.useState<string | null>(null)
  const ref = React.useRef<StructureHandle | null>(null)
  const ids = React.useMemo(() => members.map(m => m.id), [members]), names = React.useMemo(() => kit.refLabels(members), [members])
  const curves = React.useMemo(() => kit.buildCurves({ focus: a, plotted: members, selected, colorBy: 'group', pal, tones })
    .filter(c => on.includes(c.analysis))
    .map(c => {
      const m = members.find(x => x.id === c.analysis)!
      return { ...c, source: m.ref ? 'ref ' + names[m.id] : names[m.id], hot: c.key === hot, dim: hot ? c.key !== hot : !!hover && c.name !== hover && selected.includes(hover) }
    }).map(c => kit.styleCurves([c], view.styles, pal)[0]), [a, members, names, on, selected, pal, tones, hover, hot, view.styles])
  const idx = React.useMemo(() => a.sels.flatMap((g, i) => (selected.includes(g.name) ? [i] : [])), [a, selected])
  // Only references on this card's structure can be drawn on it; every RDF of a morph has its chip.
  const onStruct = React.useMemo(() => members.filter(m => m.ref && m.struct === a.struct), [members, a])
  const refs = React.useMemo(() => onStruct.map(m => ({ label: names[m.id], atoms: m.ref!.atoms, on: on.includes(m.id) })), [onStruct, names, on])
  const chipRefs = React.useMemo(() => (many ? members.map((m, k) => ({ label: names[m.id], count: m.ref ? m.ref.atoms.length : 0, dashed: k > 0, on: on.includes(m.id), plain: !m.ref }))
    : refs.map((r, k) => ({ label: r.label, count: r.atoms.length, dashed: k > 0, on: r.on, plain: false }))), [many, members, names, on, refs])
  const pickRef = many ? (i: number, add: boolean) => onRefs(kit.pickRefs(ids, on, onStruct[i].id, add)) : undefined
  const pickChip = many ? (i: number, add: boolean) => onRefs(kit.pickRefs(ids, on, members[i].id, add)) : undefined
  const hoverSel = hover ? a.sels.findIndex(g => g.name === hover) : -1
  const title = cardTitle(members)
  // The chart's export (R6a): the curves in the export theme's palette; its CSV, each curve named with its source.
  const curvesIn = (p: Palette) => kit.styleCurves(kit.buildCurves({ focus: a, plotted: members, selected, colorBy: 'group', pal: p, tones }).filter(c => on.includes(c.analysis)).map(c => { const m = members.find(x => x.id === c.analysis)!; return { ...c, source: many ? (m.ref ? 'ref ' + names[m.id] : names[m.id]) : '' } }), view.styles, p)
  // A result of a command without atom groups (energy, AWH, WHAM) is its chart alone; an RDF keeps its structure, atoms known or not.
  const rdf = !a.plot, chartOnly = !rdf && !a.ref && a.sels.every(g => !g.atoms.length)
  // Values painted on the structure (R10b, RMSF): a point of the chart rings its atom (or its residue's atoms), an atom moves the chart's readout to its x.
  const paint = React.useMemo(() => kit.paintOf(a, mol), [a, mol])
  const keyOf = (nr: number) => (a.paint?.by === 'residue' && mol ? mol.resnr[mol.g2l[nr]] : nr)
  const [atomX, setAtomX] = React.useState<number | null>(null), [chartX, setChartX] = React.useState<number | null>(null)
  const ring = React.useMemo(() => (paint && chartX != null ? [...paint.values.keys()].filter(nr => keyOf(nr) === chartX) : undefined), [paint, chartX]) // eslint-disable-line react-hooks/exhaustive-deps -- keyOf reads a and mol, as paint does
  // What else the structure shows (R10c, R10d): H-bond pairs, the lines of the plotted groups, the fit group.
  const note = kit.structureNote(a, mol)
  const lines = React.useMemo(() => a.lines?.filter(l => selected.includes(l.group)).map(l => ({ line: l, tone: a.sels.find(g => g.name === l.group)?.tone ?? tone })), [a, selected, tone])
  const fit = React.useMemo(() => (a.fit ? { label: a.fit.name, atoms: a.fit.atoms } : undefined), [a])
  const exp: ChartExport = { file: a.label, fields: { command: a.command ?? 'rdf' }, title, csv: () => curvesCsv(curvesIn(pal).map(c => ({ ...c, name: c.source ? c.name + ' · ' + c.source : c.name })), a.xlabel, a.ylabel) }
  // One result page's order (R9b): its actions, its structure beside its chart, its settings and groups, where it came from.
  return (
    <section aria-label={title} className="flex flex-col rounded-xl border border-border bg-card" onMouseEnter={onActive}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
        <span className="size-2 shrink-0 rounded-full" style={{ background: pal.hues[tone].strong }} />
        <h3 className="m-0 text-heading font-bold">{title}</h3>
        {many && <span className="text-caption text-muted-foreground">{plural(members.length, 'RDF') + ' · the same groups, one chart'}</span>}
      </div>
      <ResultPage className="p-4" summary="Provenance · structure"
        actions={(candidates.length > 0 || many) && <>
          {candidates.length > 0 && (
            <Select value="" onValueChange={onMorph}>
              <SelectTrigger size="sm" className="w-40" aria-label={'morph ' + (many ? title : a.label) + ' with another RDF'} title="show RDFs with the same groups as one card; those that can't are greyed, with the reason"><SelectValue placeholder="morph with…" /></SelectTrigger>
              <SelectContent>
                {candidates.map(({ a: p, why }) => (
                  <SelectItem key={p.id} value={p.id} disabled={!!why}>
                    <span className="flex flex-col"><span>{p.label}{p.ref ? ' · ref ' + p.ref.name : ''}</span>{why && <span className="text-caption text-muted-foreground">{why}</span>}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {many && <Button variant="outline" size="sm" onClick={onSplit} title="show each RDF as its own card again">split</Button>}
        </>}
        charts={<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-4">
          {!chartOnly && <div className="flex min-w-0 flex-col rounded-lg border border-border">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
              {display}<span className="flex-1" />
              {mol && <><Button variant="outline" size="sm" onClick={() => ref.current?.fit()}>fit selection</Button><Button variant="ghost" size="sm" onClick={() => ref.current?.reset()}>reset view</Button><Button variant="ghost" size="sm" onClick={() => void savePng(ref.current, a.label)} title="the structure as drawn now, as a PNG">png</Button></>}
            </div>
            <StructurePanel ref={h => { ref.current = h; handle(h) }} className="min-h-[420px]" mol={mol} pal={pal} view={view} sels={a.sels} selected={idx} refs={refs} hoverSel={hoverSel}
              paint={paint} ring={ring} onAtom={paint ? nr => setAtomX(nr != null && paint.values.has(nr) ? keyOf(nr) : null) : undefined} pairs={a.pairs?.drawn} lines={lines} fit={fit}
              onPick={(is, add) => onSelect(pickGroups(selected, is.map(i => a.sels[i].name), add))} onPickRef={pickRef} onActive={onActive}
              empty={<><span className="text-heading font-bold">No structure</span><span className="max-w-[40ch] text-caption text-muted-foreground">{a.structNote}</span></>} />
            {note && <p className="m-0 border-t border-border px-3 py-2 text-caption text-muted-foreground">{note}</p>}
          </div>}
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-end gap-1">
              {scale && <Button variant="ghost" size="sm" onClick={scale.toggle} title={scale.own ? 'back to the scale the other charts share' : 'this chart on its own scale'}>{scale.own ? 'same scale' : 'own scale'}</Button>}
              {rdf && marks}{curves.length > 0 && <ExportMenu exp={exp} curves={curvesIn} xlabel={a.xlabel} ylabel={a.ylabel} {...chartOf(a, view.marks)} share={scale?.share} pins={pins} />}
            </div>
            <ChartPanel className="h-[300px] flex-none" curves={curves} grid={a.x} xlabel={a.xlabel} ylabel={a.ylabel} pal={pal} {...chartOf(a, view.marks)} share={scale?.share} pins={pins} onPins={onPins} at={atomX} onAt={paint ? setChartX : undefined}
              empty={curves.length ? null : rdf ? { title: 'Pick an atom group', hint: 'Click atoms in the structure or a chip below. ' + modName() + '-click adds more groups to the plot.' } : { title: 'Pick a curve', hint: 'Click a chip below. ' + modName() + '-click adds more.' }} />
            <CurveTable curves={curves} source={many} stats={rdf ? 'peaks' : 'series'} onRemove={n => onSelect(selected.filter(x => x !== n))} onHover={c => { setHot(c?.key ?? null); setHover(c?.name ?? null) }} styles={view.styles} onStyle={onStyle} />
          </div>
        </div>}
        settings={<>
          {!many && <p className="m-0 text-caption text-muted-foreground">{a.sub}</p>}
          <Section label={(chartOnly ? 'Curves ' : 'Groups ') + pad(a.sels.length) + ' · plotted ' + pad(idx.length)}>
            <Button variant="ghost" size="sm" onClick={() => onSelect(a.sels.map(g => g.name))}>all</Button>
            <Button variant="ghost" size="sm" onClick={() => onSelect([])}>none</Button>
          </Section>
          <GroupChips refs={chipRefs} sels={a.sels} selected={selected} pal={pal} dim={selected.length > 0 && view.rest !== 'tinted'} hover={hover}
            onShown={onSelect} onPickRef={pickChip} onHover={setHover} />
        </>}
        provenance={members.map(m => <p key={m.id} className="m-0 text-caption text-muted-foreground">{many ? m.label + ' · ' : ''}{m.structNote}</p>)} />
    </section>
  )
}

/** Every shown analysis on one graph, led by one whose structure and groups are shown beside it. */
function CompareView({ shown, focus, setFocus, mols, pal, view, patch, selected, onSelect, tones, handle, onActive, display, marks }: {
  shown: Analysis[]; focus: Analysis; setFocus: (id: string) => void; mols: Map<string, Mol | null>; pal: Palette; view: View; patch: ReturnType<typeof useView>[1]
  selected: string[]; onSelect: (n: string[]) => void; tones: Record<string, Tone>; handle: (h: StructureHandle | null) => void; onActive: () => void
  display: React.ReactNode; marks: React.ReactNode
}) {
  const [hover, setHover] = React.useState<string | null>(null), [hot, setHot] = React.useState<string | null>(null)
  const ref = React.useRef<StructureHandle | null>(null), [bindings] = useBindings()
  // Only like quantities share the graph (R10a): the others are named, with the reason.
  const refused = React.useMemo(() => shown.flatMap(a => { const why = a === focus ? null : unlike(focus, a); return why ? [{ a, why }] : [] }), [shown, focus])
  const plotted = React.useMemo(() => [focus, ...shown.filter(a => a !== focus && !refused.some(r => r.a === a))], [focus, shown, refused])
  const curves: Curve[] = React.useMemo(() => kit.buildCurves({ focus, plotted, selected, colorBy: view.colorBy, pal, tones })
    .map(c => ({ ...c, hot: c.key === hot, dim: hot ? c.key !== hot : !!hover && c.name !== hover && selected.includes(hover) })).map(c => kit.styleCurves([c], view.styles, pal)[0]), [focus, plotted, selected, view.colorBy, view.styles, pal, tones, hover, hot])
  const idx = React.useMemo(() => focus.sels.flatMap((g, i) => (selected.includes(g.name) ? [i] : [])), [focus, selected])
  // The focus's reference, and the references of the others on the same structure, dashed.
  const refs = React.useMemo(() => plotted.filter((a, i) => a.ref && (i === 0 || (a.struct && a.struct === focus.struct)))
    .map((a, i) => ({ label: i === 0 ? a.ref!.name : a.ref!.name + ' · ' + a.label, atoms: a.ref!.atoms })), [plotted, focus])
  // Plotted groups an RDF has no match for: said, not left to look like a curve that is missing.
  const unmatched = React.useMemo(() => plotted.slice(1).map(an => ({ an, names: selected.filter(n => { const g = focus.sels.find(x => x.name === n); return !!g && !kit.matchGroup(g, an, focus) }) })).filter(u => u.names.length), [plotted, selected, focus])
  const i = shown.indexOf(focus), step = (d: number) => setFocus(shown[(i + d + shown.length) % shown.length].id)
  // One graph's export (R6a): every curve, named with its RDF, in the export theme's palette.
  const curvesIn = (p: Palette) => kit.styleCurves(kit.buildCurves({ focus, plotted, selected, colorBy: view.colorBy, pal: p, tones }), view.styles, p)
  const exp: ChartExport = { file: 'one-graph_' + plotted.length + '-results', fields: { command: focus.command ?? 'rdf' }, title: 'One graph · ' + plural(plotted.length, 'result'), csv: () => curvesCsv(curvesIn(pal).map(c => ({ ...c, name: c.name + ' · ' + c.source })), focus.xlabel, focus.ylabel) }
  return (
    <div className="grid min-h-[660px] grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))] gap-4">
      <section aria-label="structure" className="flex min-w-0 flex-col rounded-xl border border-border bg-card" onMouseEnter={onActive}>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <span className="text-label uppercase text-muted-foreground">Structure of</span>
          {shown.length > 1 && <Button variant="ghost" size="icon-sm" aria-label="previous job" onClick={() => step(-1)}><ChevronLeft /></Button>}
          <Select value={focus.id} onValueChange={setFocus}>
            <SelectTrigger size="sm" className="max-w-[300px] font-bold" aria-label="job whose structure and groups lead"><span className="size-2 shrink-0 rounded-full" style={{ background: pal.hues[tones[focus.id] ?? 'coral'].strong }} /><SelectValue /></SelectTrigger>
            <SelectContent>{shown.map(a => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
          </Select>
          {shown.length > 1 && <Button variant="ghost" size="icon-sm" aria-label="next job" onClick={() => step(1)}><ChevronRight /></Button>}
          <span className="text-caption text-muted-foreground">{shown.length > 1 ? (i + 1) + '/' + shown.length + ' · ' + keyLabel(bindings.prev) + ' ' + keyLabel(bindings.next) + ' step' : ''}</span>
          {display}
          <span className="flex-1" />
          {mols.get(focus.struct ?? '') && <><Button variant="outline" size="sm" onClick={() => ref.current?.fit()}>fit selection</Button><Button variant="ghost" size="sm" onClick={() => ref.current?.reset()}>reset view</Button><Button variant="ghost" size="sm" onClick={() => void savePng(ref.current, focus.label)} title="the structure as drawn now, as a PNG">png</Button></>}
        </div>
        <StructurePanel ref={h => { ref.current = h; handle(h) }} className="flex-1" mol={mols.get(focus.struct ?? '') ?? null} pal={pal} view={view} sels={focus.sels} selected={idx} refs={refs}
          hoverSel={hover ? focus.sels.findIndex(g => g.name === hover) : -1} onPick={(ks, add) => onSelect(pickGroups(selected, ks.map(k => focus.sels[k].name), add))} onActive={onActive}
          empty={<><span className="text-heading font-bold">No structure</span><span className="max-w-[40ch] text-caption text-muted-foreground">{focus.structNote}</span></>} />
        <div className="flex flex-col gap-2.5 border-t border-border px-4 pb-4 pt-3">
          <Section label={'Groups ' + pad(focus.sels.length) + ' · plotted ' + pad(idx.length)}>
            <Button variant="ghost" size="sm" onClick={() => onSelect(focus.sels.map(g => g.name))}>all</Button>
            <Button variant="ghost" size="sm" onClick={() => onSelect([])}>none</Button>
          </Section>
          <GroupChips refs={refs.map((r, k) => ({ label: r.label, count: r.atoms.length, dashed: k > 0 }))} sels={focus.sels} selected={selected} pal={pal} dim={selected.length > 0 && view.rest !== 'tinted'} hover={hover}
            onShown={onSelect} onHover={setHover} />
        </div>
      </section>
      <section aria-label="one graph" className="flex min-w-0 flex-col rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-2">
          <span className="text-label uppercase text-muted-foreground">One graph · {plural(plotted.length, 'result')}</span>
          {kit.rdfLooks(plotted, tones, idx.length).map((look, k) => { const a = plotted[k]; return (
            <span key={a.id} className="inline-flex items-center gap-1.5 text-caption" title={a.title}>
              <Swatch color={view.colorBy === 'job' ? pal.hues[look.tone].strong : look.round ? pal.muted : pal.fg} dash={kit.DASH[(view.colorBy === 'job' ? look.jobDash : look.groupDash) % kit.DASH.length]} />
              <span className={k === 0 ? 'font-bold' : ''}>{a.label}</span>
            </span>
          ) })}
          <span className="flex-1" />
          <Seg label="color by" value={view.colorBy} options={['group', 'job'] as const} labels={{ job: 'result' }} onChange={v => patch({ colorBy: v })} />
          {!focus.plot && marks}
          {curves.length > 0 && <ExportMenu exp={exp} curves={curvesIn} xlabel={focus.xlabel} ylabel={focus.ylabel} {...chartOf(focus, view.marks)} pins={view.pins.one} />}
        </div>
        <ChartPanel className="mx-4 mb-1.5 mt-3.5 flex-1" curves={curves} grid={focus.x} xlabel={focus.xlabel} ylabel={focus.ylabel} pal={pal} {...chartOf(focus, view.marks)} pins={view.pins.one} onPins={p => patch(v => ({ pins: { ...v.pins, one: p } }))}
          empty={curves.length ? null : { title: 'Pick an atom group', hint: 'Each group you pick is drawn for every result that has it: the same atoms of the same structure, else the same name.' }} />
        <div className="border-t border-border px-4 pb-3.5 pt-2.5">
          <CurveTable curves={curves} stats={focus.plot ? 'series' : 'peaks'} onRemove={n => onSelect(selected.filter(x => x !== n))} onHover={c => { setHot(c?.key ?? null); setHover(c?.name ?? null) }}
            styles={view.styles} onStyle={(key, s) => patch(v => { const { [key]: _, ...rest } = v.styles; return { styles: s ? { ...rest, [key]: s } : rest } })} />
          {refused.map(r => <Status key={r.a.id} level="info">{r.why}</Status>)}
          {unmatched.map(u => <Status key={u.an.id} level="warning" why={'Groups are matched by their atoms, then their name (case, punctuation and a trailing "…x" ignored), then their place in a list as long.'}>{u.an.label}: no group to match {u.names.join(', ')}</Status>)}
          {!curves.length && <p className="m-0 text-caption text-muted-foreground">{view.colorBy === 'group' ? 'by group: each group its hue, each result its dash' : 'by result: each result its hue, each group its dash'}</p>}
        </div>
      </section>
    </div>
  )
}

interface FoundRun { path: string; stem: string; analysis: string; frames: number | null; groups: number; reference: string | null; structure: string | null; ended: string | null }

/** RDF runs gmx-cypher wrote before, found by their records under a folder: another home's, another machine's. */
function RunsTab({ allow, row }: { allow: string[]; row: (ref: SourceRef, title: string, sub: React.ReactNode) => React.ReactNode }) {
  const [root, setRoot] = React.useState(allow[0] ?? '')
  const [found, setFound] = React.useState<{ root: string; runs: FoundRun[]; more: boolean; unread: string[] } | { error: string } | null>(null), [busy, setBusy] = React.useState(false)
  const find = async () => {
    setBusy(true)
    try { setFound({ root, ...(await postJson<{ runs: FoundRun[]; more: boolean; unread: string[] }>('/api/decypher/runs', { root })) }) } catch (e) { setFound({ error: (e as Error).message }) } finally { setBusy(false) }
  }
  if (!allow.length) return <p className="m-0 text-caption text-muted-foreground">no allowed folders · add the folders with your simulations in settings</p>
  const rel = (p: string, from: string) => (p.startsWith(from + '/') ? p.slice(from.length + 1) : p)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input size="sm" aria-label="folder to look in" value={root} onChange={e => setRoot(e.target.value)} onKeyDown={e => pressed(e, 'enter') && root.trim() && find()} />
        <Button variant="outline" size="sm" className="h-8" onClick={find} disabled={!root.trim() || busy}>{busy ? 'looking…' : 'find'}</Button>
      </div>
      <p className="m-0 text-caption text-muted-foreground">every record (.run.json) under this folder, of any command, newest first, with the structure each ran on</p>
      {found && 'error' in found && <Status level="error">{found.error}</Status>}
      {found && 'runs' in found && (found.runs.length
        ? <div className="flex flex-col">{found.runs.map(r => row({ kind: 'record', path: r.path }, r.stem, ['gmx ' + r.analysis, r.frames != null ? r.frames + ' frames' : null, r.reference ? 'ref ' + r.reference : null, plural(Math.max(0, r.groups - 1), 'group'), rel(r.path, found.root).split('/').slice(0, -1).join('/') || null].filter(Boolean).join(' · ')))}</div>
        : <p className="m-0 text-caption text-muted-foreground">no records under {found.root}</p>)}
      {found && 'runs' in found && found.more && <Status level="info">the first {found.runs.length} only · look in a folder further down</Status>}
      {found && 'runs' in found && found.unread.length > 0 && <p className="m-0 text-caption text-muted-foreground">couldn't look into {found.unread.length === 1 ? found.unread[0] : plural(found.unread.length, 'folder')}</p>}
    </div>
  )
}

/** Where the picked sources come from: this gmx-cypher's jobs, records on disk, the Matrix's vault (its RDFs), or files. */
function AddPanel({ sources, allow, vaultPath, vault, loadVault, fileRows, onFiles, onClearFiles }: {
  sources: DecypherSources; allow: string[]; vaultPath: string | null; vault: { list?: VaultRdfs; error?: string } | null; loadVault: () => void
  fileRows: { path: string; kind: string; status: string; error: boolean }[]; onFiles: (f: LoadedFile[]) => void; onClearFiles: () => void
}) {
  // Jobs are picked in the jobs list beside compare; here, what is not a job.
  const [tab, setTab] = React.useState<'runs' | 'vault' | 'files'>('runs')
  const input = React.useRef<HTMLInputElement>(null)
  const row = (ref: SourceRef, title: string, sub: React.ReactNode) => {
    const id = 'add-' + refKey(ref).replace(/[^\w-]/g, '_')
    return (
      <div key={refKey(ref)} className="flex items-start gap-2.5 rounded-sm px-2 py-1.5 hover:bg-accent">
        <Checkbox id={id} className="mt-[3px]" checked={sources.has(ref)} onCheckedChange={() => sources.toggle(ref)} />
        <label htmlFor={id} className="flex min-w-0 flex-col">
          <span className="truncate text-control">{title}</span>
          <span className="truncate text-caption text-muted-foreground">{sub}</span>
        </label>
      </div>
    )
  }
  return (
    <div className="flex min-h-0 flex-col gap-2.5">
      <Section label="Add" />
      <ToggleGroup type="single" size="sm" value={tab} onValueChange={v => { if (!v) return; setTab(v as typeof tab); if (v === 'vault' && !vault) loadVault() }} aria-label="add from">
        <ToggleGroupItem value="runs">on disk</ToggleGroupItem><ToggleGroupItem value="vault">vault</ToggleGroupItem><ToggleGroupItem value="files">files</ToggleGroupItem>
      </ToggleGroup>
      {tab === 'runs' && <RunsTab allow={allow} row={row} />}
      {tab === 'vault' && (!vaultPath
        ? <p className="m-0 text-caption text-muted-foreground">no vault set · choose the Matrix vault in settings, then its RDFs come here with each row's structure</p>
        : !vault ? <p className="m-0 text-caption text-muted-foreground" aria-live="polite">reading the vault…</p>
        : vault?.error ? <div className="flex flex-col gap-1.5"><Status level="error">{vault.error}</Status><Button variant="outline" size="sm" className="w-fit" onClick={loadVault}><RefreshCw /> try again</Button></div>
        : vault?.list && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-caption text-muted-foreground">vault · {vault.list.path.split('/').pop()}</span><Button variant="ghost" size="sm" onClick={loadVault}><RefreshCw /> refresh</Button></div>
            {!vault.list.projects.length && <p className="m-0 text-caption text-muted-foreground">no RDF analyses in this vault yet</p>}
            {vault.list.projects.map(p => (
              <div key={p.id} className="flex flex-col gap-0.5">
                <span className="text-label uppercase text-muted-foreground">{p.name}</span>
                {p.rows.map(r => r.rdfs.map(a => row({ kind: 'vault', project: p.id, row: r.id, rdf: a.id }, r.name + ' × ' + a.column + ' · run ' + a.slot,
                  <>{plural(a.curves.length, 'curve')} · {a.run ? 'groups from ' + a.run.title.split(' · ')[0] : <Status inline level="warning" word="no atom groups" why="No record of the job that wrote this file: its curves come with their names, but not with their atoms." />} · {r.structures.map(s => s.name).join(', ') || 'no structure in the row'}</>)))}
              </div>
            ))}
          </div>
        ))}
      {tab === 'files' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => input.current?.click()}>+ add files</Button>
            {fileRows.length > 0 && <Button variant="ghost" size="sm" onClick={onClearFiles}>clear files</Button>}
            <input ref={input} type="file" multiple accept=".gro,.pdb,.ndx,.xvg,.json" className="hidden" onChange={async e => {
              const fl = Array.from(e.target.files || []); e.target.value = ''
              onFiles(await Promise.all(fl.filter(f => WANTED.test(f.name)).map(async f => ({ path: f.name, text: await f.text() }))))
            }} />
          </div>
          <p className="m-0 text-caption text-muted-foreground">or drop xvg and run.json files, with their gro, pdb and ndx, or a folder of them, anywhere on the page · read in this browser, never kept</p>
          {fileRows.map(f => (
            <div key={f.path} className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2">
              <Badge tone={({ gro: 'stone', ndx: 'sky', xvg: 'coral', run: 'lilac', file: 'stone' } as Record<string, Tone>)[f.kind]} className="justify-self-start">{f.kind === 'run' ? 'run.json' : f.kind}</Badge>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-control">{f.path}</span>
                {f.error ? <Status inline level="error" className="truncate text-caption">{f.status}</Status> : <span className="truncate text-caption text-muted-foreground">{f.status}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ExportDialog({ open, onOpenChange, analyses, structs, view, theme, tones, selectedOf, compare, morphs, version }: {
  open: boolean; onOpenChange: (o: boolean) => void; analyses: Analysis[]; structs: Record<string, Struct>; view: View; theme: 'light' | 'dark'; tones: Record<string, Tone>
  selectedOf: (a: Analysis) => string[]; compare: { ids: string[]; focus: string; selected: string[] } | null; morphs: ActiveMorph[]; version: string
}) {
  // Made anew each time it opens (its key), so it starts from what is shown then.
  const [chosen, setChosen] = React.useState<Set<string>>(() => new Set(analyses.map(a => a.id)))
  const [structures, setStructures] = React.useState(true), [withCompare, setWithCompare] = React.useState(true)
  const [name, setName] = React.useState(() => exportName(analyses)), [done, setDone] = React.useState(''), [busy, setBusy] = React.useState(false)
  // The headings are the user's: the page's own, and each card's (a card of morphed RDFs is one, named for its first).
  const [header, setHeader] = React.useState(''), [titles, setTitles] = React.useState<Record<string, string>>({})
  const picked = analyses.filter(a => chosen.has(a.id)), pickedKey = picked.map(a => a.id).join()
  const cards = React.useMemo(() => cardsOf(picked, morphs), [pickedKey, morphs]) // eslint-disable-line react-hooks/exhaustive-deps -- picked is what its key says
  const build = (headings: { header?: string; titles?: Record<string, string> }) => exportData({
    analyses: picked, structs, selected: selectedOf, tones, theme, tokens: TOKENS_BY_THEME, structures, by: 'gmx-cypher ' + version, morphs, ...headings,
    compare: withCompare && compare && view.mode === 'one' ? { ...compare, colorBy: view.colorBy } : withCompare && picked.length > 1 ? { ids: picked.map(a => a.id), focus: picked[0].id, selected: selectedOf(picked[0]), colorBy: view.colorBy } : null,
    view: { rep: view.rep, rest: view.rest, labels: view.labels, hydrogens: view.hydrogens, arrange: view.arrange, scale: view.mode === 'each' ? view.scale : 'own', ownScale: view.ownScale, styles: view.styles, pins: view.pins },
  })
  // Built without the headings (they change with every key typed; the size and the button need only this), and again with them on export.
  const data = React.useMemo(() => (open && picked.length ? build({}) : null), [open, pickedKey, structures, withCompare, theme, view, compare, morphs]) // eslint-disable-line react-hooks/exhaustive-deps -- picked is what its key says
  const size = data ? JSON.stringify(data).length + 120_000 : 0
  const go = async () => {
    if (!data) return
    setBusy(true)
    try {
      const file = (name.trim() || exportName(picked)).replace(/\.html?$/i, '') + '.html'
      download(file, exportHtml(build({ header, titles }), await fontData()))
      setDone(file)
    } finally { setBusy(false) }
  }
  // The same RDFs as figures (R6b): each card's chart, then the one graph, laid out as the export settings say (one PDF,
  // a file each, or one grid), in the settings' format, theme and size.
  const [prefs] = useExportPrefs()
  const figures = async () => {
    setBusy(true)
    try {
      const pal = PALETTES[prefs.theme === 'dark' ? 'dark' : 'light'], taken = new Set<string>(), ext = prefs.layout === 'pdf' ? 'pdf' : prefs.format
      // Each card drawn as its chart is: a result that is not an RDF by its own range and rule; the shared y (R11a) kept.
      const shares = view.mode === 'each' ? cardShares(cards, selectedOf, pal, tones, view) : {}
      const fig = (title: string, file: string, a: Analysis, curves: Curve[], share?: Share, pins?: Pins) => ({ data: graphData({ title, file, xlabel: a.xlabel, ylabel: a.ylabel, curves, ...chartOf(a, view.marks), share, pins }, prefs.theme), name: fileName(prefs.name, { file, command: a.command ?? 'rdf' }, ext, taken) })
      const gs = cards.map(c => fig((titles[c.lead.id] ?? '').trim() || cardTitle(c.members), c.lead.label, c.lead,
        kit.styleCurves(kit.buildCurves({ focus: c.lead, plotted: c.members, selected: selectedOf(c.lead), colorBy: 'group', pal, tones }).filter(x => c.on.includes(x.analysis)), view.styles, pal), shares[c.lead.id], view.pins[c.lead.id]))
      if (withCompare && picked.length > 1) {
        const focus = picked.find(a => a.id === compare?.focus) ?? picked[0]
        gs.push(fig('One graph · ' + plural(picked.length, 'RDF'), 'one-graph_' + picked.length + '-RDFs', focus,
          kit.styleCurves(kit.buildCurves({ focus, plotted: [focus, ...picked.filter(a => a !== focus)], selected: compare?.selected ?? selectedOf(focus), colorBy: view.colorBy, pal, tones }), view.styles, pal).map(x => ({ ...x, name: x.name + ' · ' + x.source })), undefined, view.pins.one))
      }
      const out = await renderBatch(gs.filter(g => g.data.series.length), prefs, fileName(prefs.name, { file: (name.trim() || exportName(picked)).replace(/\.html?$/i, ''), command: 'rdf' }, 'x').replace(/\.x$/, ''))
      out.forEach(f => downloadBlob(f.blob, f.name))
      setDone(out.length === 1 ? out[0].name + (out[0].note ? ' · ' + out[0].note : '') : plural(out.length, 'file'))
    } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-decypher-export="">
        <DialogHeader>
          <DialogHeading>
            <DialogTitle>Export</DialogTitle>
            <DialogDescription>one html file · opens in any browser, offline · each result stays interactive · or the charts as figures, laid out as settings → export says</DialogDescription>
          </DialogHeading>
        </DialogHeader>
        <DialogBody>
          <Section label={'RDFs ' + pad(picked.length) + ' of ' + pad(analyses.length)}>
            <Button variant="ghost" size="sm" onClick={() => setChosen(new Set(analyses.map(a => a.id)))}>all</Button>
          </Section>
          <div className="flex max-h-64 flex-col overflow-auto">
            {analyses.map(a => (
              <div key={a.id} className="flex items-start gap-2.5 rounded-sm px-2 py-1.5 hover:bg-accent">
                <Checkbox id={'ex-' + a.id} className="mt-[3px]" checked={chosen.has(a.id)} onCheckedChange={() => setChosen(s => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n })} />
                <label htmlFor={'ex-' + a.id} className="flex min-w-0 flex-col"><span className="truncate text-control">{a.title}</span><span className="truncate text-caption text-muted-foreground">{a.sub} · {plural(selectedOf(a).length, 'group')} plotted</span></label>
              </div>
            ))}
          </div>
          <Section label="Include" />
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2.5 text-control"><Checkbox checked={structures} onCheckedChange={v => setStructures(v === true)} />structures · rotate, zoom, click a group to plot it (solvent left out)</label>
            <label className={cn('flex items-center gap-2.5 text-control', picked.length < 2 && 'opacity-45')}><Checkbox checked={withCompare && picked.length > 1} disabled={picked.length < 2} onCheckedChange={v => setWithCompare(v === true)} />one graph · the groups compared across RDFs, curves shown → dimmed → hidden</label>
          </div>
          <Section label="Headings" />
          <div className="flex flex-col gap-2">
            <Field>
              <Label htmlFor="export-header">page heading</Label>
              <Input id="export-header" size="sm" value={header} placeholder={DEFAULT_HEADER} onChange={e => setHeader(e.target.value)} />
            </Field>
            <div className="flex max-h-48 flex-col gap-2 overflow-auto">
              {cards.map(c => (
                <Field key={c.lead.id}>
                  <Label htmlFor={'export-title-' + c.lead.id}>{c.members.length > 1 ? 'heading of ' + plural(c.members.length, 'morphed RDF') : 'heading of ' + c.lead.label}</Label>
                  <Input id={'export-title-' + c.lead.id} size="sm" value={titles[c.lead.id] ?? ''} placeholder={cardTitle(c.members)} onChange={e => setTitles(t => ({ ...t, [c.lead.id]: e.target.value }))} />
                </Field>
              ))}
            </div>
            <FieldHint>left empty, a heading stays as it is · each is what the exported page shows over that card</FieldHint>
          </div>
          <Field>
            <Label htmlFor="export-name">file name</Label>
            <Input id="export-name" size="sm" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => pressed(e, 'enter') && go()} />
            <FieldHint>{data ? '≈ ' + (size / 1024 > 1024 ? (size / 1048576).toFixed(1) + ' MB' : Math.round(size / 1024) + ' kB') + ' · mononoki and the data inside · opens in ' + theme + ', with a light/dark switch' : 'pick a job to export'}</FieldHint>
          </Field>
        </DialogBody>
        <DialogFooter>
          {done && <Status level="ok" word="exported" className="mr-auto">{done}</Status>}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>close</Button>
          <Button variant="outline" onClick={figures} disabled={!data || busy} title={'each card\'s chart' + (withCompare && picked.length > 1 ? ' and the one graph' : '') + ' as ' + (prefs.layout === 'pdf' ? 'one PDF, a page each' : prefs.layout === 'grid' ? 'one ' + prefs.format + ' grid of ' + prefs.gridCols + ' columns' : 'a ' + prefs.format + ' each') + ' (settings → export)'}>+ Export figures</Button>
          <Button onClick={go} disabled={!data || busy}>{busy ? 'exporting…' : '+ Export html'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function Decypher({ sources, files, onFiles, onClearFiles, jobs, jobsLoaded, allow, vaultPath, version, keyName }: {
  sources: DecypherSources; files: LoadedFile[]; onFiles: (f: LoadedFile[]) => void; onClearFiles: () => void; jobs: Job[]; jobsLoaded: boolean; allow: string[]; vaultPath: string | null; version: string; keyName: string | null
}) {
  const [view, patch] = useView()
  const theme = usePageTheme(), pal = PALETTES[theme]
  // The vault's list, for the vault set now: one read at a time, kept until asked again.
  const [vaultRead, setVaultRead] = React.useState<{ path: string; list?: VaultRdfs; error?: string } | null>(null)
  const vault = vaultRead && vaultRead.path === vaultPath ? vaultRead : null
  const [exporting, setExporting] = React.useState(0), [exportOpen, setExportOpen] = React.useState(false)
  const handles = React.useRef(new Map<string, StructureHandle | null>()), active = React.useRef<string | null>(null), reading = React.useRef(false)
  const loadVault = React.useCallback(() => {
    if (!vaultPath || reading.current) return
    reading.current = true
    getJson<VaultRdfs>('/api/decypher/vault').then(list => setVaultRead({ path: vaultPath, list }), e => setVaultRead({ path: vaultPath, error: (e as Error).message })).finally(() => { reading.current = false })
  }, [vaultPath])
  const needVault = !!vaultPath && sources.refs.some(r => r.kind === 'vault')
  React.useEffect(() => { if (needVault && !vault) loadVault() }, [needVault, vault, loadVault])

  const { items, structs, fileRows } = useAnalyses(sources.refs, jobs, jobsLoaded, vault?.list ?? null, files)
  const ready = React.useMemo(() => items.filter(i => i.analysis).map(i => i.analysis!), [items])
  const tones = React.useMemo(() => Object.fromEntries(items.map((it, i) => [it.analysis?.id ?? it.key, kit.TONES[i % kit.TONES.length]])) as Record<string, Tone>, [items])
  const shown = React.useMemo(() => ready.filter(a => !view.hidden.includes(a.id)), [ready, view.hidden])
  // RDFs morphed into one card, as each job is shown: the card stands where its first RDF would, the others have none.
  const morphs = React.useMemo(() => activeMorphs(view.morphed, shown.map(a => a.id)), [view.morphed, shown])
  const cards = React.useMemo(() => {
    const byId = new Map(shown.map(a => [a.id, a])), joined = new Set(morphs.flatMap(m => m.ids.slice(1)))
    return shown.filter(a => !joined.has(a.id)).map(lead => {
      const m = morphs.find(x => x.ids[0] === lead.id), members = m ? m.ids.map(id => byId.get(id)!) : [lead]
      return { lead, members, on: m ? m.on : [lead.id], candidates: lead.plot ? [] : shown.filter(b => !members.includes(b) && !b.plot).map(b => ({ a: b, why: kit.morphWhy(lead, b) })) }
    })
  }, [shown, morphs])

  // One drawable structure per file and layout, built again only when the analyses on it change.
  const [molCache] = React.useState(() => new Map<string, Mol | null>())
  const mols = React.useMemo(() => {
    const out = new Map<string, Mol | null>()
    for (const key of new Set(ready.map(a => a.struct).filter((k): k is string => !!k && !!structs[k]))) {
      const on = ready.filter(a => a.struct === key), sig = key + '|' + view.arrange + '|' + on.map(a => a.id).sort().join(',')
      if (!molCache.has(sig)) {
        const sel = new Set<number>(), ref = new Set<number>()
        on.forEach(a => { a.sels.forEach(g => g.atoms.forEach(v => sel.add(v))); a.ref?.atoms.forEach(v => ref.add(v)) })
        molCache.set(sig, kit.buildMol(structs[key], sel, ref, view.arrange, on.flatMap(a => a.pairs?.drawn ?? [])))
      }
      out.set(key, molCache.get(sig)!)
    }
    return out
  }, [ready, structs, view.arrange, molCache])

  const selectedOf = React.useCallback((a: Analysis) => view.selected[a.id] ?? (a.sels[0] ? [a.sels[0].name] : []), [view.selected])
  const shares = React.useMemo(() => cardShares(cards, selectedOf, pal, tones, view), [cards, selectedOf, pal, tones, view])
  const setStyle = React.useCallback((key: string, s: LineStyle | null) => patch(v => { const { [key]: _, ...rest } = v.styles; return { styles: s ? { ...rest, [key]: s } : rest } }), [patch])
  const select = (a: Analysis, names: string[]) => patch(v => {
    const next = { ...v.selected, [a.id]: names }
    if (v.link) for (const b of shown) if (b !== a) next[b.id] = remap(a, b, names)
    return { selected: next }
  })
  const focus = shown.find(a => a.id === view.focus) ?? shown[0]
  const setFocus = (id: string) => {
    const to = shown.find(a => a.id === id)
    if (!to || !focus || to === focus) return
    // It keeps the groups picked on it; one never picked on takes the leading one's, matched.
    const names = remap(focus, to, selectedOf(focus))
    patch(v => ({ focus: id, selected: v.selected[id] || !names.length ? v.selected : { ...v.selected, [id]: names } }))
  }

  // Compare's keys (R8b), from the registry: on the structure last pointed at, and the one graph's lead.
  const [bindings] = useBindings()
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('[role=listbox],[data-decypher-export]')) return
    const h = active.current ? handles.current.get(active.current) : null, is = (a: KeyAction) => isKey(bindings, a, e), step = is('next') ? 1 : is('prev') ? -1 : 0
    if (is('fit')) h?.fit()
    else if (is('reset')) h?.reset()
    else if (is('hydrogens')) patch({ hydrogens: !view.hydrogens })
    else if (is('labels')) patch({ labels: !view.labels })
    else if (step && view.mode === 'one' && focus && shown.length > 1) setFocus(shown[(shown.indexOf(focus) + step + shown.length) % shown.length].id)
    else return
    e.preventDefault()
  }
  // How structures are drawn, the same on every 3D view (R9b): the one style menu, the rest, the layout, labels and hydrogens.
  const toggles = <T extends string>(label: string, value: T, options: readonly T[], onChange: (v: T) => void) => (
    <DisplayRow label={label}><ToggleGroup type="single" size="sm" value={value} onValueChange={v => v && onChange(v as T)} aria-label={label}>{options.map(o => <ToggleGroupItem key={o} value={o}>{o}</ToggleGroupItem>)}</ToggleGroup></DisplayRow>
  )
  const display = (
    <DisplayMenu summary={view.rep + ' · ' + view.rest}>
      <StyleRow value={view.rep} onChange={s => patch({ rep: s as Rep })} cannot={CANNOT} />
      {toggles('not plotted', view.rest, kit.RESTS, v => patch({ rest: v }))}
      {toggles('molecules', view.arrange, ['side by side', 'frame positions'] as const, v => patch({ arrange: v }))}
      <DisplayRow label="show">
        <label className="flex items-center gap-2 text-control"><Checkbox checked={view.labels} onCheckedChange={c => patch({ labels: c === true })} /> labels</label>
        <label className="flex items-center gap-2 text-control"><Checkbox checked={view.hydrogens} onCheckedChange={c => patch({ hydrogens: c === true })} /> hydrogens</label>
      </DisplayRow>
    </DisplayMenu>
  )
  const marks = <MarksSelect value={view.marks} onChange={m => patch({ marks: m })} />
  const loading = items.filter(i => i.status === 'loading').length
  const subtitle = !items.length ? 'results of several jobs at once, with their structures' : [plural(ready.length, 'result'), plural(new Set(ready.map(a => a.struct).filter(Boolean)).size, 'structure'), loading ? 'reading ' + loading + '…' : null, shown.length < ready.length ? (ready.length - shown.length) + ' hidden' : null].filter(Boolean).join(' · ')

  return (
    <section data-decypher="" onKeyDown={onKey} aria-labelledby="decypher-title" aria-describedby="decypher-sub" className="flex min-w-0 flex-col rounded-lg border border-border">
        <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 py-2.5">
          <div className="flex min-w-0 flex-col">
            <h2 id="decypher-title" className="m-0 text-heading font-bold">compare</h2>
            <p id="decypher-sub" className="m-0 text-caption text-muted-foreground">{subtitle}</p>
          </div>
          <span className="flex-1" />
          <Seg label="show" value={view.mode === 'each' ? 'each result' : 'one graph'} options={['each result', 'one graph'] as const} onChange={v => patch({ mode: v === 'each result' ? 'each' : 'one' })} />
          {view.mode === 'each' && <Seg label="same scale" value={SCALE_WORD[view.scale]} options={SCALE_WORDS} onChange={w => patch({ scale: SCALE_OF[w] })} />}
          {view.mode === 'each' && <Chip on={view.link} onClick={() => patch({ link: !view.link })} title="a group picked in one result is picked in every result that has it">link groups</Chip>}
          <Button variant="outline" size="sm" onClick={() => { setExporting(n => n + 1); setExportOpen(true) }} disabled={!shown.length}><Download /> export</Button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col gap-4 border-r border-border p-4" aria-label="sources">
            <div className="flex flex-col gap-1">
              <Section label={'Sources ' + pad(items.length)}>
                {items.length > 0 && <Button variant="ghost" size="sm" onClick={() => patch({ hidden: [] })} disabled={!view.hidden.length}>show all</Button>}
              </Section>
              {!items.length && <p className="m-0 text-caption text-muted-foreground">nothing picked yet · tick jobs in the jobs list, or add below</p>}
              {items.map(it => <SourceRow key={it.key} it={it} tone={tones[it.analysis?.id ?? it.key]} pal={pal} hidden={!!it.analysis && view.hidden.includes(it.analysis.id)}
                onShow={on => it.analysis && patch(v => ({ hidden: on ? v.hidden.filter(x => x !== it.analysis!.id) : [...v.hidden, it.analysis!.id] }))}
                onRemove={it.kind === 'file' ? undefined : () => sources.remove(it.key)}
                focus={view.mode === 'one' && !!focus && it.analysis?.id === focus.id} />)}
            </div>
            <AddPanel sources={sources} allow={allow} vaultPath={vaultPath} vault={vault} loadVault={loadVault} fileRows={fileRows} onFiles={onFiles} onClearFiles={onClearFiles} />
          </aside>
          <div role="region" aria-label="analyses" className="min-w-0 p-5">
            {!items.length ? (
              <div className="mx-auto mt-10 flex max-w-[620px] flex-col gap-4 rounded-2xl border-2 border-dashed border-input bg-card p-10">
                <span className="text-display font-bold">Nothing to decipher yet</span>
                <span className="max-w-[62ch] text-prose text-muted-foreground">Tick jobs in the jobs list, of any command, or add the RDFs of the Matrix vault (each with its row's structure), records on disk, or files dropped anywhere on the page. Several at once are shown side by side, or compared on one graph.</span>
                <span className="text-caption text-muted-foreground">{keyName ? keyName + ' opens compare and goes back · ' : ''}{keyLabel(bindings.fit)} fits the plotted groups · {keyLabel(bindings.reset)} resets the view · {keyLabel(bindings.sheet)} lists every key</span>
              </div>
            ) : !shown.length ? (
              <p className="m-0 text-control text-muted-foreground">{ready.length ? 'every RDF is hidden · tick one on the left' : 'reading…'}</p>
            ) : view.mode === 'each' ? (
              <div className="flex flex-col gap-4">
                {cards.map(({ lead: a, members, on, candidates }) => <AnalysisCard key={a.id} members={members} on={on} candidates={candidates} tone={tones[a.id]} mol={a.struct ? mols.get(a.struct) ?? null : null} pal={pal} view={view} selected={selectedOf(a)} tones={tones}
                  onMorph={id => patch(v => ({ morphed: joinMorph(v.morphed, a.id, id) }))} onSplit={() => patch(v => ({ morphed: splitMorph(v.morphed, a.id) }))} onRefs={next => patch(v => ({ morphed: setMorphRefs(v.morphed, a.id, next) }))}
                  onSelect={n => select(a, n)} handle={h => handles.current.set(a.id, h)} onActive={() => { active.current = a.id }} display={display} marks={marks}
                  onStyle={setStyle} pins={view.pins[a.id]} onPins={p => patch(v => ({ pins: { ...v.pins, [a.id]: p } }))} scale={view.scale === 'own' ? undefined : { share: shares[a.id], own: view.ownScale.includes(a.id), toggle: () => patch(v => ({ ownScale: v.ownScale.includes(a.id) ? v.ownScale.filter(x => x !== a.id) : [...v.ownScale, a.id] })) }} />)}
              </div>
            ) : focus && (
              <CompareView shown={shown} focus={focus} setFocus={setFocus} mols={mols} pal={pal} view={view} patch={patch} selected={selectedOf(focus)} onSelect={n => select(focus, n)} tones={tones}
                handle={h => handles.current.set('one', h)} onActive={() => { active.current = 'one' }} display={display} marks={marks} />
            )}
          </div>
        </div>
        <ExportDialog key={exporting} open={exportOpen} onOpenChange={setExportOpen} analyses={shown} structs={structs} view={view} theme={theme} tones={tones} selectedOf={selectedOf} morphs={view.mode === 'each' ? morphs : NO_MORPHS} version={version}
          compare={focus ? { ids: [focus.id, ...shown.filter(a => a !== focus).map(a => a.id)], focus: focus.id, selected: selectedOf(focus) } : null} />
    </section>
  )
}

function SourceRow({ it, tone, pal, hidden, onShow, onRemove, focus }: { it: Item; tone: Tone; pal: Palette; hidden: boolean; onShow: (on: boolean) => void; onRemove?: () => void; focus: boolean }) {
  const a = it.analysis, id = 'src-' + it.key.replace(/[^\w-]/g, '_')
  const line = a ? a.sub : it.status === 'loading' ? 'reading…' : it.error ?? ''
  return (
    <div className={cn('flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-muted', focus && 'bg-muted ring-1 ring-inset ring-border')}>
      <Checkbox id={id} className="mt-[3px]" checked={!!a && !hidden} disabled={!a} onCheckedChange={v => onShow(v === true)} aria-label={'show ' + (a?.title ?? it.name)} />
      <span className="mt-[5px] size-2 shrink-0 rounded-full" style={{ background: pal.hues[tone].strong }} />
      <label htmlFor={id} className="flex min-w-0 flex-1 flex-col">
        <span className={cn('truncate text-control font-bold', hidden && 'font-normal text-muted-foreground')}>{a?.label ?? it.name}</span>
        {it.status === 'error' || it.status === 'waiting'
          ? <Status inline level={it.status === 'error' ? 'error' : 'info'} word={it.kind} className="truncate text-caption">{line.replace(/^(job|files|vault) · /, '')}</Status>
          : <span className="truncate text-caption text-muted-foreground" title={line}>{it.kind}{line ? ' · ' + line.replace(/^(job|files|vault) · /, '') : ''}</span>}
      </label>
      {onRemove && <button type="button" aria-label={'remove ' + (a?.title ?? it.name)} onClick={onRemove} className="grid size-[22px] shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">×</button>}
    </div>
  )
}
