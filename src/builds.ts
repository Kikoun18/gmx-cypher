// SymBuilder's builds as the page follows them (R5c): the runs as the server keeps them, then each change as an event,
// and what the running step prints as it comes (its last 32 kB). Starting and cancelling are the server's to do.

import * as React from 'react'
import { getJson, postJson } from './api'
import type { BuildDraft } from './buildDraft'
import { mdrunHead, type MdrunHead } from './lib/build/mdrun'

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
/** A step's log as the page holds it: its last 32 kB, where that ends, and mdrun's head once known. */
export interface StepLog { text: string; end: number; head?: MdrunHead | null }

export function useBuilds() {
  const [runs, setRuns] = React.useState<BuildRun[]>([])
  // Each step's log as far as it is known: its last 32 kB and where that ends in the whole log, so a chunk that came
  // while the log was read is neither lost nor added twice (the review); and mdrun's head (its number of steps, T232),
  // kept once seen, as the last 32 kB of a long run no longer hold it.
  const [logs, setLogs] = React.useState<Record<string, StepLog>>({})
  React.useEffect(() => {
    getJson<BuildRun[]>('/api/build/runs').then(setRuns, () => {})
    const es = new EventSource('/api/events')
    es.addEventListener('build', e => {
      const r = JSON.parse((e as MessageEvent).data) as BuildRun
      setRuns(list => [r, ...list.filter(x => x.id !== r.id)].sort((a, b) => b.created.localeCompare(a.created)))
    })
    es.addEventListener('build-out', e => {
      const { id, s, end } = JSON.parse((e as MessageEvent).data) as { id: string; s: string; end: number }
      setLogs(l => {
        const had = l[id]
        if (had && had.end >= end) return l
        // Only what the log lacks: the chunk's tail past what is held (all of it when nothing was read yet).
        const add = had ? s.slice(Math.max(0, s.length - (end - had.end))) : s, text = (had?.text ?? '') + add
        // The head is read from the log's start, as it comes: only while what is held still begins there.
        const head = had?.head ?? (text.length === end ? mdrunHead(text) : null)
        return { ...l, [id]: { text: text.slice(-KEEP), end, head } }
      })
    })
    return () => es.close()
  }, [])
  // A step's log from the server, when the page opens on it after it began.
  const loadLog = React.useCallback((id: string) => {
    getJson<{ text: string; to: number; head: MdrunHead | null }>('/api/build/jobs/' + id + '/log').then(g => setLogs(l => (l[id] && l[id].end >= g.to ? (l[id].head || !g.head ? l : { ...l, [id]: { ...l[id], head: g.head } }) : { ...l, [id]: { text: g.text.slice(-KEEP), end: g.to, head: l[id]?.head ?? g.head } })), () => {})
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
