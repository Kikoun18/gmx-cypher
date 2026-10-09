import * as React from 'react'
import { TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Button } from '../ui/button'
import { Stat } from '../ui/card'
import { DASH, LineChart, type ChartSeries } from '../ui/line-chart'
import { Section } from '../ui/separator'
import { getJson } from '../api'
import { estimateOf, type Job } from '../jobs'
import { firstPeak, resultSeries } from '../lib/rdf'
import type { RunRecord } from '../lib/record'
import { toneText, toneVar, type Tone } from '../lib/tones'
import { cn } from '../lib/utils'
import { SendDialog } from './SendDialog'

const size = (n: number) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' kB' : (n / 1048576).toFixed(1) + ' MB')

/** The run record of an ended rdf job (T31): read from the server once the job has ended. */
function useRecord(job: Job) {
  const [r, setR] = React.useState<{ id: string; record?: RunRecord; error?: string } | null>(null)
  React.useEffect(() => {
    if (job.kind !== 'rdf' || !job.ended) return
    let alive = true
    // The record is written just after the job's end event: ask again shortly if it isn't there yet.
    const read = (left: number) => getJson<RunRecord>('/api/jobs/' + job.id + '/record').then(record => alive && setR({ id: job.id, record }),
      e => { if (!alive) return; if (left) setTimeout(() => read(left - 1), 300); else setR({ id: job.id, error: (e as Error).message }) })
    read(10)
    return () => { alive = false }
  }, [job.id, job.kind, job.ended])
  return r?.id === job.id ? r : null
}

/** A run's .xvg text, by kind. */
function useOutput(id: string, kind: 'xvg' | 'cn' | null) {
  const [t, setT] = React.useState<{ key: string; text: string } | null>(null)
  const key = id + kind
  React.useEffect(() => {
    if (!kind) return
    let alive = true
    fetch('/api/jobs/' + id + '/output?kind=' + kind).then(r => (r.ok ? r.text() : '')).then(text => alive && setT({ key, text }), () => {})
    return () => { alive = false }
  }, [id, kind, key])
  return t?.key === key ? t.text : null
}

type Shown = 'on' | 'dim' | 'off'
const NEXT: Record<Shown, Shown> = { on: 'dim', dim: 'off', off: 'on' }
const WORD: Record<Shown, string> = { on: 'shown', dim: 'dimmed', off: 'hidden' }

/** Curves in their groups' hues; a click on a name cycles shown → dimmed → hidden, and hidden curves leave the scale. */
function Curves({ text, tones, yLabel, height, shown, setShown, marked = true }: {
  text: string; tones: Tone[]; yLabel: string; height: number; shown: Shown[]; setShown: (s: Shown[]) => void; marked?: boolean
}) {
  const curves = React.useMemo(() => resultSeries(text), [text])
  const series: (ChartSeries & { i: number })[] = curves.map((c, i) => ({ i, label: c.label, points: c.points, tone: tones[i], state: shown[i] ?? 'on', ...(marked ? { marker: 'max' as const, markerLabel: 'x' as const } : {}) }))
  const drawn = series.filter(s => s.state !== 'off')
  return (
    <div className="flex flex-col gap-2">
      {drawn.length ? <LineChart series={drawn} xLabel="r (nm)" yLabel={yLabel} height={height} legend={false} />
        : <p className="m-0 text-caption text-muted-foreground">every curve is hidden</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map(s => (
          <button key={s.i} type="button" aria-label={s.label + ': ' + WORD[s.state!] + '; click to ' + (s.state === 'on' ? 'dim' : s.state === 'dim' ? 'hide' : 'show')}
            onClick={() => setShown(series.map(x => (x.i === s.i ? NEXT[x.state!] : x.state!)))}
            className="inline-flex items-center gap-2 rounded-md px-1 text-caption text-muted-foreground hover:text-foreground" style={{ opacity: s.state === 'on' ? 1 : s.state === 'dim' ? 0.55 : 0.35 }}>
            <svg width={22} height={4} aria-hidden><line x1={1} x2={21} y1={2} y2={2} stroke={toneVar(s.tone!)} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={DASH[0]} /></svg>
            {s.label}{s.state !== 'on' && <span>· {WORD[s.state!]}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Under the chart: the options that change g(r), each in words (section 10.5). */
function optionsLine(r: RunRecord): string {
  const v = (f: string) => r.options.find(o => o.flag === f)?.value
  const nm = (f: string, zero: string) => (Number(v(f)) ? v(f) + ' nm' : zero)
  return [
    'normalisation ' + v('norm'), 'positions ' + v('seltype'), 'exclusions ' + (v('excl') === true ? 'on' : 'off'), 'cut-off ' + nm('cut', '0 nm'),
    'bin ' + v('bin') + ' nm', 'largest r ' + nm('rmax', 'half the box'), 'pbc ' + (v('pbc') === false ? 'no' : 'yes'),
    ...(v('surf') && v('surf') !== 'no' ? ['surface ' + v('surf')] : []), ...(v('xy') === true ? ['x and y only'] : []),
  ].join(' · ')
}

/** g(r) and the cumulative number of a done run, its first peaks and frames (R4c). */
function RdfChart({ job, record }: { job: Job; record: RunRecord }) {
  const xvg = useOutput(job.id, 'xvg'), cn = useOutput(job.id, record.outputs.some(o => o.kind === 'cn') ? 'cn' : null)
  const [shown, setShown] = React.useState<Shown[]>([])
  const tones = record.groups.slice(1).map(g => g.tone)
  const curves = React.useMemo(() => (xvg ? resultSeries(xvg) : []), [xvg])
  if (!xvg) return <p className="m-0 text-caption text-muted-foreground" aria-live="polite">reading {String((job.meta?.names as { xvg: string })?.xvg)}…</p>
  const dt = Number(record.options.find(o => o.flag === 'dt')?.value) || 0, start = estimateOf(job)?.start ?? 0
  return (
    <div className="flex flex-col gap-3">
      <Curves text={xvg} tones={tones} yLabel="g(r)" height={300} shown={shown} setShown={setShown} />
      <p className="m-0 text-caption text-muted-foreground">click a curve's name: shown → dimmed → hidden · the dot marks each curve's maximum</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        {curves.map((c, i) => {
          const p = firstPeak(c.points)
          return <Stat key={i} label={'first peak · ' + c.label} value={p ? p.r.toFixed(3) + ' nm' : '—'} hint={p ? 'g = ' + p.g.toPrecision(3) + (p.rule === 'maximum' ? ' · never above 1: the maximum' : '') : 'g(r) is zero everywhere'} />
        })}
        {record.frames && <Stat label="frames" value={String(record.frames.analysed)} hint={start + '–' + record.frames.lastTime + ' ps · ' + (dt ? 'every ' + dt + ' ps' : 'every frame')} />}
      </div>
      <p className="m-0 text-caption text-muted-foreground">{optionsLine(record)} · reference {record.groups[0].name}</p>
      {cn && <>
        <Section label="Cumulative number" />
        <Curves text={cn} tones={tones} yLabel="n(r)" height={180} shown={shown} setShown={setShown} marked={false} />
      </>}
    </div>
  )
}

/** What a run wrote, its result, its groups as gmx counted them, and "run again" (sections 10.5, 11.4). */
export function RunResult({ job, onRunAgain, vault }: { job: Job; onRunAgain: (r: RunRecord) => void; vault: string | null }) {
  const r = useRecord(job)
  const [sending, setSending] = React.useState(false)
  const sendButton = React.useRef<HTMLButtonElement>(null)
  if (job.kind !== 'rdf' || !job.ended) return null
  if (!r) return <p className="m-0 text-caption text-muted-foreground" aria-live="polite">reading the run record…</p>
  if (r.error) return <p className="m-0 text-caption text-muted-foreground">no run record: {r.error}</p>
  const rec = r.record!, dir = (job.meta?.outDir as string) || ''
  return (
    <div className="flex flex-col gap-3">
      {rec.problems.length > 0 && (
        <Alert variant="warning"><TriangleAlert /><AlertTitle>gmx-cypher's promise was broken</AlertTitle><AlertDescription>{rec.problems.map(p => <p key={p}>{p}</p>)}</AlertDescription></Alert>
      )}
      {job.status === 'done' && <RdfChart job={job} record={rec} />}
      <Section label="Groups" />
      <table className="text-control"><tbody>
        {rec.groups.map(g => (
          <tr key={g.index}>
            <td className="py-0.5 pr-4 text-muted-foreground">group {g.index}</td>
            <td className={cn('pr-4 font-bold', toneText[g.tone])}>{g.name}</td>
            <td className="pr-4 text-right">{g.count} atoms</td>
            <td className="text-caption text-muted-foreground">{g.gmxCount === g.count ? '✓ gmx agrees' : 'gmx: ' + g.gmxCount} · {g.atoms.length > 40 ? g.atoms.slice(0, 40) + '…' : g.atoms}</td>
          </tr>
        ))}
      </tbody></table>
      <Section label="Files"><span className="text-caption text-muted-foreground">{dir}</span></Section>
      <table className="text-control"><tbody>
        {[...rec.outputs.map(o => ({ name: o.path.split('/').pop()!, size: size(o.size), hash: 'sha256 ' + o.sha256.slice(0, 12) + '…' })), { name: String(job.meta?.record ?? '').split('/').pop()!, size: '', hash: 'this record' }].map(f => (
          <tr key={f.name}><td className="py-0.5 pr-4">{f.name}</td><td className="pr-4 text-right text-muted-foreground">{f.size}</td><td className="text-caption text-muted-foreground">{f.hash}</td></tr>
        ))}
      </tbody></table>
      <div className="flex flex-wrap items-center gap-3">
        {job.status === 'done' && vault && <Button ref={sendButton} onClick={() => setSending(true)}>send to vault…</Button>}
        <Button variant="outline" onClick={() => onRunAgain(rec)}>run again</Button>
        <span className="text-caption text-muted-foreground">{job.status === 'done' && !vault ? 'set a PMF Sequences vault in settings to send this result · ' : ''}run again opens this recipe in rdf; the new run gets new names</span>
      </div>
      {vault && <SendDialog job={job} open={sending} onOpenChange={setSending} returnFocus={sendButton} />}
    </div>
  )
}
