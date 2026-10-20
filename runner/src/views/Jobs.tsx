import * as React from 'react'
import { X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Kbd } from '../ui/kbd'
import { Section } from '../ui/separator'
import { postJson } from '../api'
import { clock, fraction, jobLine, progressText, statusOf, type Job, type Log, type useJobs } from '../jobs'
import { Status } from '../ui/status'
import { cn } from '../lib/utils'
import { RunResult } from './Result'
import type { RunRecord } from '../lib/record'
import type { Route } from '../lib/route'
import { modsOf, pickInList } from '../core/gestures'
import { filterJobs, type JobFilter } from '../lib/jobFilter'
import { JobFilters } from './JobFilters'

/** Destructive actions arm on the first click and act on the second, within 2.6 s. */
function useArmed(): [boolean, () => boolean] {
  const [armed, setArmed] = React.useState(false)
  React.useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 2600); return () => clearTimeout(t) }, [armed])
  return [armed, () => { if (armed) { setArmed(false); return true } setArmed(true); return false }]
}

/** The time now, every second while `on`: a running job's clock. */
function useNow(on: boolean) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => { if (!on) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [on])
  return now
}

function JobDetail({ job, log, onAllLog, onRunAgain, vault, allow, onCompare }: { job: Job; log: Log | undefined; onAllLog: () => void; onRunAgain: (r: RunRecord) => void; vault: string | null; allow: string[]; onCompare: () => void }) {
  const [armed, press] = useArmed()
  const cancel = () => { if (press()) postJson('/api/jobs/' + job.id + '/cancel', {}).catch(() => {}) }
  const s = statusOf(job), running = job.status === 'running', now = useNow(running), f = fraction(job)
  const took = job.started ? clock((job.ended ? Date.parse(job.ended) : now) - Date.parse(job.started)) : ''
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="m-0 text-title font-bold">{job.name ?? job.title}</h2>
        <Status inline level={s.level} word={s.word} className="text-control" />
      </div>
      {job.name && job.name !== job.title && <p className="-mt-3 m-0 text-caption text-muted-foreground">{job.title}</p>}
      {job.status === 'failed' && job.error && (
        <Alert variant="destructive"><X /><AlertTitle>gmx stopped with an error</AlertTitle><AlertDescription><p className="whitespace-pre-wrap">{job.error}</p></AlertDescription></Alert>
      )}
      {running && f != null && (
        <div role="progressbar" aria-label="frames read" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f * 100)} className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-state transition-[width] duration-300" style={{ width: f * 100 + '%' }} />
        </div>
      )}
      {job.unfollowed && <p className="m-0 text-caption text-muted-foreground">gmx-cypher restarted while this job ran: it still runs (pid {job.pid}), but its output and its end are no longer read here, and its record is not completed</p>}
      {(running || job.progress.frame != null) && !job.unfollowed && <p className="m-0 text-control" aria-live="polite">{job.status === 'failed' || job.status === 'cancelled' ? 'stopped at ' : ''}{progressText(job)}{took && ' · ' + took}</p>}
      {job.status === 'interrupted' && <p className="m-0 text-caption text-muted-foreground">{job.error}</p>}
      <RunResult job={job} log={log?.text} logCut={log && log.from > 0 ? { from: log.from, size: log.size } : undefined} onAllLog={onAllLog} allow={allow} vault={vault} onRunAgain={onRunAgain} onCompare={onCompare}
        actions={job.status === 'running' && !job.unfollowed && <Button variant="destructive" onClick={cancel}>{armed ? 'click again to cancel' : 'cancel'}</Button>} />
      <p className="m-0 text-caption text-muted-foreground">a job keeps running when this page is closed or reloaded · started {new Date(job.created).toLocaleString()}</p>
    </div>
  )
}

type ResultsRoute = Extract<Route, { view: 'results' | 'compare' }>

/**
 * Results (R9a): one jobs list with multi-select (click: one; ⌘/Ctrl-click or its box: one more or less; Shift-click: a
 * range), and a detail pane: the result for one job, compare for several. The selection is in the address.
 */
export function JobsView({ jobs, logs, loadLog, route, go, onRunAgain, vault, allow, compare, keyName }: ReturnType<typeof useJobs> & {
  route: ResultsRoute; go: (r: Route, o?: { replace?: boolean }) => void; onRunAgain: (r: RunRecord) => void; vault: string | null; allow: string[]; compare: React.ReactNode; keyName: string | null
}) {
  // The list as searched and filtered (R12b); the filter goes with every address the list writes.
  const filter = React.useMemo(() => route.filter ?? {}, [route.filter]), listed = React.useMemo(() => filterJobs(jobs, filter), [jobs, filter])
  const job = route.view === 'results' ? jobs.find(j => j.id === route.job) || listed[0] : undefined
  const selected = route.view === 'compare' ? route.jobs : job ? [job.id] : []
  const anchor = React.useRef<string | null>(selected[0] ?? null)
  React.useEffect(() => { if (job && !(job.id in logs)) loadLog(job.id) }, [job, logs, loadLog])
  // In compare, a change of selection stays in compare; elsewhere, two or more open it.
  const pick = (id: string, m: { shift?: boolean; add?: boolean }) => {
    const next = pickInList(listed.map(j => j.id), selected, anchor.current, id, m)
    if (!m.shift) anchor.current = id
    go(route.view === 'compare' && (m.add || m.shift) ? { view: 'compare', jobs: next, filter } : next.length > 1 ? { view: 'compare', jobs: next, filter } : { view: 'results', job: next[0] ?? null, filter })
  }
  const onFilter = (f: JobFilter, typing?: boolean) => go(route.view === 'compare' ? { view: 'compare', jobs: route.jobs, filter: f } : { view: 'results', job: route.job, filter: f }, { replace: typing })
  const openCompare = <Button variant="outline" size="sm" className="mb-1 justify-between" onClick={() => go({ view: 'compare', jobs: selected, filter })} aria-current={route.view === 'compare' ? 'page' : undefined}
    title={(keyName ? keyName + ' opens it too (settings → keyboard) · ' : 'set a key in settings → keyboard · ') + '⌘/Ctrl-click or tick jobs to compare them'}>
    <span>compare{selected.length > 1 ? ' · ' + String(selected.length).padStart(2, '0') : ''}</span>{keyName && <Kbd>{keyName}</Kbd>}
  </Button>
  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-5">
      <nav className="flex flex-col gap-1" aria-label="jobs">
        <Section label={'Jobs ' + String(jobs.length).padStart(2, '0')} />
        {jobs.length > 0 && <JobFilters jobs={jobs} filter={filter} onFilter={onFilter} shown={listed.length} allow={allow} />}
        {openCompare}
        {!jobs.length && <p className="m-0 text-control text-muted-foreground">no jobs yet</p>}
        {jobs.length > 0 && !listed.length && <p className="m-0 text-control text-muted-foreground">no job matches · <button type="button" className="underline underline-offset-2" onClick={() => onFilter({})}>clear the filters</button></p>}
        {listed.map(j => {
          const on = selected.includes(j.id)
          return (
            <div key={j.id} className={cn('flex items-start gap-1 rounded-lg hover:bg-muted', on && 'bg-muted ring-1 ring-inset ring-border')}>
              <Checkbox className="ml-2.5 mt-[11px]" checked={on} onCheckedChange={() => pick(j.id, { add: true })} aria-label={'select ' + (j.name ?? j.title)} />
              <button onClick={e => pick(j.id, modsOf(e))} aria-current={on ? 'true' : undefined} className="flex min-w-0 flex-1 flex-col items-start gap-0.5 py-2 pl-1.5 pr-3 text-left">
                <span className="text-control font-bold">{j.name ?? j.title}</span>
                <span className="block w-full truncate text-caption"><Status inline level={statusOf(j).level} word={statusOf(j).word} /> <span className="text-muted-foreground">· {jobLine(j)}</span></span>
              </button>
            </div>
          )
        })}
      </nav>
      {route.view === 'compare' ? compare : job && <JobDetail key={job.id} job={job} log={logs[job.id]} onAllLog={() => loadLog(job.id, true)} onRunAgain={onRunAgain} vault={vault} allow={allow} onCompare={() => go({ view: 'compare', jobs: [job.id], filter })} />}
    </div>
  )
}
