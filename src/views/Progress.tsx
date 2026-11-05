import * as React from 'react'
import type { BuildRun, SystemRun, SystemStatus } from '../builds'
import type { Level } from '../core/contract'
import { cn } from '../lib/utils'
import { Button } from '../ui/button'
import { Stat } from '../ui/card'
import { Status } from '../ui/status'

const Head = ({ label, n }: { label: string; n?: number }) => (
  <div className="flex items-center gap-2"><span className="text-label uppercase text-muted-foreground">{label}</span><span className="h-px flex-1 bg-border" />{n != null && <span className="text-control">{String(n).padStart(2, '0')}</span>}</div>
)
const Panel = ({ className, ...p }: React.ComponentProps<'section'>) => <section className={cn('flex flex-col gap-3 rounded-2xl border border-border bg-card p-4', className)} {...p} />

/** A system's state in words, and its status level (contract §4). */
const STATE: Record<SystemStatus, { level: Level; word: string }> = {
  waiting: { level: 'info', word: 'waiting' }, building: { level: 'info', word: 'building' }, built: { level: 'ok', word: 'built' },
  cluster: { level: 'info', word: 'cluster' }, failed: { level: 'error', word: 'failed' }, skipped: { level: 'warning', word: 'skipped' }, cancelled: { level: 'warning', word: 'cancelled' },
}
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '')

function SystemRow({ s, selected, onSelect }: { s: SystemRun; selected: boolean; onSelect: () => void }) {
  const st = STATE[s.status], pct = s.steps ? Math.round((100 * s.step) / s.steps) : 0
  return (
    <button onClick={onSelect} aria-current={selected ? 'true' : undefined} className={cn('grid w-full grid-cols-[minmax(0,1fr)_140px] items-center gap-3 border-b border-border px-4 py-2.5 text-left last:border-0', selected && 'bg-muted shadow-[inset_3px_0_0_var(--state)]')}>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-control"><b>{s.method} / {s.saccharide} / {s.sequence}</b>{s.stage && s.status === 'building' ? ' · ' + s.stage.toUpperCase() : ''}</span>
        <span className="truncate text-caption text-muted-foreground">{s.status === 'building' ? s.label + ' · step ' + (s.step + 1) + ' of ' + s.steps : s.status === 'failed' ? s.error?.split('\n')[0] : s.status === 'cluster' ? s.notes.at(-1)?.startsWith('waits') ? s.notes.at(-1) : 'awh and the pull wait for qq submit' : s.steps ? s.step + ' of ' + s.steps + ' steps' : ''}</span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <Status inline level={st.level} word={st.word} />
        {s.steps > 0 && <span role="progressbar" aria-label={'steps of ' + s.dir} aria-valuemin={0} aria-valuemax={s.steps} aria-valuenow={s.step} className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><span className={cn('block h-full rounded-full', s.status === 'failed' ? 'bg-muted-foreground' : 'bg-[var(--state)]')} style={{ width: pct + '%' }} /></span>}
      </span>
    </button>
  )
}

/** symbuilder · progress (R5c): the last build, its systems one at a time, the step running and what it prints. */
export function ProgressView({ runs, logs, loadLog, onCancel }: { runs: BuildRun[]; logs: Record<string, string>; loadLog: (id: string) => void; onCancel: (id: string) => void }) {
  const run = runs[0]
  const [picked, setPicked] = React.useState<string | null>(null)
  const sel = run && (run.systems.find(s => s.dir === picked) ?? run.systems.find(s => s.status === 'building') ?? run.systems.find(s => s.status === 'failed') ?? run.systems[0])
  const job = sel?.job
  React.useEffect(() => { if (job && logs[job] == null) loadLog(job) }, [job, logs, loadLog])
  if (!run) return <p className="m-0 text-control text-muted-foreground">nothing is building · plan a build in <a className="underline underline-offset-[3px]" href="#symbuilder/systems">systems</a></p>
  const count = (...k: SystemStatus[]) => run.systems.filter(s => k.includes(s.status)).length
  const failed = count('failed')
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1"><h2 className="m-0 text-title">progress</h2>
          <p className="m-0 text-caption text-muted-foreground">the build of {when(run.created)} · {run.plan} · in {run.base} · one system at a time{run.ended ? ' · ended ' + when(run.ended) : ''}</p></div>
        {run.status === 'running' && <Button variant="destructive" onClick={() => onCancel(run.id)}>cancel the build</Button>}
      </div>
      <div className="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">
        <Stat label="systems" value={run.systems.length} hint={count('waiting') + ' waiting'} />
        <Stat label="built" value={count('built', 'cluster')} hint={count('cluster') + ' wait for the cluster'} />
        <Stat label="building" value={count('building')} hint={run.status === 'running' ? 'now' : run.status} />
        <Stat label="failed" value={failed} hint={count('skipped', 'cancelled') + ' skipped or cancelled'} />
      </div>
      {run.status === 'interrupted' && <Status level="warning" word="check">gmx-cypher stopped while this build ran: what was building is marked cancelled; its folder is as it was left</Status>}
      {failed > 0 && <Status level="error" word="failed">{failed === 1 ? 'one system' : failed + ' systems'} stopped at a step: the system, its stage and GROMACS's own text are below</Status>}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-start gap-5 max-[1100px]:grid-cols-1">
        <div className="flex flex-col gap-2">
          <Head label="systems" n={run.systems.length} />
          <div className="overflow-hidden rounded-2xl border border-border bg-card">{run.systems.map(s => <SystemRow key={s.dir} s={s} selected={s === sel} onSelect={() => setPicked(s.dir)} />)}</div>
        </div>
        {sel && (
          <Panel aria-label={'the system ' + sel.dir}>
            <div className="flex items-center justify-between gap-3"><b className="text-heading">{sel.sequence}</b><Status inline level={STATE[sel.status].level} word={STATE[sel.status].word} /></div>
            <span className="text-caption text-muted-foreground">{sel.dir} · its record is build.json in that folder</span>
            {sel.error && <Status level="error" word="error"><span className="whitespace-pre-wrap">{sel.error}</span></Status>}
            {sel.notes.map(n => <Status key={n} level="info" word="note">{n}</Status>)}
            {sel.submit.length > 0 && <>
              <Head label="qq submit" n={sel.submit.length} />
              <span className="text-caption text-muted-foreground">nothing is submitted for you: run each where qq works, from the base folder</span>
              <pre className="m-0 overflow-x-auto rounded-xl border border-border bg-background px-3 py-2 text-caption">{sel.submit.join('\n')}</pre>
              <Button size="sm" variant="outline" className="w-fit" onClick={() => void navigator.clipboard?.writeText(sel.submit.join('\n'))}>copy the submit lines</Button>
            </>}
            {job && <>
              <Head label={'log · ' + (sel.label ?? '')} />
              <pre aria-live="off" className="m-0 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-background px-3 py-2 text-caption">{(logs[job] ?? '').split('\n').slice(-60).join('\n') || 'nothing printed yet'}</pre>
            </>}
          </Panel>
        )}
      </div>
    </div>
  )
}
