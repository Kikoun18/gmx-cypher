// What (de)Cypher shows, kept in this browser (a convenience, never data): the jobs and vault RDFs you picked,
// and how you last looked at them. Files from disk are read in the page and not kept.

import * as React from 'react'
import type { ColorBy, Arrange, Rep, Rest } from './kit'

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

export interface View {
  mode: 'each' | 'one'
  colorBy: ColorBy
  rep: Rep
  rest: Rest
  arrange: Arrange
  labels: boolean
  hydrogens: boolean
  peaks: boolean
  /** Picking a group in one job picks the same group in the others. */
  link: boolean
  /** Analyses left out of the view, by id. */
  hidden: string[]
  /** The plotted groups of each analysis, by id. */
  selected: Record<string, string[]>
  /** The analysis whose structure and groups lead the one graph. */
  focus: string | null
}

export const DEFAULT_VIEW: View = { mode: 'each', colorBy: 'group', rep: 'ball & stick', rest: 'grey', arrange: 'side by side', labels: true, hydrogens: true, peaks: true, link: false, hidden: [], selected: {}, focus: null }

function checkView(v: unknown): View | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Partial<View>, d = DEFAULT_VIEW, one = <T>(x: unknown, ok: readonly T[], def: T) => (ok.includes(x as T) ? (x as T) : def)
  const bool = (x: unknown, def: boolean) => (typeof x === 'boolean' ? x : def)
  const selected: Record<string, string[]> = {}
  for (const [k, l] of Object.entries(o.selected && typeof o.selected === 'object' ? o.selected : {})) if (Array.isArray(l)) selected[k] = l.filter(x => typeof x === 'string')
  return {
    mode: one(o.mode, ['each', 'one'] as const, d.mode), colorBy: one(o.colorBy, ['group', 'job'] as const, d.colorBy),
    rep: one(o.rep, ['ball & stick', 'licorice', 'spacefill'] as const, d.rep), rest: one(o.rest, ['tinted', 'grey', 'ghost'] as const, d.rest),
    arrange: one(o.arrange, ['side by side', 'frame positions'] as const, d.arrange),
    labels: bool(o.labels, d.labels), hydrogens: bool(o.hydrogens, d.hydrogens), peaks: bool(o.peaks, d.peaks), link: bool(o.link, d.link),
    hidden: Array.isArray(o.hidden) ? o.hidden.filter(x => typeof x === 'string') : [], selected, focus: typeof o.focus === 'string' ? o.focus : null,
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
