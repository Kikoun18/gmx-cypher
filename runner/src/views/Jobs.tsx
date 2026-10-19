import * as React from 'react'
import { X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import type { DecypherSources, SourceRef } from '../decypher/state'
import { Kbd } from '../ui/kbd'
import { Section } from '../ui/separator'
import { postJson } from '../api'
import { clock, fraction, jobLine, progressText, statusOf, type Job, type useJobs } from '../jobs'
import { commandText } from '../lib/command'
import { asTerminal } from '../lib/progress'
import { cn } from '../lib/utils'
import { Code } from './Code'
import { RunResult } from './Result'
import type { RunRecord } from '../lib/record'

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

/** What the jobs tab needs of (de)Cypher: the picked RDFs, a way to open it, and its key. */
export interface DecypherLink { sources: DecypherSources; open: (add?: SourceRef[]) => void; keyName: string | null }

function JobDetail({ job, log, onRunAgain, vault, decypher }: { job: Job; log: string | undefined; onRunAgain: (r: RunRecord) => void; vault: string | null; decypher: DecypherLink }) {
  const [armed, press] = useArmed()
  const logRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => { const el = logRef.current?.querySelector('pre'); if (el) el.scrollTop = el.scrollHeight }, [log])
  const cancel = () => { if (press()) postJson('/api/jobs/' + job.id + '/cancel', {}).catch(() => {}) }
  const s = statusOf(job), running = job.status === 'running', now = useNow(running), f = fraction(job)
  const took = job.started ? clock((job.ended ? Date.parse(job.ended) : now) - Date.parse(job.started)) : ''
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="m-0 text-title font-bold">{job.title}</h2>
        <Badge tone={job.status === 'running' ? 'butter' : job.status === 'done' ? 'mint' : 'stone'} variant={job.status === 'failed' ? 'destructive' : undefined}>{s.word}</Badge>
        <span className="flex-1" />
        {job.kind === 'rdf' && job.status === 'done' && <Button variant="outline" onClick={() => decypher.open([{ kind: 'job', id: job.id }])}>open in (de)Cypher</Button>}
        {job.status === 'running' && !job.unfollowed && <Button variant="destructive" onClick={cancel}>{armed ? 'click again to cancel' : 'cancel'}</Button>}
      </div>
      {job.status === 'failed' && job.error && (
        <Alert variant="destructive"><X /><AlertTitle>gmx stopped with an error</AlertTitle><AlertDescription><p className="whitespace-pre-wrap">{job.error}</p></AlertDescription></Alert>
      )}
      {running && f != null && (
        <div role="progressbar" aria-label="frames read" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f * 100)} className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-butter transition-[width] duration-300" style={{ width: f * 100 + '%' }} />
        </div>
      )}
      {job.unfollowed && <p className="m-0 text-caption text-muted-foreground">gmx-cypher restarted while this job ran: it still runs (pid {job.pid}), but its output and its end are no longer read here, and its record is not completed</p>}
      {(running || job.progress.frame != null) && !job.unfollowed && <p className="m-0 text-control" aria-live="polite">{job.status === 'failed' || job.status === 'cancelled' ? 'stopped at ' : ''}{progressText(job)}{took && ' · ' + took}</p>}
      {job.status === 'interrupted' && <p className="m-0 text-caption text-muted-foreground">{job.error}</p>}
      <RunResult job={job} onRunAgain={onRunAgain} vault={vault} />
      <Section label="Command" />
      <Code label="command" text={commandText(job)} />
      <Section label="Log"><span className="text-caption text-muted-foreground">{job.status === 'running' && !job.unfollowed ? 'live · stdout and stderr' : 'stdout and stderr'}</span></Section>
      <div ref={logRef}><Code label="log" text={asTerminal(log ?? '')} className="max-h-80 text-muted-foreground" /></div>
      <p className="m-0 text-caption text-muted-foreground">a job keeps running when this page is closed or reloaded · started {new Date(job.created).toLocaleString()}</p>
    </div>
  )
}

export function JobsView({ jobs, logs, loadLog, selected, onSelect, onRunAgain, vault, decypher }: ReturnType<typeof useJobs> & { selected: string | null; onSelect: (id: string) => void; onRunAgain: (r: RunRecord) => void; vault: string | null; decypher: DecypherLink }) {
  const job = jobs.find(j => j.id === selected) || jobs[0]
  React.useEffect(() => { if (job && !(job.id in logs)) loadLog(job.id) }, [job, logs, loadLog])
  const anyRdf = jobs.some(j => j.kind === 'rdf'), picked = decypher.sources.refs.length
  if (!jobs.length) return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="m-0 text-control text-muted-foreground">no jobs yet</p>
      <Button variant="outline" size="sm" onClick={() => decypher.open()}>(de)Cypher{decypher.keyName ? ' · ' + decypher.keyName : ''}</Button>
    </div>
  )
  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-5">
      <nav className="flex flex-col gap-1" aria-label="jobs">
        <Section label={'Jobs ' + String(jobs.length).padStart(2, '0')} />
        {/* (de)Cypher: tick RDF jobs to see them together, with their structures; the button or its key opens it. */}
        <Button variant="outline" size="sm" className="mb-1 justify-between" onClick={() => decypher.open()} title={decypher.keyName ? decypher.keyName + ' opens it too (settings → keyboard)' : 'set a key in settings → keyboard'}>
          <span>(de)Cypher{picked ? ' · ' + String(picked).padStart(2, '0') : ''}</span>{decypher.keyName && <Kbd>{decypher.keyName}</Kbd>}
        </Button>
        {jobs.map(j => {
          const rdf = j.kind === 'rdf', ref: SourceRef = { kind: 'job', id: j.id }
          return (
            <div key={j.id} className={cn('flex items-start gap-1 rounded-lg hover:bg-muted', j.id === job?.id && 'bg-muted ring-1 ring-inset ring-border')}>
              {rdf ? <Checkbox className="ml-2.5 mt-[11px]" checked={decypher.sources.has(ref)} onCheckedChange={() => decypher.sources.toggle(ref)} aria-label={'show ' + j.title + ' in (de)Cypher'} disabled={j.status === 'failed' || j.status === 'cancelled' || j.status === 'interrupted'} />
                : anyRdf && <span className="ml-2.5 w-[13px] shrink-0" />}
              <button onClick={() => onSelect(j.id)} aria-current={j.id === job?.id ? 'true' : undefined} className={cn('flex min-w-0 flex-1 flex-col items-start gap-0.5 py-2 pr-3 text-left', anyRdf ? 'pl-1.5' : 'pl-3')}>
                <span className="text-control font-bold">{j.title}</span>
                <span className="block w-full truncate text-caption"><span className={statusOf(j).className}>{statusOf(j).word}</span> <span className="text-muted-foreground">· {jobLine(j)}</span></span>
              </button>
            </div>
          )
        })}
      </nav>
      {job && <JobDetail key={job.id} job={job} log={logs[job.id]} onRunAgain={onRunAgain} vault={vault} decypher={decypher} />}
    </div>
  )
}
