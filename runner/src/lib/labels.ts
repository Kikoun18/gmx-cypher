// Renamed groups and reference (R11d): display labels, by source (a compare analysis's id; a job's result is `job:<id>`
// in both places) and by the group's original name, kept in this browser (question 24). A label is not the data: the
// record, the .ndx, the .xvg and anything sent keep the names gmx was given.

import * as React from 'react'

export type Labels = Record<string, Record<string, string>>
const KEY = 'gmx-cypher-labels', NONE: Record<string, string> = {}

/** Labels kept as they may be: non-empty text, by source and name. */
export function cleanLabels(v: unknown): Labels {
  const out: Labels = {}
  for (const [source, m] of Object.entries(v && typeof v === 'object' ? v : {})) {
    if (!m || typeof m !== 'object') continue
    const kept = Object.fromEntries(Object.entries(m).filter((e): e is [string, string] => typeof e[1] === 'string' && !!e[1].trim()))
    if (Object.keys(kept).length) out[source] = kept
  }
  return out
}

const read = (): Labels => { try { return cleanLabels(JSON.parse(localStorage.getItem(KEY) ?? 'null')) } catch { return {} } }
const listeners = new Set<() => void>()
let current: Labels | null = null
const all = () => (current ??= read())

/** One source's labels, by original name (none: {}). */
export const labelsOf = (source: string): Record<string, string> => all()[source] ?? NONE

/** A group's label (trimmed); empty removes it. */
export const setLabel = (source: string, original: string, label: string) => setLabels(source, { ...labelsOf(source), [original]: label })

/** The label a group's field keeps for what is typed in it: trimmed, none when it is the name. */
export const labelFor = (original: string, text: string) => { const l = text.trim(); return l === original ? '' : l }

/** One source's labels, all at once (a saved view opened, R14b): those it does not name are removed. */
export function setLabels(source: string, labels: Record<string, string>) {
  const mine = Object.fromEntries(Object.entries(cleanLabels({ [source]: labels })[source] ?? {}).map(([n, l]) => [n, labelFor(n, l)]).filter(e => e[1]))
  const { [source]: _, ...rest } = all()
  current = Object.keys(mine).length ? { ...rest, [source]: mine } : rest
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* kept for this page only */ }
  listeners.forEach(f => f())
}

/** Every source's labels, kept current. */
export function useLabels(): Labels {
  return React.useSyncExternalStore(on => { listeners.add(on); return () => listeners.delete(on) }, all, () => ({}))
}
