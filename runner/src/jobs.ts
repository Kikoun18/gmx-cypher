// Jobs as the GUI sees them: the list, kept current by the server's event stream (T7), and their states as words.

import * as React from 'react'
import { getJson } from './api'
import type { Progress } from './lib/progress'

export interface Job {
  id: string; kind: string; title: string; file: string; args: string[]; cwd: string; env?: Record<string, string>
  status: 'running' | 'done' | 'failed' | 'cancelled' | 'interrupted'
  created: string; started?: string; ended?: string; pid?: number
  exit?: { code: number | null; signal: string | null }; progress: Progress; error?: string; log?: string
  meta?: Record<string, unknown>
}

export const STATUS: Record<Job['status'], { word: string; className: string }> = {
  running: { word: 'running…', className: 'text-butter-strong' },
  done: { word: '✓ done', className: 'text-mint-strong' },
  failed: { word: '✗ failed', className: 'text-destructive' },
  cancelled: { word: 'cancelled', className: 'text-muted-foreground' },
  interrupted: { word: 'interrupted', className: 'text-muted-foreground' },
}

/** Every job, kept current by the server's event stream; a reload or a restart loses nothing (T7). */
export function useJobs() {
  const [jobs, setJobs] = React.useState<Job[]>([])
  const [logs, setLogs] = React.useState<Record<string, string>>({})
  React.useEffect(() => {
    getJson<Job[]>('/api/jobs').then(setJobs, () => {})
    const es = new EventSource('/api/events')
    es.addEventListener('job', e => {
      const j = JSON.parse((e as MessageEvent).data) as Job
      setJobs(list => [j, ...list.filter(x => x.id !== j.id)].sort((a, b) => b.created.localeCompare(a.created)))
    })
    es.addEventListener('out', e => {
      const { id, s } = JSON.parse((e as MessageEvent).data) as { id: string; s: string }
      setLogs(l => (id in l ? { ...l, [id]: l[id] + s } : l))
    })
    return () => es.close()
  }, [])
  const loadLog = React.useCallback((id: string) => { getJson<Job>('/api/jobs/' + id).then(j => setLogs(l => ({ ...l, [id]: j.log || '' })), () => {}) }, [])
  return { jobs, logs, loadLog }
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
