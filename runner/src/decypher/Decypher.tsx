// (de)Cypher: RDFs of several jobs at once, each with the structure its groups are atoms of, side by side or on
// one graph, from gmx-cypher's own jobs, from the Matrix's vault (with the row's structure), or from files.
// The RDF Explorer design (v3) in Morpheus, as gmx-cypher's own view; it opens from the jobs tab or with a key.

import * as React from 'react'
import { ChevronLeft, ChevronRight, Download, RefreshCw, X } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogHeading, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Field, FieldHint, Label } from '../ui/label'
import { Section } from '../ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { getJson, postJson } from '../api'
import { jobLine, statusOf, type Job } from '../jobs'
import { cn } from '../lib/utils'
import type { Analysis, Curve, Mol, Palette, Struct, Tone } from './kit'
import { ChartPanel, CurveTable, GroupChips, StructurePanel, Swatch, type StructureHandle } from './panels'
import type { LoadedFile } from './parse'
import { useAnalyses, type Item } from './sources'
import { activeMorphs, joinMorph, pickGroup, refKey, setMorphRefs, splitMorph, useView, type ActiveMorph, type DecypherSources, type SourceRef, type View } from './state'
import { kit, PALETTES, TOKENS_BY_THEME, usePageTheme } from './theme'
import type { VaultRdfs } from './vaultTypes'
import { cardsOf, cardTitle, DEFAULT_HEADER, download, exportData, exportHtml, exportName, fontData } from './export'

const pad = (n: number) => String(n).padStart(2, '0')
const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many)
const WANTED = /\.(gro|pdb|ndx|xvg|json)$/i
const NO_MORPHS: ActiveMorph[] = []

/** A toggle chip: an ink fill when on (UI state, T159), its state also in weight and in aria-pressed. */
function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button type="button" aria-pressed={on} title={title} onClick={onClick}
      className={cn('h-[26px] whitespace-nowrap rounded-full border px-3 text-caption transition-colors duration-[120ms]', on ? 'border-state bg-state font-bold text-state-foreground' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground')}>
      {children}
    </button>
  )
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-label uppercase text-muted-foreground">{label}</span>
      <ToggleGroup type="single" size="sm" value={value} onValueChange={v => v && onChange(v as T)} aria-label={label.toLowerCase()}>
        {options.map(o => <ToggleGroupItem key={o} value={o}>{o}</ToggleGroupItem>)}
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

/** Files and folders dropped or picked: every gro, pdb, ndx, xvg and run.json in them, with its path inside a dropped folder. */
async function readDrop(dt: DataTransfer): Promise<LoadedFile[]> {
  const walk = (e: FileSystemEntry, prefix: string): Promise<{ path: string; file: File }[]> => new Promise(resolve => {
    if (e.isFile) { if (!WANTED.test(e.name)) return resolve([]); (e as FileSystemFileEntry).file(f => resolve([{ path: prefix + e.name, file: f }]), () => resolve([])); return }
    if (!e.isDirectory || e.name.startsWith('.')) return resolve([])
    const reader = (e as FileSystemDirectoryEntry).createReader(), kids: FileSystemEntry[] = []
    const next = () => reader.readEntries(ents => { if (ents.length) { kids.push(...ents); next(); return } Promise.all(kids.map(k => walk(k, prefix + e.name + '/'))).then(p => resolve(p.flat())) }, () => resolve([]))
    next()
  })
  const ents = Array.from(dt.items || []).map(it => it.webkitGetAsEntry()).filter((e): e is FileSystemEntry => !!e)
  const list = ents.length ? (await Promise.all(ents.map(e => walk(e, '')))).flat() : Array.from(dt.files).filter(f => WANTED.test(f.name)).map(f => ({ path: f.name, file: f }))
  return Promise.all(list.filter(x => x.file.size < 80e6).map(async x => ({ path: x.path, text: await x.file.text() })))
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
}

/** One analysis: its structure beside its g(r), its groups as chips, its curves with their highest points. Morphed: one card for RDFs that differ only in their reference, which one picks, atom or chip, one, the other or both. */
function AnalysisCard({ members, on, tone, mol, pal, view, selected, tones, candidates, onMorph, onSplit, onRefs, onSelect, handle, onActive }: CardProps) {
  const a = members[0], many = members.length > 1
  const [hover, setHover] = React.useState<string | null>(null), [hot, setHot] = React.useState<string | null>(null)
  const ref = React.useRef<StructureHandle | null>(null)
  const ids = React.useMemo(() => members.map(m => m.id), [members]), names = React.useMemo(() => kit.refLabels(members), [members])
  const curves = React.useMemo(() => kit.buildCurves({ focus: a, plotted: members, selected, colorBy: 'group', pal, tones })
    .filter(c => on.includes(c.analysis))
    .map(c => {
      const m = members.find(x => x.id === c.analysis)!
      return { ...c, source: m.ref ? 'ref ' + names[m.id] : names[m.id], hot: c.key === hot, dim: hot ? c.key !== hot : !!hover && c.name !== hover && selected.includes(hover) }
    }), [a, members, names, on, selected, pal, tones, hover, hot])
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
  return (
    <section aria-label={title} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card" onMouseEnter={onActive}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
        <span className="size-2 shrink-0 rounded-full" style={{ background: pal.hues[tone].strong }} />
        <h3 className="m-0 text-heading font-bold">{title}</h3>
        <span className="text-caption text-muted-foreground">{many ? plural(members.length, 'RDF') + ' · the same groups, one chart' : a.sub}</span>
        <span className="flex-1" />
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
        {!many && <span className="max-w-[36ch] truncate text-caption text-muted-foreground" title={a.structNote}>{a.structNote}</span>}
        {mol && <><Button variant="outline" size="sm" onClick={() => ref.current?.fit()}>fit selection</Button><Button variant="ghost" size="sm" onClick={() => ref.current?.reset()}>reset view</Button></>}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))]">
        <StructurePanel ref={h => { ref.current = h; handle(h) }} className="min-h-[480px] border-r border-border" mol={mol} pal={pal} view={view} sels={a.sels} selected={idx} refs={refs} hoverSel={hoverSel}
          onPick={(i, add) => onSelect(pickGroup(selected, a.sels[i].name, add))} onPickRef={pickRef} onActive={onActive}
          empty={<><span className="text-heading font-bold">No structure</span><span className="max-w-[40ch] text-caption text-muted-foreground">{a.structNote}</span></>} />
        <div className="flex min-w-0 flex-col gap-3 p-4">
          <ChartPanel className="h-[300px] flex-none" curves={curves} grid={a.x} xlabel={a.xlabel} ylabel={a.ylabel} pal={pal} peaks={view.peaks}
            empty={curves.length ? null : { title: 'Pick an atom group', hint: 'Click atoms in the structure or a chip below. ⌘-click adds more groups to the plot.' }} />
          <Section label={'Groups ' + pad(a.sels.length) + ' · plotted ' + pad(idx.length)}>
            <Button variant="ghost" size="sm" onClick={() => onSelect(a.sels.map(g => g.name))}>all</Button>
            <Button variant="ghost" size="sm" onClick={() => onSelect([])}>none</Button>
          </Section>
          <GroupChips refs={chipRefs} sels={a.sels} selected={selected} pal={pal} dim={selected.length > 0 && view.rest !== 'tinted'} hover={hover}
            onPick={(n, add) => onSelect(pickGroup(selected, n, add))} onPickRef={pickChip} onHover={setHover} />
          <CurveTable curves={curves} source={many} onRemove={n => onSelect(selected.filter(x => x !== n))} onHover={c => { setHot(c?.key ?? null); setHover(c?.name ?? null) }} />
        </div>
      </div>
    </section>
  )
}

/** Every shown analysis on one graph, led by one whose structure and groups are shown beside it. */
function CompareView({ shown, focus, setFocus, mols, pal, view, patch, selected, onSelect, tones, handle, onActive }: {
  shown: Analysis[]; focus: Analysis; setFocus: (id: string) => void; mols: Map<string, Mol | null>; pal: Palette; view: View; patch: ReturnType<typeof useView>[1]
  selected: string[]; onSelect: (n: string[]) => void; tones: Record<string, Tone>; handle: (h: StructureHandle | null) => void; onActive: () => void
}) {
  const [hover, setHover] = React.useState<string | null>(null), [hot, setHot] = React.useState<string | null>(null)
  const ref = React.useRef<StructureHandle | null>(null)
  const plotted = React.useMemo(() => [focus, ...shown.filter(a => a !== focus)], [focus, shown])
  const curves: Curve[] = React.useMemo(() => kit.buildCurves({ focus, plotted, selected, colorBy: view.colorBy, pal, tones })
    .map(c => ({ ...c, hot: c.key === hot, dim: hot ? c.key !== hot : !!hover && c.name !== hover && selected.includes(hover) })), [focus, plotted, selected, view.colorBy, pal, tones, hover, hot])
  const idx = React.useMemo(() => focus.sels.flatMap((g, i) => (selected.includes(g.name) ? [i] : [])), [focus, selected])
  // The focus's reference, and the references of the others on the same structure, dashed.
  const refs = React.useMemo(() => plotted.filter((a, i) => a.ref && (i === 0 || (a.struct && a.struct === focus.struct)))
    .map((a, i) => ({ label: i === 0 ? a.ref!.name : a.ref!.name + ' · ' + a.label, atoms: a.ref!.atoms })), [plotted, focus])
  // Plotted groups an RDF has no match for: said, not left to look like a curve that is missing.
  const unmatched = React.useMemo(() => plotted.slice(1).map(an => ({ an, names: selected.filter(n => { const g = focus.sels.find(x => x.name === n); return !!g && !kit.matchGroup(g, an, focus) }) })).filter(u => u.names.length), [plotted, selected, focus])
  const i = shown.indexOf(focus), step = (d: number) => setFocus(shown[(i + d + shown.length) % shown.length].id)
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
          <span className="text-caption text-muted-foreground">{shown.length > 1 ? (i + 1) + '/' + shown.length + ' · [ ] step' : ''}</span>
          <span className="flex-1" />
          {mols.get(focus.struct ?? '') && <><Button variant="outline" size="sm" onClick={() => ref.current?.fit()}>fit selection</Button><Button variant="ghost" size="sm" onClick={() => ref.current?.reset()}>reset view</Button></>}
        </div>
        <StructurePanel ref={h => { ref.current = h; handle(h) }} className="flex-1" mol={mols.get(focus.struct ?? '') ?? null} pal={pal} view={view} sels={focus.sels} selected={idx} refs={refs}
          hoverSel={hover ? focus.sels.findIndex(g => g.name === hover) : -1} onPick={(k, add) => onSelect(pickGroup(selected, focus.sels[k].name, add))} onActive={onActive}
          empty={<><span className="text-heading font-bold">No structure</span><span className="max-w-[40ch] text-caption text-muted-foreground">{focus.structNote}</span></>} />
        <div className="flex flex-col gap-2.5 border-t border-border px-4 pb-4 pt-3">
          <Section label={'Groups ' + pad(focus.sels.length) + ' · plotted ' + pad(idx.length)}>
            <Button variant="ghost" size="sm" onClick={() => onSelect(focus.sels.map(g => g.name))}>all</Button>
            <Button variant="ghost" size="sm" onClick={() => onSelect([])}>none</Button>
          </Section>
          <GroupChips refs={refs.map((r, k) => ({ label: r.label, count: r.atoms.length, dashed: k > 0 }))} sels={focus.sels} selected={selected} pal={pal} dim={selected.length > 0 && view.rest !== 'tinted'} hover={hover}
            onPick={(n, add) => onSelect(pickGroup(selected, n, add))} onHover={setHover} />
        </div>
      </section>
      <section aria-label="one graph" className="flex min-w-0 flex-col rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-2">
          <span className="text-label uppercase text-muted-foreground">One graph · {plural(plotted.length, 'RDF')}</span>
          {plotted.map((a, k) => (
            <span key={a.id} className="inline-flex items-center gap-1.5 text-caption" title={a.title}>
              <Swatch color={view.colorBy === 'job' ? pal.hues[tones[a.id] ?? 'coral'].strong : pal.fg} dash={view.colorBy === 'job' ? 'none' : kit.DASH[k % kit.DASH.length]} />
              <span className={k === 0 ? 'font-bold' : ''}>{a.label}</span>
            </span>
          ))}
          <span className="flex-1" />
          <Seg label="color by" value={view.colorBy} options={['group', 'job'] as const} onChange={v => patch({ colorBy: v })} />
        </div>
        <ChartPanel className="mx-4 mb-1.5 mt-3.5 flex-1" curves={curves} grid={focus.x} xlabel={focus.xlabel} ylabel={focus.ylabel} pal={pal} peaks={view.peaks}
          empty={curves.length ? null : { title: 'Pick an atom group', hint: 'Each group you pick is drawn for every job that has it: the same atoms of the same structure, else the same name.' }} />
        <div className="border-t border-border px-4 pb-3.5 pt-2.5">
          <CurveTable curves={curves} onRemove={n => onSelect(selected.filter(x => x !== n))} onHover={c => { setHot(c?.key ?? null); setHover(c?.name ?? null) }} />
          {unmatched.map(u => <p key={u.an.id} className="m-0 text-caption text-butter-strong">{u.an.label}: no group to match {u.names.join(', ')} · groups are matched by their atoms, then their name (case, punctuation and a trailing "…x" ignored), then their place in a list as long</p>)}
          {!curves.length && <p className="m-0 text-caption text-muted-foreground">{view.colorBy === 'group' ? 'by group: each group its hue, each job its dash' : 'by job: each job its hue, each group its dash'}</p>}
        </div>
      </section>
    </div>
  )
}

interface FoundRun { path: string; stem: string; frames: number | null; groups: number; reference: string | null; structure: string | null; ended: string | null }

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
        <Input size="sm" aria-label="folder to look in" value={root} onChange={e => setRoot(e.target.value)} onKeyDown={e => e.key === 'Enter' && root.trim() && find()} />
        <Button variant="outline" size="sm" className="h-8" onClick={find} disabled={!root.trim() || busy}>{busy ? 'looking…' : 'find'}</Button>
      </div>
      <p className="m-0 text-caption text-muted-foreground">every RDF record (.run.json) under this folder, newest first, with the structure each ran on</p>
      {found && 'error' in found && <p className="m-0 text-caption text-destructive">✗ {found.error}</p>}
      {found && 'runs' in found && (found.runs.length
        ? <div className="flex flex-col">{found.runs.map(r => row({ kind: 'record', path: r.path }, r.stem, [r.frames != null ? r.frames + ' frames' : null, r.reference ? 'ref ' + r.reference : null, plural(Math.max(0, r.groups - 1), 'group'), rel(r.path, found.root).split('/').slice(0, -1).join('/') || null].filter(Boolean).join(' · ')))}</div>
        : <p className="m-0 text-caption text-muted-foreground">no RDF records under {found.root}</p>)}
      {found && 'runs' in found && found.more && <p className="m-0 text-caption text-butter-strong">the first {found.runs.length} only · look in a folder further down</p>}
      {found && 'runs' in found && found.unread.length > 0 && <p className="m-0 text-caption text-muted-foreground">couldn't look into {found.unread.length === 1 ? found.unread[0] : plural(found.unread.length, 'folder')}</p>}
    </div>
  )
}

/** Where the picked sources come from: this gmx-cypher's RDF jobs, runs on disk, the Matrix's vault, or files. */
function AddPanel({ sources, jobs, allow, vaultPath, vault, loadVault, fileRows, onFiles, onClearFiles }: {
  sources: DecypherSources; jobs: Job[]; allow: string[]; vaultPath: string | null; vault: { list?: VaultRdfs; error?: string } | null; loadVault: () => void
  fileRows: { path: string; kind: string; status: string; error: boolean }[]; onFiles: (f: LoadedFile[]) => void; onClearFiles: () => void
}) {
  const [tab, setTab] = React.useState<'jobs' | 'runs' | 'vault' | 'files'>('jobs')
  const input = React.useRef<HTMLInputElement>(null)
  const rdfJobs = jobs.filter(j => j.kind === 'rdf')
  const row = (ref: SourceRef, title: string, sub: React.ReactNode, disabled = false) => {
    const id = 'add-' + refKey(ref).replace(/[^\w-]/g, '_')
    return (
      <div key={refKey(ref)} className="flex items-start gap-2.5 rounded-sm px-2 py-1.5 hover:bg-accent">
        <Checkbox id={id} className="mt-[3px]" checked={sources.has(ref)} disabled={disabled} onCheckedChange={() => sources.toggle(ref)} />
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
        <ToggleGroupItem value="jobs">jobs</ToggleGroupItem><ToggleGroupItem value="runs">runs</ToggleGroupItem><ToggleGroupItem value="vault">vault</ToggleGroupItem><ToggleGroupItem value="files">files</ToggleGroupItem>
      </ToggleGroup>
      {tab === 'jobs' && (rdfJobs.length
        ? <div className="flex flex-col">{rdfJobs.map(j => row({ kind: 'job', id: j.id }, j.title, <><span className={statusOf(j).className}>{statusOf(j).word}</span> · {jobLine(j)}</>, j.status === 'failed' || j.status === 'cancelled' || j.status === 'interrupted'))}</div>
        : <p className="m-0 text-caption text-muted-foreground">no RDF jobs yet · run gmx rdf from the analysis tab</p>)}
      {tab === 'runs' && <RunsTab allow={allow} row={row} />}
      {tab === 'vault' && (!vaultPath
        ? <p className="m-0 text-caption text-muted-foreground">no vault set · choose the Matrix vault in settings, then its RDFs come here with each row's structure</p>
        : !vault ? <p className="m-0 text-caption text-muted-foreground" aria-live="polite">reading the vault…</p>
        : vault?.error ? <div className="flex flex-col gap-1.5"><p className="m-0 text-caption text-destructive">✗ {vault.error}</p><Button variant="outline" size="sm" className="w-fit" onClick={loadVault}><RefreshCw /> try again</Button></div>
        : vault?.list && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-caption text-muted-foreground">vault · {vault.list.path.split('/').pop()}</span><Button variant="ghost" size="sm" onClick={loadVault}><RefreshCw /> refresh</Button></div>
            {!vault.list.projects.length && <p className="m-0 text-caption text-muted-foreground">no RDF analyses in this vault yet</p>}
            {vault.list.projects.map(p => (
              <div key={p.id} className="flex flex-col gap-0.5">
                <span className="text-label uppercase text-muted-foreground">{p.name}</span>
                {p.rows.map(r => r.rdfs.map(a => row({ kind: 'vault', project: p.id, row: r.id, rdf: a.id }, r.name + ' × ' + a.column + ' · run ' + a.slot,
                  plural(a.curves.length, 'curve') + ' · ' + (a.run ? '✓ groups from ' + a.run.title.split(' · ')[0] : 'no atom groups') + ' · ' + (r.structures.map(s => s.name).join(', ') || 'no structure in the row'))))}
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
          <p className="m-0 text-caption text-muted-foreground">or drop gro, pdb, ndx, xvg and run.json files, or a folder of them, anywhere here · read in this browser, never kept</p>
          {fileRows.map(f => (
            <div key={f.path} className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2">
              <Badge tone={({ gro: 'stone', ndx: 'sky', xvg: 'coral', run: 'lilac', file: 'stone' } as Record<string, Tone>)[f.kind]} className="justify-self-start">{f.kind === 'run' ? 'run.json' : f.kind}</Badge>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-control">{f.path}</span>
                <span className={cn('truncate text-caption', f.error ? 'text-destructive' : 'text-muted-foreground')}>{f.status}</span>
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
    view: { rep: view.rep, rest: view.rest, labels: view.labels, hydrogens: view.hydrogens, arrange: view.arrange },
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
      setDone('✓ exported ' + file)
    } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-decypher-export="">
        <DialogHeader>
          <DialogHeading>
            <DialogTitle>Export</DialogTitle>
            <DialogDescription>one html file · opens in any browser, offline · each job stays interactive</DialogDescription>
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
            <Input id="export-name" size="sm" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
            <FieldHint>{data ? '≈ ' + (size / 1024 > 1024 ? (size / 1048576).toFixed(1) + ' MB' : Math.round(size / 1024) + ' kB') + ' · mononoki and the data inside · opens in ' + theme + ', with a light/dark switch' : 'pick a job to export'}</FieldHint>
          </Field>
        </DialogBody>
        <DialogFooter>
          {done && <span className="mr-auto text-caption text-mint-strong" aria-live="polite">{done}</span>}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>close</Button>
          <Button onClick={go} disabled={!data || busy}>{busy ? 'exporting…' : '+ Export html'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function Decypher({ open, onOpenChange, sources, jobs, jobsLoaded, allow, vaultPath, version, keyName }: {
  open: boolean; onOpenChange: (o: boolean) => void; sources: DecypherSources; jobs: Job[]; jobsLoaded: boolean; allow: string[]; vaultPath: string | null; version: string; keyName: string | null
}) {
  const [view, patch] = useView()
  const theme = usePageTheme(), pal = PALETTES[theme]
  const [files, setFiles] = React.useState<LoadedFile[]>([])
  // The vault's list, for the vault set now: one read at a time, kept until asked again.
  const [vaultRead, setVaultRead] = React.useState<{ path: string; list?: VaultRdfs; error?: string } | null>(null)
  const vault = vaultRead && vaultRead.path === vaultPath ? vaultRead : null
  const [drag, setDrag] = React.useState(false), [exporting, setExporting] = React.useState(0), [exportOpen, setExportOpen] = React.useState(false)
  const handles = React.useRef(new Map<string, StructureHandle | null>()), active = React.useRef<string | null>(null), reading = React.useRef(false)
  const loadVault = React.useCallback(() => {
    if (!vaultPath || reading.current) return
    reading.current = true
    getJson<VaultRdfs>('/api/decypher/vault').then(list => setVaultRead({ path: vaultPath, list }), e => setVaultRead({ path: vaultPath, error: (e as Error).message })).finally(() => { reading.current = false })
  }, [vaultPath])
  const needVault = open && !!vaultPath && sources.refs.some(r => r.kind === 'vault')
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
      return { lead, members, on: m ? m.on : [lead.id], candidates: shown.filter(b => !members.includes(b)).map(b => ({ a: b, why: kit.morphWhy(lead, b) })) }
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
        molCache.set(sig, kit.buildMol(structs[key], sel, ref, view.arrange))
      }
      out.set(key, molCache.get(sig)!)
    }
    return out
  }, [ready, structs, view.arrange, molCache])

  const selectedOf = React.useCallback((a: Analysis) => view.selected[a.id] ?? (a.sels[0] ? [a.sels[0].name] : []), [view.selected])
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

  const onKey = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName) || (e.target as HTMLElement).closest('[role=listbox],[data-decypher-export]')) return
    const h = active.current ? handles.current.get(active.current) : null
    if (e.key === 'f' || e.key === 'F') h?.fit()
    else if (e.key === 'r' || e.key === 'R') h?.reset()
    else if (view.mode === 'one' && focus && shown.length > 1 && (e.key === '[' || e.key === ']')) setFocus(shown[(shown.indexOf(focus) + (e.key === ']' ? 1 : -1) + shown.length) % shown.length].id)
  }
  const files_ = (f: LoadedFile[]) => f.length && setFiles(old => [...old.filter(o => !f.some(n => n.path === o.path)), ...f])
  const loading = items.filter(i => i.status === 'loading').length
  const subtitle = !items.length ? 'RDFs of several jobs at once, with their structures' : [plural(ready.length, 'RDF'), plural(new Set(ready.map(a => a.struct).filter(Boolean)).size, 'structure'), loading ? 'reading ' + loading + '…' : null, shown.length < ready.length ? (ready.length - shown.length) + ' hidden' : null].filter(Boolean).join(' · ')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-decypher="" showCloseButton={false} onKeyDown={onKey} aria-describedby="decypher-sub"
        className="left-0 top-0 h-screen max-h-none w-screen max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 bg-background shadow-none"
        onDragOver={e => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); if (!drag) setDrag(true) } }}
        onDragLeave={e => { if (e.currentTarget === e.target) setDrag(false) }}
        onDrop={async e => { if (!Array.from(e.dataTransfer.types).includes('Files')) return; e.preventDefault(); setDrag(false); files_(await readDrop(e.dataTransfer)) }}>
        <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 py-2.5">
          <div className="flex min-w-0 flex-col">
            <DialogTitle className="text-heading">(de)Cypher</DialogTitle>
            <DialogDescription id="decypher-sub" className="tracking-normal">{subtitle}</DialogDescription>
          </div>
          <span className="flex-1" />
          <Seg label="show" value={view.mode === 'each' ? 'each job' : 'one graph'} options={['each job', 'one graph'] as const} onChange={v => patch({ mode: v === 'each job' ? 'each' : 'one' })} />
          <Button variant="outline" size="sm" onClick={() => { setExporting(n => n + 1); setExportOpen(true) }} disabled={!shown.length}><Download /> export</Button>
          {keyName && <span className="text-caption text-muted-foreground">{keyName} closes</span>}
          <DialogClose asChild><Button variant="ghost" size="icon-sm" aria-label="close (de)Cypher"><X /></Button></DialogClose>
        </header>
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 py-2">
          <Seg label="style" value={view.rep} options={kit.REPS} onChange={v => patch({ rep: v })} />
          <Seg label="not plotted" value={view.rest} options={kit.RESTS} onChange={v => patch({ rest: v })} />
          <Seg label="molecules" value={view.arrange} options={['side by side', 'frame positions'] as const} onChange={v => patch({ arrange: v })} />
          <span className="flex-1" />
          <div className="flex flex-wrap gap-1.5">
            <Chip on={view.labels} onClick={() => patch({ labels: !view.labels })}>labels</Chip>
            <Chip on={view.hydrogens} onClick={() => patch({ hydrogens: !view.hydrogens })}>hydrogens</Chip>
            <Chip on={view.peaks} onClick={() => patch({ peaks: !view.peaks })}>peaks</Chip>
            {view.mode === 'each' && <Chip on={view.link} onClick={() => patch({ link: !view.link })} title="a group picked in one job is picked in every job that has it">link groups</Chip>}
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col gap-4 overflow-auto border-r border-border p-4" aria-label="sources">
            <div className="flex flex-col gap-1">
              <Section label={'Sources ' + pad(items.length)}>
                {items.length > 0 && <Button variant="ghost" size="sm" onClick={() => patch({ hidden: [] })} disabled={!view.hidden.length}>show all</Button>}
              </Section>
              {!items.length && <p className="m-0 text-caption text-muted-foreground">nothing picked yet · tick RDF jobs below or in the jobs tab</p>}
              {items.map(it => <SourceRow key={it.key} it={it} tone={tones[it.analysis?.id ?? it.key]} pal={pal} hidden={!!it.analysis && view.hidden.includes(it.analysis.id)}
                onShow={on => it.analysis && patch(v => ({ hidden: on ? v.hidden.filter(x => x !== it.analysis!.id) : [...v.hidden, it.analysis!.id] }))}
                onRemove={it.kind === 'file' ? undefined : () => sources.remove(it.key)}
                focus={view.mode === 'one' && !!focus && it.analysis?.id === focus.id} />)}
            </div>
            <AddPanel sources={sources} jobs={jobs} allow={allow} vaultPath={vaultPath} vault={vault} loadVault={loadVault} fileRows={fileRows} onFiles={files_} onClearFiles={() => setFiles([])} />
          </aside>
          <div role="region" aria-label="analyses" className="min-h-0 overflow-auto p-5">
            {!items.length ? (
              <div className="mx-auto mt-10 flex max-w-[620px] flex-col gap-4 rounded-2xl border-2 border-dashed border-input bg-card p-10">
                <span className="text-display font-bold">Nothing to decipher yet</span>
                <span className="max-w-[62ch] text-prose text-muted-foreground">Pick RDFs on the left: your gmx-cypher jobs, the RDFs of the Matrix vault (each with its row's structure), or files dropped here. Several at once are shown side by side, or compared on one graph.</span>
                <span className="text-caption text-muted-foreground">{keyName ? keyName + ' opens and closes (de)Cypher · ' : ''}change the key in settings · F fits the plotted groups · R resets the view</span>
              </div>
            ) : !shown.length ? (
              <p className="m-0 text-control text-muted-foreground">{ready.length ? 'every RDF is hidden · tick one on the left' : 'reading…'}</p>
            ) : view.mode === 'each' ? (
              <div className="flex flex-col gap-4">
                {cards.map(({ lead: a, members, on, candidates }) => <AnalysisCard key={a.id} members={members} on={on} candidates={candidates} tone={tones[a.id]} mol={a.struct ? mols.get(a.struct) ?? null : null} pal={pal} view={view} selected={selectedOf(a)} tones={tones}
                  onMorph={id => patch(v => ({ morphed: joinMorph(v.morphed, a.id, id) }))} onSplit={() => patch(v => ({ morphed: splitMorph(v.morphed, a.id) }))} onRefs={next => patch(v => ({ morphed: setMorphRefs(v.morphed, a.id, next) }))}
                  onSelect={n => select(a, n)} handle={h => handles.current.set(a.id, h)} onActive={() => { active.current = a.id }} />)}
              </div>
            ) : focus && (
              <CompareView shown={shown} focus={focus} setFocus={setFocus} mols={mols} pal={pal} view={view} patch={patch} selected={selectedOf(focus)} onSelect={n => select(focus, n)} tones={tones}
                handle={h => handles.current.set('one', h)} onActive={() => { active.current = 'one' }} />
            )}
          </div>
        </div>
        {drag && (
          <div className="pointer-events-none fixed inset-3 z-50 flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-ring bg-secondary/90">
            <span className="text-display font-bold">Drop files or a folder</span>
            <span className="text-control text-muted-foreground">gro, pdb, ndx, xvg and run.json · each .xvg finds its record, index and structure</span>
          </div>
        )}
        <ExportDialog key={exporting} open={exportOpen} onOpenChange={setExportOpen} analyses={shown} structs={structs} view={view} theme={theme} tones={tones} selectedOf={selectedOf} morphs={view.mode === 'each' ? morphs : NO_MORPHS} version={version}
          compare={focus ? { ids: [focus.id, ...shown.filter(a => a !== focus).map(a => a.id)], focus: focus.id, selected: selectedOf(focus) } : null} />
      </DialogContent>
    </Dialog>
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
        <span className={cn('truncate text-caption', it.status === 'error' ? 'text-destructive' : it.status === 'waiting' ? 'text-butter-strong' : 'text-muted-foreground')} title={line}>
          {it.status === 'error' ? '✗ ' : ''}{it.kind}{line ? ' · ' + line.replace(/^(job|files|vault) · /, '') : ''}
        </span>
      </label>
      {onRemove && <button type="button" aria-label={'remove ' + (a?.title ?? it.name)} onClick={onRemove} className="grid size-[22px] shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">×</button>}
    </div>
  )
}
