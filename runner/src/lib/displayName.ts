// A job's display name (R3c, T162): computed, never stored, from the folder it ran in and the connected project's
// path pattern (the Matrix's own parsePath), as "row · column · run · command". Today's title when there is no
// project or nothing matches. A label only: records, files and sends keep the job's own title and names.

import { parsePath } from '../../../matrix/src/lib/seq'

/** The connected project's naming: its path pattern and its columns (a folder name is shown as its column's label). */
export interface Naming { project: string; pathPattern: string; columns: { k: string; label: string }[] }
export interface Nameable { id: string; title: string; kind: string; cwd: string; created: string; meta?: Record<string, unknown> }

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function displayName(j: Nameable, n: Naming | null): string {
  if (!n?.pathPattern) return j.title
  const m = parsePath(j.cwd, n.pathPattern), f = m.fields
  const row = m.matched ? f.name || f.seq : ''
  if (!row) return j.title
  const col = f.col && (n.columns.find(c => same(c.k, f.col!) || same(c.label, f.col!))?.label ?? f.col)
  return [row, col, f.run && 'run ' + f.run, j.kind].filter(Boolean).join(' · ')
}

/** The local time a job started, for telling names apart: hours and minutes, with seconds when asked. */
const localTime = (iso: string, seconds: boolean) => new Date(iso).toTimeString().slice(0, seconds ? 8 : 5)

/**
 * Every job's display name; names that collide get the shortest part that tells them apart: the nearest folder
 * that differs between them all, else the time they started (with seconds if the minute is shared), else their
 * file stems (free within a folder by construction).
 */
export function displayNames(jobs: Nameable[], n: Naming | null, time = localTime): Map<string, string> {
  const names = new Map(jobs.map(j => [j.id, displayName(j, n)]))
  const byName = new Map<string, Nameable[]>()
  for (const j of jobs) byName.set(names.get(j.id)!, [...(byName.get(names.get(j.id)!) ?? []), j])
  for (const [name, group] of byName) {
    if (group.length < 2) continue
    const segs = group.map(j => j.cwd.split('/').filter(Boolean).reverse()), deepest = Math.max(...segs.map(s => s.length))
    let parts: string[] | null = null
    for (let d = 0; d < deepest && !parts; d++) { const v = segs.map(s => s[d] ?? ''); if (new Set(v).size === v.length && v.every(Boolean)) parts = v }
    const distinct = (v: string[]) => new Set(v).size === v.length
    for (const seconds of [false, true]) if (!parts) { const t = group.map(j => time(j.created, seconds)); if (distinct(t)) parts = t }
    if (!parts) parts = group.map((j, i) => String(j.meta?.stem ?? i + 1))
    group.forEach((j, i) => names.set(j.id, name + ' · ' + parts![i]))
  }
  return names
}
