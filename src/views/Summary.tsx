import * as React from 'react'
import { getJson } from '../api'
import type { BuildRun } from '../builds'
import type { Level } from '../core/contract'
import type { SummaryRow, WalkerMark } from '../lib/build/report'
import { timedelta } from '../lib/build/report'
import { toneSoft } from '../lib/tones'
import { cn } from '../lib/utils'
import { Button } from '../ui/button'
import { Stat } from '../ui/card'
import { Status } from '../ui/status'

/** What GET /api/build/runs/:id/report answers (server/build-report.ts). */
export interface BuildReport {
  summary: string; rows: SummaryRow[]; log: string | null
  pull: string; pullRows: { name: string; charge: number | null; min: number | null; max: number | null }[]
  walkers: string; walkerRows: { name: string; marks: WalkerMark[] }[]
  termini: string; terminiRows: { name: string; line: string; odd: boolean; missing?: boolean }[]
}

const Head = ({ label, n }: { label: string; n?: number }) => (
  <div className="flex items-center gap-2"><span className="text-label uppercase text-muted-foreground">{label}</span><span className="h-px flex-1 bg-border" />{n != null && <span className="text-control">{String(n).padStart(2, '0')}</span>}</div>
)
const LEVEL: Record<SummaryRow['status'], Level> = { OK: 'ok', FAILED: 'error', SKIPPED: 'warning', RETRIED: 'info' }
const MARK: Record<WalkerMark, { tone: string; word: string }> = { x: { tone: toneSoft.mint, word: 'output' }, o: { tone: toneSoft.butter, word: 'tpr ready' }, '-': { tone: 'bg-muted text-muted-foreground', word: 'missing' } }
const f2 = (v: number | null) => (v == null ? '–' : v.toFixed(2))

/** The reports of one build (R9): as the page shows them, and as the notebook printed them. */
export function SummaryReport({ report }: { report: BuildReport }) {
  const r = report.rows, n = (s: SummaryRow['status']) => r.filter(x => x.status === s).length
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">
        <Stat label="systems" value={r.length} hint={n('OK') + ' ok'} /><Stat label="failed" value={n('FAILED')} hint="the stage and GROMACS's text below" />
        <Stat label="skipped" value={n('SKIPPED')} hint="left as they were, or cancelled" /><Stat label="retried" value={n('RETRIED')} hint="taken again by a later build" />
      </div>
      <section aria-label="build summary" className="flex flex-col gap-2">
        <Head label="build summary" n={r.length} />
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-caption">
            <thead><tr className="border-b border-border text-left text-label uppercase text-muted-foreground">{['system', 'charge', 'ions', 'min', 'time', 'status', 'warnings by stage'].map(h => <th key={h} scope="col" className="px-3 py-1.5 font-normal">{h}</th>)}</tr></thead>
            <tbody>{r.map(x => (
              <React.Fragment key={x.name + x.status + x.elapsed}>
                <tr className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-1.5"><b>{x.name}</b></td>
                  <td className="px-3 tabular-nums">{x.charge == null ? '' : (x.charge >= 0 ? '+' : '') + x.charge.toFixed(1)}</td>
                  <td className="px-3 tabular-nums">{x.ions ? x.ions.join('/') : ''}</td>
                  <td className="px-3 tabular-nums">{x.min == null ? '' : x.min.toFixed(2)}</td>
                  <td className="px-3 tabular-nums">{timedelta(x.elapsed)}</td>
                  <td className="px-3"><Status inline level={LEVEL[x.status]} word={x.status.toLowerCase()} /></td>
                  <td className="px-3">{x.warn.map(([k, v]) => k + ' ' + v).join(' · ')}</td>
                </tr>
                {x.note && <tr><td colSpan={7} className="px-3 pb-2"><span className="whitespace-pre-wrap text-muted-foreground">{x.note}</span></td></tr>}
              </React.Fragment>
            ))}</tbody>
          </table>
        </div>
        <span className="text-caption text-muted-foreground">warnings by stage are GROMACS's WARNING and NOTE lines, counted as the notebook counts them · {report.log ? 'written to ' + report.log + ' in the base folder' : 'written to logs/ in the base folder when the build ends'}</span>
      </section>
      <div className="grid grid-cols-2 items-start gap-5 max-[1100px]:grid-cols-1">
        <section aria-label="pull report" className="flex flex-col gap-2">
          <Head label="pull report" n={report.pullRows.length} />
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="grid grid-cols-[minmax(0,1fr)_70px_60px_60px] gap-2 border-b border-border px-3 py-1.5 text-label uppercase text-muted-foreground"><span>system</span><span>charge</span><span>min</span><span>max</span></div>
            {report.pullRows.map(p => <div key={p.name} className="grid grid-cols-[minmax(0,1fr)_70px_60px_60px] gap-2 border-b border-border px-3 py-1.5 text-caption tabular-nums last:border-0"><span className="truncate">{p.name}</span><span>{p.charge == null ? '–' : (p.charge >= 0 ? '+' : '') + p.charge.toFixed(2)}</span><span>{f2(p.min)}</span><span>{f2(p.max)}</span></div>)}
          </div>
          <span className="text-caption text-muted-foreground">charge from grompp on 6.eqnpt.gro · the shortest and longest distance in 8.pull/pullx.xvg, once the cluster made it</span>
        </section>
        <section aria-label="walker report" className="flex flex-col gap-2">
          <Head label="walker report" n={report.walkerRows.length} />
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {report.walkerRows.map(w => (
              <div key={w.name} className="flex items-center justify-between gap-3 border-b border-border px-3 py-1.5 text-caption last:border-0">
                <span className="truncate">{w.name}</span>
                <span className="flex gap-1">{w.marks.map((m, i) => <span key={i} title={'walker ' + (i + 1) + ': ' + MARK[m].word} aria-label={'walker ' + (i + 1) + ': ' + MARK[m].word} className={cn('grid size-5 place-items-center rounded font-mono text-[11px]', MARK[m].tone)}>{m}</span>)}</span>
              </div>
            ))}
          </div>
          <span className="text-caption text-muted-foreground">x the walker has output · o its run input is ready · – missing</span>
        </section>
      </div>
      <section aria-label="termini" className="flex flex-col gap-2">
        <Head label="termini" n={report.terminiRows.length} />
        {report.terminiRows.some(t => t.odd) && <Status level="warning" word="check">{report.terminiRows.filter(t => t.odd).length} not NH3+/COO-, or a peptide charge off the ions' 0.75 e (a proline start is PRO-NH2+, as the notebook shows)</Status>}
        {report.terminiRows.some(t => t.missing) && <Status level="info" word="note">{report.terminiRows.filter(t => t.missing).length} with no Protein moleculetype in its topology, so no termini to read</Status>}
        <pre className="m-0 overflow-x-auto rounded-xl border border-border bg-background px-3 py-2 text-caption">{report.termini}</pre>
      </section>
      <section aria-label="the summary as text" className="flex flex-col gap-2">
        <Head label="as the notebook prints it" />
        <pre className="m-0 overflow-x-auto rounded-xl border border-border bg-background px-3 py-2 text-caption">{report.summary}</pre>
        <Button size="sm" variant="outline" className="w-fit" onClick={() => void navigator.clipboard?.writeText(report.summary)}>copy the summary</Button>
      </section>
    </div>
  )
}

/** symbuilder · summary (R9): the last build's reports, read when it opens and again when that build changes. */
export function SummaryView({ runs }: { runs: BuildRun[] }) {
  const run = runs[0], [read, setRead] = React.useState<{ key: string; report: BuildReport } | null>(null), [error, setError] = React.useState('')
  const key = run ? run.id + ' ' + run.status + ' ' + (run.ended ?? '') : ''
  React.useEffect(() => {
    if (!run) return
    let alive = true
    getJson<BuildReport>('/api/build/runs/' + run.id + '/report').then(r => { if (alive) { setRead({ key, report: r }); setError('') } }, e => alive && setError((e as Error).message))
    return () => { alive = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- read again when the build's state changes, keyed by it
  if (!run) return <p className="m-0 text-control text-muted-foreground">no build yet · its summary, pull and walker reports and termini come here</p>
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1"><h2 className="m-0 text-title">summary</h2>
        <p className="m-0 text-caption text-muted-foreground">the build of {new Date(run.created).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {run.plan} · read from solutions/{'{method}'}/{'{saccharide}'}/{'{sequence}'}{run.status === 'running' ? ' · still building' : ''}</p></div>
      {error && <Status level="error">{error}</Status>}
      {read?.key === key ? <SummaryReport report={read.report} /> : !error && <p className="m-0 text-caption text-muted-foreground" aria-live="polite">reading the reports…</p>}
    </div>
  )
}
