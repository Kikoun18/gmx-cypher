// SymBuilder's builds as the page follows them (R5c): the runs as the server keeps them, then each change as an event,
// and what the running step prints as it comes (its last 32 kB). Starting and cancelling are the server's to do.

import * as React from 'react'
import { getJson, postJson } from './api'
import type { BuildDraft } from './buildDraft'

export type SystemStatus = 'waiting' | 'building' | 'built' | 'cluster' | 'failed' | 'skipped' | 'cancelled'
export interface SystemRun {
  dir: string; method: string; saccharide: string; sequence: string; status: SystemStatus
  step: number; steps: number; label?: string; stage?: string; job?: string
  started?: string; ended?: string; error?: string; notes: string[]; submit: string[]
  attempt?: number; retried?: string; wentOn?: string
}
export interface BuildRun {
  id: string; created: string; ended?: string; status: 'running' | 'done' | 'failed' | 'cancelled' | 'interrupted'
  plan: string; base: string; ifExists: string; onFailure: string; systems: SystemRun[]
}

const KEEP = 32_768

export function useBuilds() {
  const [runs, setRuns] = React.useState<BuildRun[]>([])
  const [logs, setLogs] = React.useState<Record<string, string>>({})
  React.useEffect(() => {
    getJson<BuildRun[]>('/api/build/runs').then(setRuns, () => {})
    const es = new EventSource('/api/events')
    es.addEventListener('build', e => {
      const r = JSON.parse((e as MessageEvent).data) as BuildRun
      setRuns(list => [r, ...list.filter(x => x.id !== r.id)].sort((a, b) => b.created.localeCompare(a.created)))
    })
    es.addEventListener('build-out', e => {
      const { id, s } = JSON.parse((e as MessageEvent).data) as { id: string; s: string }
      setLogs(l => ({ ...l, [id]: ((l[id] ?? '') + s).slice(-KEEP) }))
    })
    return () => es.close()
  }, [])
  // A step's log from the server, when the page opens on it after it began.
  const loadLog = React.useCallback((id: string) => {
    getJson<{ text: string }>('/api/build/jobs/' + id + '/log').then(g => setLogs(l => ({ ...l, [id]: g.text.slice(-KEEP) })), () => {})
  }, [])
  const start = React.useCallback((d: BuildDraft) => postJson<BuildRun>('/api/build/start', { plan: d.plan, systems: d.systems, ifExists: d.ifExists, onFailure: d.onFailure })
    .then(r => { setRuns(list => [r, ...list.filter(x => x.id !== r.id)]); return r }), [])
  const cancel = React.useCallback((id: string) => postJson<BuildRun>('/api/build/runs/' + id + '/cancel', {}).then(() => {}), [])
  const retry = React.useCallback((run: string, dir: string, how: 'resume' | 'rebuild') => postJson<BuildRun>('/api/build/retry', { run, dir, how })
    .then(r => { setRuns(list => [r, ...list.filter(x => x.id !== r.id)]); return r }), [])
  const goOn = React.useCallback((run: string, dir: string) => postJson<BuildRun>('/api/build/go-on', { run, dir })
    .then(r => { setRuns(list => [r, ...list.filter(x => x.id !== r.id)]); return r }), [])
  const building = runs.find(r => r.status === 'running')?.systems.filter(s => s.status === 'building').length ?? 0
  return { runs, logs, loadLog, start, cancel, retry, goOn, building }
}
