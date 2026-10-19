// What (de)Cypher shows, kept in this browser (a convenience, never data): the jobs and vault RDFs you picked,
// and how you last looked at them. Files from disk are read in the page and not kept.

import * as React from 'react'
import type { ColorBy, Arrange, Marks, Rep, Rest } from '../core/kit'

export type SourceRef =
  | { kind: 'job'; id: string }
  | { kind: 'record'; path: string }
  | { kind: 'vault'; project: string; row: string; rdf: string }

export const refKey = (r: SourceRef) => (r.kind === 'job' ? 'job:' + r.id : r.kind === 'record' ? 'record:' + r.path : 'vault:' + r.project + '/' + r.row + '/' + r.rdf)

const REFS = 'gmx-cypher-decypher-sources', VIEW = 'gmx-cypher-decypher-view'

function load<T>(key: string, check: (v: unknown) => T | null): T | null {
  try { const v = localStorage.getItem(key); return v ? check(JSON.parse(v)) : null } catch { return null }
}
function save(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* a convenience only */ } }

const isRef = (r: unknown): r is SourceRef => {
  const x = r as Record<string, unknown> | null
  return !!x && ((x.kind === 'job' && typeof x.id === 'string') || (x.kind === 'record' && typeof x.path === 'string') || (x.kind === 'vault' && ['project', 'row', 'rdf'].every(k => typeof x[k] === 'string')))
}

/** The picked jobs and vault RDFs, in the order they were picked; the jobs tab's checkboxes and (de)Cypher share them. */
export function useDecypherSources() {
  const [refs, setRefs] = React.useState<SourceRef[]>(() => load(REFS, v => (Array.isArray(v) ? v.filter(isRef) : null)) ?? [])
  React.useEffect(() => save(REFS, refs), [refs])
  const keys = React.useMemo(() => new Set(refs.map(refKey)), [refs])
  return {
    refs,
    has: (r: SourceRef) => keys.has(refKey(r)),
    toggle: (r: SourceRef) => setRefs(l => (l.some(x => refKey(x) === refKey(r)) ? l.filter(x => refKey(x) !== refKey(r)) : [...l, r])),
    add: (rs: SourceRef[]) => setRefs(l => [...l, ...rs.filter(r => !l.some(x => refKey(x) === refKey(r)))]),
    remove: (key: string) => setRefs(l => l.filter(x => refKey(x) !== key)),
  }
}
export type DecypherSources = ReturnType<typeof useDecypherSources>

/** RDFs shown as one card because they differ only in their reference: the first leads; `off` are those whose reference is not plotted. */
export interface Morph { ids: string[]; off: string[] }
/** A morph as it shows now: the RDFs that are shown, and those of them whose reference is plotted. */
export interface ActiveMorph { ids: string[]; on: string[] }

export interface View {
  mode: 'each' | 'one'
  colorBy: ColorBy
  rep: Rep
  rest: Rest
  arrange: Arrange
  labels: boolean
  hydrogens: boolean
  /** The peak marks the charts draw (R3d): the maximum filled, the first shell hollow. A view saved before kept a `peaks` switch. */
  marks: Marks
  /** Picking a group in one job picks the same group in the others. */
  link: boolean
  /** Analyses left out of the view, by id. */
  hidden: string[]
  /** The plotted groups of each analysis, by id. */
  selected: Record<string, string[]>
  /** The analysis whose structure and groups lead the one graph. */
  focus: string | null
  /** RDFs morphed into one card each (while each job is shown). */
  morphed: Morph[]
}

export const DEFAULT_VIEW: View = { mode: 'each', colorBy: 'group', rep: 'ball & stick', rest: 'grey', arrange: 'side by side', labels: true, hydrogens: true, marks: 'both', link: false, hidden: [], selected: {}, focus: null, morphed: [] }

function checkView(v: unknown): View | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Partial<View>, d = DEFAULT_VIEW, one = <T>(x: unknown, ok: readonly T[], def: T) => (ok.includes(x as T) ? (x as T) : def)
  const bool = (x: unknown, def: boolean) => (typeof x === 'boolean' ? x : def)
  const selected: Record<string, string[]> = {}
  for (const [k, l] of Object.entries(o.selected && typeof o.selected === 'object' ? o.selected : {})) if (Array.isArray(l)) selected[k] = l.filter(x => typeof x === 'string')
  const strs = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [])
  const morphed = (Array.isArray(o.morphed) ? o.morphed : []).map(m => ({ ids: strs((m as Morph)?.ids), off: strs((m as Morph)?.off) })).filter(m => m.ids.length > 1)
  return {
    mode: one(o.mode, ['each', 'one'] as const, d.mode), colorBy: one(o.colorBy, ['group', 'job'] as const, d.colorBy),
    rep: one(o.rep, ['ball & stick', 'licorice', 'spacefill'] as const, d.rep), rest: one(o.rest, ['tinted', 'grey', 'ghost'] as const, d.rest),
    arrange: one(o.arrange, ['side by side', 'frame positions'] as const, d.arrange),
    labels: bool(o.labels, d.labels), hydrogens: bool(o.hydrogens, d.hydrogens), marks: one(o.marks, ['both', 'maximum', 'first shell', 'none'] as const, (o as { peaks?: boolean }).peaks === false ? 'none' : d.marks), link: bool(o.link, d.link),
    hidden: Array.isArray(o.hidden) ? o.hidden.filter(x => typeof x === 'string') : [], selected, focus: typeof o.focus === 'string' ? o.focus : null, morphed,
  }
}

export function useView() {
  const [view, setView] = React.useState<View>(() => load(VIEW, checkView) ?? DEFAULT_VIEW)
  React.useEffect(() => save(VIEW, view), [view])
  const patch = React.useCallback((p: Partial<View> | ((v: View) => Partial<View>)) => setView(v => ({ ...v, ...(typeof p === 'function' ? p(v) : p) })), [])
  return [view, patch] as const
}

/** Picking a group: alone (a second click clears it), or added to / taken from the others. */
export function pickGroup(list: string[], name: string, add: boolean): string[] {
  if (add) return list.includes(name) ? list.filter(x => x !== name) : [...list, name]
  return list.length === 1 && list[0] === name ? [] : [name]
}

/** `other` joins `lead`'s card (making one if it has none), its reference plotted; any card it was in loses it. */
export function joinMorph(list: Morph[], lead: string, other: string): Morph[] {
  if (lead === other) return list
  const rest = list.map(m => ({ ids: m.ids.filter(x => x !== other), off: m.off.filter(x => x !== other) })).filter(m => m.ids.length > 1)
  const own = rest.find(m => m.ids.includes(lead))
  if (own) return rest.map(m => (m === own ? { ids: [...m.ids, other], off: m.off } : m))
  return [...rest, { ids: [lead, other], off: [] }]
}

/** The morphs as they show: only RDFs that are shown, a card needs two, and one with no reference plotted plots them all. */
export function activeMorphs(list: Morph[], shown: string[]): ActiveMorph[] {
  const seen = new Set<string>()
  return list.flatMap(m => {
    const ids = m.ids.filter(x => shown.includes(x) && !seen.has(x))
    if (ids.length < 2) return []
    ids.forEach(x => seen.add(x))
    const on = ids.filter(x => !m.off.includes(x))
    return [{ ids, on: on.length ? on : ids }]
  })
}

/** After the references plotted in `lead`'s card are `on`: the others are off. */
export function setMorphRefs(list: Morph[], lead: string, on: string[]): Morph[] {
  return list.map(m => (m.ids.includes(lead) ? { ids: m.ids, off: m.ids.filter(x => !on.includes(x)) } : m))
}

/** Splitting `lead`'s card: its RDFs are shown one by one again. */
export const splitMorph = (list: Morph[], lead: string): Morph[] => list.filter(m => !m.ids.includes(lead))
