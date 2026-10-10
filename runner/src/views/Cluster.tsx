import * as React from 'react'
import { RefreshCw, TriangleAlert, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { FieldHint } from '../ui/label'
import { Section } from '../ui/separator'
import { postJson } from '../api'
import { ageText, etaOf, mergeJobs, nextPoll, type ClusterRow, type EtaLine, type JobState, type QqTable } from '../lib/cluster'
import { cn } from '../lib/utils'

/** What POST /api/cluster answers (server/cluster.ts): one read of qq jobs and gmx-eta -a. */
type Part<T> = ({ ok: true } & T) | { ok: false; error: string }
interface ClusterRead { at: string; finished: boolean; qq: Part<{ path: string; args: string[]; table: QqTable }>; eta: Part<{ path: string; sha256: string; lines: EtaLine[]; other: string[] }> }

const hms = (s: number | null) => (s === null ? '' : [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, '0')).join(':'))
/** A row's state: qq's; for a job only gmx-eta lists, none (it may have finished), or unknown when qq couldn't be read. */
const NOT_LISTED: JobState = { letter: '', word: 'not in qq jobs', tone: 'stone' }, UNREAD: JobState = { letter: '', word: 'unknown: qq unread', tone: 'stone' }
type Row = ClusterRow & { state: JobState }
const nameOf = (r: Row) => r.eta?.script ?? (r.qq ? r.qq.name + (r.qq.truncated ? '…' : '') : '')
const ORDER = ['R', 'Q', 'H', 'S', 'E', 'F']

type SortKey = 'job' | 'name' | 'state' | 'eta'
const SORTS: Record<SortKey, (a: Row, b: Row) => number> = {
  job: (a, b) => Number(a.key) - Number(b.key),
  name: (a, b) => nameOf(a).localeCompare(nameOf(b)),
  state: (a, b) => (ORDER.indexOf(a.state.letter) + 1 || 99) - (ORDER.indexOf(b.state.letter) + 1 || 99),
  // Jobs without an ETA last, whichever way.
  eta: (a, b) => (a.eta?.eta ?? Infinity) - (b.eta?.eta ?? Infinity),
}

/**
 * The reads, while this view is open and the page visible (section 1.3): one now, then every 60 s (question 5), longer
 * after failures; never two at once. `refresh` asks for a new one.
 */
function useCluster(finished: boolean) {
  const [read, setRead] = React.useState<ClusterRead | null>(null)
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [failed, setFailed] = React.useState(0)
  const refresh = React.useRef<() => void>(() => {})
  React.useEffect(() => {
    // `lastAt`: the time of the read last seen, so a reused read (the server keeps one 50 s) isn't counted as a new
    // failure; `due`: when the next read is, which a return to the page keeps (review).
    let alive = true, inFlight = false, failures = 0, lastAt = '', due = 0, timer: ReturnType<typeof setTimeout> | undefined
    const load = async (fresh: boolean) => {
      if (inFlight) return
      inFlight = true
      setBusy(true)
      clearTimeout(timer)
      try {
        const r = await postJson<ClusterRead>('/api/cluster', { finished, refresh: fresh })
        if (alive) { setRead(r); setError(''); if (r.at !== lastAt) { lastAt = r.at; failures = r.qq.ok ? 0 : failures + 1 } }
      } catch (e) { if (alive) { setError((e as Error).message); failures++ } }
      inFlight = false
      if (!alive) return
      setBusy(false)
      setFailed(failures)
      due = Date.now() + nextPoll(failures) * 1000
      if (document.visibilityState === 'visible') timer = setTimeout(() => load(false), due - Date.now())
    }
    refresh.current = () => { load(true) }
    load(false)
    // Hidden: no reads; back: the next one when it is due, now if that has passed.
    const onVisible = () => {
      clearTimeout(timer)
      if (document.visibilityState === 'visible') timer = setTimeout(() => load(false), Math.max(0, due - Date.now()))
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [finished])
  return { read, error, busy, failures: failed, refresh: () => refresh.current() }
}

/** The clock for "updated N min ago", ticking every 15 s. */
function useNow() {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t) }, [])
  return now
}

/** The cluster tab (R10c): your jobs from qq jobs, each with gmx-eta's time left; watch only. */
export function ClusterView() {
  const [finished, setFinished] = React.useState(false)
  const { read, error, busy, refresh, failures } = useCluster(finished)
  const now = useNow()
  const [name, setName] = React.useState('')
  const [hidden, setHidden] = React.useState<Set<string>>(new Set())
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 } | null>(null)
  const rows: Row[] = React.useMemo(() => (read ? mergeJobs(read.qq.ok ? read.qq.table.jobs : [], read.eta.ok ? read.eta.lines : []).map(r => ({ ...r, state: r.qq?.state ?? (read.qq.ok ? NOT_LISTED : UNREAD) })) : []), [read])
  const states = React.useMemo(() => {
    const m = new Map<string, { state: JobState; n: number }>()
    for (const { state } of rows) m.set(state.word, { state, n: (m.get(state.word)?.n ?? 0) + 1 })
    return [...m.values()]
  }, [rows])
  const shown = rows.filter(r => !hidden.has(r.state.word) && nameOf(r).toLowerCase().includes(name.trim().toLowerCase()))
  if (sort) shown.sort((a, b) => sort.dir * SORTS[sort.key](a, b))
  const at = read ? new Date(read.at) : null
  const header = (key: SortKey, label: string) => (
    <th scope="col" className="py-1.5 pr-4 font-normal" aria-sort={sort?.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="uppercase hover:text-foreground" onClick={() => setSort(s => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }))}>
        {label}{sort?.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  )
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button variant="outline" size="sm" onClick={refresh} disabled={busy}><RefreshCw className={cn(busy && 'animate-spin')} /> {busy ? 'reading…' : 'refresh'}</Button>
        <span className="text-caption text-muted-foreground" aria-live="polite">
          {read ? ageText(read.at, now) : busy ? 'reading qq jobs and gmx-eta -a…' : ''}{read && failures > 0 ? ' · next try in ' + nextPoll(failures) / 60 + ' min' : read ? ' · every minute while this tab is open' : ''}
        </span>
        <span className="flex-1" />
        <label className="flex items-center gap-2 text-control"><Checkbox checked={finished} onCheckedChange={c => setFinished(c === true)} /> show finished <span className="text-caption text-muted-foreground">qq jobs -a</span></label>
        <Input size="sm" className="w-56" value={name} onChange={e => setName(e.target.value)} placeholder="filter by name" aria-label="filter by name" />
      </div>
      {error && <Alert variant="destructive"><X /><AlertTitle>gmx-cypher didn't answer</AlertTitle><AlertDescription><p>{error}</p></AlertDescription></Alert>}
      {read && !read.qq.ok && <Alert variant="destructive"><X /><AlertTitle>can't read qq jobs</AlertTitle><AlertDescription><p className="whitespace-pre-line">{read.qq.error}</p></AlertDescription></Alert>}
      {read && !read.eta.ok && <Alert variant="warning"><TriangleAlert /><AlertTitle>no ETAs: gmx-eta -a didn't answer</AlertTitle><AlertDescription><p className="whitespace-pre-line">{read.eta.error}</p></AlertDescription></Alert>}
      {states.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="states shown">
          {states.map(({ state, n }) => {
            const on = !hidden.has(state.word)
            return (
              <button key={state.word} type="button" aria-pressed={on} onClick={() => setHidden(h => { const x = new Set(h); if (on) x.add(state.word); else x.delete(state.word); return x })} className="rounded-full" style={{ opacity: on ? 1 : 0.45 }}>
                <Badge tone={state.tone}>{state.word} · {n}</Badge>
              </button>
            )
          })}
          {read?.qq.ok && Object.keys(read.qq.table.counts).length > 0 && <span className="text-caption text-muted-foreground">qq counts {Object.entries(read.qq.table.counts).map(([k, v]) => k + ' ' + v).join(' · ')}</span>}
        </div>
      )}
      {read && (
        <div className="overflow-x-auto">
          <table className="w-full text-control">
            <caption className="sr-only">your cluster jobs, from qq jobs and gmx-eta -a</caption>
            <thead>
              <tr className="border-b border-border text-left text-label text-muted-foreground">
                {header('job', 'job')}{header('name', 'name')}{header('state', 'state')}
                <th scope="col" className="pr-4 font-normal uppercase">cpus · gpus · nodes</th>
                <th scope="col" className="pr-4 font-normal uppercase">runtime / walltime</th>
                {header('eta', 'eta')}
                <th scope="col" className="pr-4 font-normal uppercase">finishes</th>
                <th scope="col" className="font-normal uppercase">node</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => {
                const s = r.state, e = etaOf(r, at!), q = r.qq
                return (
                  <tr key={r.key} className="border-b border-border/60 align-top">
                    <td className="py-1.5 pr-4 tabular-nums">{q?.id ?? r.eta?.id}</td>
                    <td className="pr-4">{nameOf(r)}</td>
                    <td className="pr-4"><Badge tone={s.tone}>{s.word}</Badge></td>
                    <td className="pr-4 tabular-nums">{q ? [q.cpus, q.gpus, q.nodes].map(x => x ?? '?').join(' · ') : ''}</td>
                    <td className="pr-4 tabular-nums">{q?.runtime != null ? hms(q.runtime) + ' / ' + hms(q.walltime) : q?.waiting != null ? 'waiting ' + hms(q.waiting) : ''}</td>
                    <td className="pr-4">
                      {e.left ?? '—'}
                      {e.why && <div className="max-w-80 text-caption text-muted-foreground">{e.why}</div>}
                      {e.warning && <div className="flex items-center gap-1 text-caption text-destructive"><TriangleAlert className="size-3.5" /> {e.warning}</div>}
                    </td>
                    <td className="pr-4 tabular-nums">{e.finishes ?? ''}</td>
                    <td className="tabular-nums">{q?.node ?? (q?.planned ? 'planned: ' + q.planned : '')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!shown.length && <p className="m-0 py-3 text-control text-muted-foreground">{rows.length ? 'no job matches the filters' : 'no jobs'}</p>}
        </div>
      )}
      {read && <Section label="As read" />}
      {read && (
        <FieldHint>
          {read.qq.ok ? read.qq.path + ' ' + read.qq.args.join(' ') : 'qq'} and {read.eta.ok ? read.eta.path + ' -a (sha256 ' + read.eta.sha256.slice(0, 12) + '…)' : 'gmx-eta -a'}, at {at!.toLocaleTimeString()}; finish times are that time plus gmx-eta's time left, in this browser's time zone · watch only: gmx-cypher never kills or submits a job
        </FieldHint>
      )}
      {read && ((read.qq.ok && read.qq.table.other.length > 0) || (read.eta.ok && read.eta.other.length > 0)) && (
        <details className="text-caption text-muted-foreground">
          <summary className="cursor-pointer">lines that are not jobs, kept as printed</summary>
          <pre className="m-0 mt-2 whitespace-pre-wrap">{[...(read.qq.ok ? read.qq.table.other : []), ...(read.eta.ok ? read.eta.other : [])].join('\n')}</pre>
        </details>
      )}
    </div>
  )
}

