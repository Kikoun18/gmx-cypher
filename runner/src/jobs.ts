// Jobs as the GUI sees them: the list, kept current by the server's event stream (T7), and their states as words.

import * as React from 'react'
import { getJson } from './api'
import type { Progress } from './lib/progress'
import { displayNames, nameFields, type Naming } from './lib/displayName'
import type { Level } from './core/contract'

export interface Job {
  id: string; kind: string; title: string; file: string; args: string[]; cwd: string; env?: Record<string, string>
  status: 'running' | 'done' | 'failed' | 'cancelled' | 'interrupted'
  created: string; started?: string; ended?: string; pid?: number
  exit?: { code: number | null; signal: string | null }; progress: Progress; error?: string
  /** Its log's length; the log is read on demand (R12a). */
  logSize?: number
  meta?: Record<string, unknown>
  /** Found running at start, its end never seen: it runs on, and nothing follows it (R2a). */
  unfollowed?: boolean
  /** Its display name (R3c), computed on the page from its folder and the connected project; `title` is its own. */
  name?: string
  /** Its place in the connected project, for export file names (R6b). */
  fields?: { project: string; sequence: string; column: string; run: string }
}

/** A job's state as a status level and its word (R9c, contract §4). */
export const STATUS: Record<Job['status'], { level: Level; word: string }> = {
  running: { level: 'info', word: 'running' },
  done: { level: 'ok', word: 'done' },
  failed: { level: 'error', word: 'failed' },
  cancelled: { level: 'info', word: 'cancelled' },
  interrupted: { level: 'warning', word: 'interrupted' },
}

/** A job's state: a job found running at start says it is no longer followed (R2a). */
export const statusOf = (j: Job): { level: Level; word: string } => (j.unfollowed ? { level: 'warning', word: 'still running, not followed (pid ' + j.pid + ')' } : STATUS[j.status])

/** A job's log as read (R12a): its text from `from` (0: all of it) to its end, of `size` characters. */
export interface Log { text: string; from: number; size: number }

/** A chunk of a job's output as the event stream sends it: its text, and where it ends in the log. */
export interface Chunk { s: string; end: number }

/** The log with the part of a chunk it lacks (review): nothing when it has it, nothing past a gap (the log is read again). */
export function joinLog(g: Log, c: Chunk): Log {
  const start = c.end - c.s.length
  return c.end <= g.size || start > g.size ? g : { ...g, text: g.text + c.s.slice(g.size - start), size: c.end }
}

/** Every job, kept current by the server's event stream; a reload or a restart loses nothing (T7). Each is named by the connected project (R3c). */
export function useJobs(naming: Naming | null = null) {
  const [jobs, setJobs] = React.useState<Job[]>([])
  const [logs, setLogs] = React.useState<Record<string, Log>>({})
  // Whether the list came: until it does, a job (de)Cypher remembers is not yet missing.
  const [loaded, setLoaded] = React.useState(false)
  // The output that came while a job's log was being read, by job, with the number of reads under way.
  const reading = React.useRef(new Map<string, { n: number; chunks: Chunk[] }>())
  const held = React.useRef(logs)
  React.useEffect(() => { held.current = logs }, [logs])
  // A job's log from its file: its last 64 kB, or all of it when asked (R12a).
  const loadLog = React.useCallback((id: string, all = false) => {
    const r = reading.current.get(id) ?? { n: 0, chunks: [] }
    r.n++; reading.current.set(id, r)
    const done = () => { if (--r.n === 0) reading.current.delete(id) }
    getJson<Log>('/api/jobs/' + id + '/log' + (all ? '?from=0' : '')).then(g => { setLogs(l => ({ ...l, [id]: r.chunks.reduce(joinLog, g) })); done() }, done)
  }, [])
  React.useEffect(() => {
    getJson<Job[]>('/api/jobs').then(j => { setJobs(j); setLoaded(true) }, () => {})
    const es = new EventSource('/api/events')
    es.addEventListener('job', e => {
      const j = JSON.parse((e as MessageEvent).data) as Job
      setJobs(list => [j, ...list.filter(x => x.id !== j.id)].sort((a, b) => b.created.localeCompare(a.created)))
    })
    // An archived job leaves the list (R12c); unarchived, it comes back as a job event.
    es.addEventListener('gone', e => { const { id } = JSON.parse((e as MessageEvent).data) as { id: string }; setJobs(list => list.filter(j => j.id !== id)) })
    es.addEventListener('out', e => {
      const { id, ...c } = JSON.parse((e as MessageEvent).data) as Chunk & { id: string }
      reading.current.get(id)?.chunks.push(c)
      setLogs(l => (id in l ? { ...l, [id]: joinLog(l[id], c) } : l))
    })
    // The stream came back after a break: what it missed is read again for each log shown.
    let opened = false
    es.addEventListener('open', () => { if (opened) for (const [id, g] of Object.entries(held.current)) loadLog(id, g.from === 0); opened = true })
    return () => es.close()
  }, [loadLog])
  const named = React.useMemo(() => { const n = displayNames(jobs, naming); return jobs.map(j => ({ ...j, name: n.get(j.id), fields: nameFields(j, naming) })) }, [jobs, naming])
  return { jobs: named, logs, loadLog, loaded }
}

/** The connected project's naming (R3c), read again when the vault or the project changes. */
export function useNaming(vault: string | null, project: string | null): Naming | null {
  const at = vault && project ? vault + '\n' + project : null, [n, setN] = React.useState<{ at: string; n: Naming | null } | null>(null)
  React.useEffect(() => { if (at) getJson<Naming | null>('/api/naming').then(x => setN({ at, n: x }), () => setN({ at, n: null })) }, [at])
  return at && n?.at === at ? n.n : null
}

type Estimate = { frames: number; start: number; end: number }
export const estimateOf = (j: Job) => (j.meta?.estimate as Estimate | null | undefined) ?? null

/** Frames and time as gmx prints them, against the run's estimate when there is one (R4b). */
export function progressText(j: Job): string {
  const p = j.progress, est = estimateOf(j)
  if (p.analysed) return p.analysed.frames + ' frames analysed · last time ' + p.analysed.lastTime + ' ps'
  if (p.frame == null) return j.status === 'running' ? 'starting…' : '—'
  return 'frame ' + p.frame + (est ? ' of ≈' + est.frames : '') + ' · t = ' + p.time + ' ps' + (est ? ' of ≈' + est.end + ' ps' : '')
}

/** How far a running job is (0–1) by time read, or null without an estimate. */
export function fraction(j: Job): number | null {
  const est = estimateOf(j), t = j.progress.time
  if (!est || t == null) return est ? 0 : null
  return est.end > est.start ? Math.min(1, Math.max(0, (t - est.start) / (est.end - est.start))) : 1
}

/** 0:02, 12:40, 1:05:03 */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0')
  return h ? h + ':' + String(m).padStart(2, '0') + ':' + sec : m + ':' + sec
}

/** A job's line in the list: its state's detail (frame and time, frames and duration, gmx's error, where it stopped). */
export function jobLine(j: Job): string {
  const took = j.started && j.ended ? ' · ' + clock(Date.parse(j.ended) - Date.parse(j.started)) : ''
  if (j.status === 'failed' && j.error) return j.error.split('\n').pop()!.trim()
  if (j.status === 'done' && j.progress.analysed) return j.progress.analysed.frames + ' frames' + took
  if ((j.status === 'cancelled' || j.status === 'interrupted') && j.progress.frame != null) return 'at frame ' + j.progress.frame
  if (j.status === 'running' && j.progress.frame != null) return 'frame ' + j.progress.frame + ' · ' + j.progress.time + ' ps'
  return progressText(j)
}
