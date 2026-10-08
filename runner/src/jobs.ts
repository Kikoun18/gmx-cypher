// Jobs as the GUI sees them: the list, kept current by the server's event stream (T7), and their states as words.

import * as React from 'react'
import { getJson } from './api'
import type { Progress } from './lib/progress'

export interface Job {
  id: string; kind: string; title: string; file: string; args: string[]; cwd: string
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

export function progressText(j: Job): string {
  const p = j.progress
  if (p.analysed) return p.analysed.frames + ' frames analysed · last time ' + p.analysed.lastTime + ' ps'
  return p.frame == null ? (j.status === 'running' ? 'starting…' : '—') : 'frame ' + p.frame + ' · t = ' + p.time + ' ps'
}
