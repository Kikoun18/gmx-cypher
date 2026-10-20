// The jobs list's search and filters (R12b): by command, status, batch, folder and day; free text over the display name
// (R3c), the title (its groups) and the folder, every word to match. Kept in the address (#results?status=failed).

export interface JobFilter { q?: string; command?: string; status?: string; batch?: string; folder?: string; from?: string; to?: string }
type Filterable = { id: string; kind: string; status: string; cwd: string; created: string; title: string; name?: string; meta?: Record<string, unknown> }

const KEYS = ['q', 'command', 'status', 'batch', 'folder', 'from', 'to'] as const
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** A filter from an address's query: known keys with a value, days as YYYY-MM-DD. */
export function parseFilter(q: URLSearchParams): JobFilter {
  const f: JobFilter = {}
  for (const k of KEYS) { const v = q.get(k)?.trim(); if (v && ((k !== 'from' && k !== 'to') || DAY.test(v))) f[k] = v }
  return f
}

/** A filter as an address's query, in a fixed order; '' for none. */
export const filterQuery = (f: JobFilter) => new URLSearchParams(KEYS.flatMap(k => (f[k] ? [[k, f[k]!] as [string, string]] : []))).toString()

/** The day a job was made, in this machine's time. */
const dayOf = (iso: string) => { const d = new Date(iso); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
const inFolder = (path: string, folder: string) => path === folder || path.startsWith(folder.replace(/\/+$/, '') + '/')

/** The jobs a filter keeps, in their order. */
export function filterJobs<J extends Filterable>(jobs: J[], f: JobFilter): J[] {
  const words = (f.q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  return jobs.filter(j => {
    if ((f.command && j.kind !== f.command) || (f.status && j.status !== f.status) || (f.batch && j.meta?.batch !== f.batch)) return false
    if (f.folder && !inFolder(j.cwd, f.folder)) return false
    const day = dayOf(j.created)
    if ((f.from && day < f.from) || (f.to && day > f.to)) return false
    const text = [j.name ?? '', j.title, j.cwd, String(j.meta?.outDir ?? '')].join(' ').toLowerCase()
    return words.every(w => text.includes(w))
  })
}

/** The values a filter can take among these jobs, each with its count, the most common first. */
export function filterOptions(jobs: Filterable[]) {
  const count = (key: (j: Filterable) => string | undefined) => {
    const n = new Map<string, number>()
    for (const j of jobs) { const k = key(j); if (k) n.set(k, (n.get(k) ?? 0) + 1) }
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }
  const names = new Map(jobs.filter(j => j.meta?.batch).map(j => [String(j.meta!.batch), String(j.meta!.batchName ?? j.meta!.batch)]))
  return {
    commands: count(j => j.kind), statuses: count(j => j.status), folders: count(j => j.cwd),
    batches: count(j => (j.meta?.batch ? String(j.meta.batch) : undefined)).map(([id, n]) => [id, names.get(id)!, n] as [string, string, number]),
  }
}
