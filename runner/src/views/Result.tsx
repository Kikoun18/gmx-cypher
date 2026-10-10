import * as React from 'react'
import { TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Button } from '../ui/button'
import { Stat } from '../ui/card'
import { DASH, LineChart, type ChartSeries } from '../ui/line-chart'
import { Section } from '../ui/separator'
import { getJson } from '../api'
import { estimateOf, type Job } from '../jobs'
import { awhTargetError } from '../lib/awh'
import { neighbourOverlaps, overlapNotes, parseBootstrap, parseHistograms } from '../lib/wham'
import { COMMANDS } from '../lib/commands'
import { driftLarger, type EnergyRow } from '../lib/energy'
import { curveStats } from '../lib/curves'
import { firstPeak, resultSeries } from '../lib/rdf'
import { parseTable } from '../../../app/src/lib/seq'
import type { RunRecord } from '../lib/record'
import { toneText, toneVar, type Tone } from '../lib/tones'
import { cn } from '../lib/utils'
import { SendDialog } from './SendDialog'

const size = (n: number) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' kB' : (n / 1048576).toFixed(1) + ' MB')

/** A job that is a run of one of the commands (rdf, energy…): the ones with a record and a result. */
const isRun = (kind: string) => COMMANDS.some(c => c.tool === kind)

/** The run record of an ended run (T31): read from the server once the job has ended. */
function useRecord(job: Job) {
  const [r, setR] = React.useState<{ id: string; record?: RunRecord; error?: string } | null>(null)
  React.useEffect(() => {
    if (!isRun(job.kind) || !job.ended) return
    let alive = true
    // The record is written just after the job's end event; the server's answer waits for it.
    getJson<RunRecord>('/api/jobs/' + job.id + '/record').then(record => alive && setR({ id: job.id, record }), e => alive && setR({ id: job.id, error: (e as Error).message }))
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

const fmt = (x: number | null) => (x != null && Number.isFinite(x) ? x.toLocaleString('en', { maximumSignificantDigits: 5 }) : '—')

const TONES_FOR_TERMS: Tone[] = ['coral', 'sky', 'mint', 'butter', 'lilac', 'aqua', 'rose', 'stone']

/**
 * gmx energy's result (R4): a chart per term, since terms differ by orders of magnitude (Bond ≈ 10², Potential ≈ −10⁴
 * kJ/mol on the test file), and a tile per term with its average, error estimate, RMSD and drift.
 */
function EnergyChart({ job, record }: { job: Job; record: RunRecord }) {
  const xvg = useOutput(job.id, 'xvg')
  const curves = React.useMemo(() => (xvg ? resultSeries(xvg) : []), [xvg])
  const rows: EnergyRow[] = record.statistics?.rows ?? [], stats = record.statistics
  const flagged = rows.filter(driftLarger)
  if (!xvg) return <p className="m-0 text-caption text-muted-foreground" aria-live="polite">reading {String((job.meta?.names as { xvg: string })?.xvg)}…</p>
  const b = Number(record.options.find(o => o.flag === 'b')?.value) || 0
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-4">
        {curves.map((c, i) => (
          <div key={c.label} className="flex min-w-0 flex-col gap-1">
            <span className={cn('text-label uppercase', toneText[TONES_FOR_TERMS[i % TONES_FOR_TERMS.length]])}>{c.label}</span>
            <LineChart series={[{ label: c.label, points: c.points, tone: TONES_FOR_TERMS[i % TONES_FOR_TERMS.length] }]} xLabel="time (ps)" yLabel={rows.find(r => r.name === c.label)?.unit ?? ''} height={180} legend={false} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {rows.map(r => (
          <Stat key={r.name} label={r.name + ' · average'} value={fmt(r.average) + ' ' + r.unit} hint={(r.errEst == null ? 'no error estimate (too few frames)' : '± ' + fmt(r.errEst) + ' Err.Est.') + ' · RMSD ' + fmt(r.rmsd) + ' · drift ' + fmt(r.drift) + (driftLarger(r) ? ' · larger than its error' : '')} />
        ))}
        {stats && <Stat label="frames" value={String(stats.frames)} hint={stats.t0 + '–' + stats.t1 + ' ps · ' + stats.steps + ' steps'} />}
      </div>
      {flagged.length > 0 && <p className="m-0 text-control text-butter-strong">{flagged.map(r => r.name).join(', ')}: the drift is larger than the error estimate, so the average is not steady within its error</p>}
      <p className="m-0 text-caption text-muted-foreground">{b > 0 ? 'first ' + b + ' ps left out · ' : ''}{record.options.filter(o => !o.isDefault && o.flag !== 'b').map(o => '-' + o.flag + (o.value === true ? '' : ' ' + o.value)).join(' · ') || 'gmx energy defaults'}</p>
    </div>
  )
}

/** At most `n` of a run's frames for one chart, evenly spaced, the last always among them. */
function spread<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items
  return [...new Set(Array.from({ length: n }, (_, i) => Math.round((i * (items.length - 1)) / (n - 1))))].map(i => items[i])
}

/**
 * gmx awh's result (R5): the PMF of each frame written, on one chart, oldest to newest. Eight tones, then the same
 * tones dashed; at most 12 curves (evenly spaced, the last always in), so a long run stays readable.
 */
function AwhChart({ job, record }: { job: Job; record: RunRecord }) {
  const names = React.useMemo(() => record.outputs.filter(o => o.kind === 'xvg').map(o => o.path.split('/').pop()!), [record])
  const shown = React.useMemo(() => spread(names, 12), [names])
  const [texts, setTexts] = React.useState<Record<string, string>>({})
  React.useEffect(() => {
    let alive = true
    for (const n of shown) fetch('/api/jobs/' + job.id + '/output?name=' + encodeURIComponent(n)).then(r => (r.ok ? r.text() : '')).then(t => alive && setTexts(x => ({ ...x, [n]: t })), () => {})
    return () => { alive = false }
  }, [job.id, shown])
  if (shown.some(n => texts[n] == null)) return <p className="m-0 text-caption text-muted-foreground" aria-live="polite">reading {shown.length} PMF file{shown.length > 1 ? 's' : ''}…</p>
  const time = (n: string) => /_t(-?\d+(?:\.\d+)?)\.xvg$/.exec(n)?.[1] ?? '?'
  const series: ChartSeries[] = shown.map((n, i) => ({ label: 't = ' + time(n) + ' ps', points: resultSeries(texts[n])[0]?.points ?? [], tone: TONES_FOR_TERMS[i % 8], dash: Math.floor(i / 8) }))
  const last = texts[shown[shown.length - 1]], target = awhTargetError(last), xLabel = parseTable(last).head.xLabel || 'coordinate'
  return (
    <div className="flex flex-col gap-3">
      <LineChart series={series} xLabel={xLabel} yLabel="PMF (kJ/mol)" height={300} legend={series.length > 1} />
      {names.length > shown.length && <p className="m-0 text-caption text-muted-foreground">{shown.length} of {names.length} frames drawn, evenly spaced; every file is in the folder</p>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        <Stat label="frames written" value={String(names.length)} hint={'t = ' + time(names[0]) + (names.length > 1 ? ' … ' + time(names[names.length - 1]) : '') + ' ps · one PMF file each'} />
        {target && <Stat label="target error · last frame" value={target.kJ + ' kJ/mol'} hint={target.kT + ' kT · from the AWH metadata of ' + names[names.length - 1]} />}
      </div>
    </div>
  )
}

/** One of a run's own files, by name (GET /api/jobs/:id/output?name=); null until read, '' when there is none. */
function useNamed(id: string, name: string | null) {
  const [t, setT] = React.useState<{ key: string; text: string } | null>(null)
  const key = id + '\0' + name
  React.useEffect(() => {
    if (!name) return
    let alive = true
    fetch('/api/jobs/' + id + '/output?name=' + encodeURIComponent(name)).then(r => (r.ok ? r.text() : '')).then(text => alive && setT({ key, text }), () => {})
    return () => { alive = false }
  }, [id, name, key])
  return !name ? '' : t?.key === key ? t.text : null
}

/**
 * gmx wham's result (R6): the profile with its bootstrap band, the histograms of the windows, and the overlap of each
 * pair of neighbours (sorted by where each histogram peaks), as numbers: gaps are named, no other verdict (question 29).
 */
function WhamChart({ job, record }: { job: Job; record: RunRecord }) {
  const file = (end: string) => record.outputs.map(o => o.path.split('/').pop()!).find(n => n.endsWith(end)) ?? null
  const histo = useOutput(job.id, 'xvg'), profile = useNamed(job.id, file('_profile.xvg')), bsres = useNamed(job.id, file('_bsres.xvg'))
  const labels = (record.windows ?? []).map(w => w.tpr.path.split('/').slice(-2, -1)[0] || w.tpr.path.split('/').pop()!)
  const label = (n: number) => n + (labels[n - 1] ? ' (' + labels[n - 1] + ')' : '')
  const h = React.useMemo(() => (histo ? parseHistograms(histo) : null), [histo])
  const ov = React.useMemo(() => (h ? neighbourOverlaps(h) : null), [h])
  if (histo == null || profile == null || bsres == null) return <p className="m-0 text-caption text-muted-foreground" aria-live="polite">reading the profile and the histograms…</p>
  const prof = resultSeries(profile)[0]?.points ?? [], bs = parseBootstrap(bsres)
  // The band is the bootstrap's standard deviation at each point of the profile (the same bins).
  const errors = bs.length === prof.length ? bs.map(b => b[2]) : undefined
  const hist: ChartSeries[] = h!.windows.map((c, j) => ({ label: 'window ' + label(j + 1), points: h!.x.map((x, i) => [x, c[i]] as [number, number]), tone: TONES_FOR_TERMS[j % 8], dash: Math.floor(j / 8) }))
  return (
    <div className="flex flex-col gap-3">
      <LineChart series={[{ label: 'profile', points: prof, tone: 'coral', ...(errors ? { errors } : {}) }]} xLabel="ξ (nm)" yLabel="E (kJ/mol)" height={260} legend={false} />
      <p className="m-0 text-caption text-muted-foreground">{errors ? 'the band: ± one standard deviation over ' + (record.options.find(o => o.flag === 'nBootstrap')?.value ?? '') + ' bootstraps' : 'no error estimate: run with bootstraps for one'} · the profile is not sent to the vault until you decide (question 28)</p>
      <Section label={'Histograms · ' + h!.windows.length + ' windows'} />
      <LineChart series={hist} xLabel="ξ (nm)" yLabel="count" height={220} legend={false} zeroLine={false} />
      <Section label="Overlap of neighbouring windows" />
      <table className="text-control" aria-label="overlap of neighbouring windows">
        <thead><tr className="text-left text-label uppercase text-muted-foreground"><th className="py-1 pr-4 font-normal">windows</th><th className="pr-4 font-normal">peaks at</th><th className="font-normal">overlap</th></tr></thead>
        <tbody>
          {ov!.pairs.map(p => (
            <tr key={p.a + '-' + p.b} className="border-t border-border">
              <td className="py-0.5 pr-4">{label(p.a)} – {label(p.b)}</td>
              <td className="pr-4 text-muted-foreground">{ov!.peaks[p.a - 1].toFixed(3)} – {ov!.peaks[p.b - 1].toFixed(3)} nm</td>
              <td className={cn('font-bold', p.overlap === 0 && 'text-destructive')}>{p.overlap.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {overlapNotes(ov!.pairs).map(n => <p key={n} className={cn('m-0 text-control', n.includes('do not overlap') ? 'text-destructive' : 'text-muted-foreground')}>{n}</p>)}
      <p className="m-0 text-caption text-muted-foreground">overlap: the share two neighbours' normalised histograms have in common, 0 to 1 · no threshold is applied until you choose one (question 29)</p>
    </div>
  )
}

/**
 * gmx distance's result (R7): the average distance from the reference to each selection over time, in the groups'
 * hues; a tile per selection with what gmx printed (average ± standard deviation over all samples); the histogram.
 */
function DistanceChart({ job, record }: { job: Job; record: RunRecord }) {
  const xvg = useOutput(job.id, 'xvg'), hist = useNamed(job.id, record.outputs.map(o => o.path.split('/').pop()!).find(n => n.endsWith('_hist.xvg')) ?? null)
  if (xvg == null || hist == null) return <p className="m-0 text-caption text-muted-foreground" aria-live="polite">reading the distances…</p>
  const sels = record.groups.slice(1), ref = record.groups[0]
  const measure = String(record.options.find(o => o.flag === 'measure')?.value ?? 'com')
  const named = (text: string, xLabel: string, yLabel: string) => {
    const series: ChartSeries[] = resultSeries(text).map((c, i) => ({ label: sels[i]?.name ?? c.label, points: c.points, tone: sels[i]?.tone }))
    return <LineChart series={series} xLabel={xLabel} yLabel={yLabel} height={240} legend zeroLine={false} />
  }
  return (
    <div className="flex flex-col gap-3">
      {named(xvg, 'time (ps)', measure === 'pairs' ? 'average over pairs (nm)' : 'distance (nm)')}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {(record.distances ?? []).map((d, i) => (
          <Stat key={i} label={(sels[i]?.name ?? d.selection) + ' · average'} value={d.average.toFixed(3) + ' nm'} hint={'± ' + d.sd.toFixed(3) + ' nm (standard deviation) · ' + d.samples + ' samples · ' + d.selection} />
        ))}
      </div>
      <p className="m-0 text-caption text-muted-foreground">
        {measure === 'pairs' ? 'atom k of ' + ref.name + ' with atom k of each selection' : 'between the centres of ' + (measure === 'com' ? 'mass' : 'geometry') + ' of ' + ref.name + ' and of each selection'}
        {sels.length > 1 ? ' · PMF Sequences takes the first curve of a distance file' : ''}
      </p>
      {hist && <>
        <Section label="Histogram" />
        {named(hist, 'distance (nm)', 'probability')}
        <p className="m-0 text-caption text-muted-foreground">not sent to the vault: PMF Sequences would read it as an umbrella histogram</p>
      </>}
    </div>
  )
}

/**
 * gmx hbond's result (R8), from either tool: the H-bonds over time (and the legacy tool's pairs within its distance,
 * dimmed), their mean per frame, what gmx printed of donors and acceptors, and the distributions asked for.
 */
function HbondChart({ job, record }: { job: Job; record: RunRecord }) {
  const files = record.outputs.map(o => o.path.split('/').pop()!), named = (suffix: string) => files.find(n => n.endsWith(suffix)) ?? null
  const xvg = useOutput(job.id, 'xvg'), dist = useNamed(job.id, named('_dist.xvg')), ang = useNamed(job.id, named('_ang.xvg')), dan = useNamed(job.id, named('_dan.xvg'))
  if (xvg == null || dist == null || ang == null || dan == null) return <p className="m-0 text-caption text-muted-foreground" aria-live="polite">reading the H-bonds…</p>
  const [ref, target] = record.groups, curves = resultSeries(xvg), stats = curveStats(curves[0]?.points ?? [])
  const series: ChartSeries[] = curves.map((c, i) => ({ label: i ? c.label.toLowerCase() : 'H-bonds', points: c.points, tone: target?.tone ?? 'coral', ...(i ? { dash: 1, state: 'dim' as const } : {}) }))
  const legacy = record.analysis === 'hbond-legacy'
  const distribution = (text: string, label: string, xLabel: string, yLabel: string) => <>
    <Section label={label} />
    <LineChart series={resultSeries(text).map((c, i) => ({ label: c.label, points: c.points, tone: i ? 'sky' : target?.tone ?? 'coral', ...(i ? { dash: 1 } : {}) }))} xLabel={xLabel} yLabel={yLabel} height={200} legend={resultSeries(text).length > 1} zeroLine={false} />
  </>
  return (
    <div className="flex flex-col gap-3">
      <LineChart series={series} xLabel="time (ps)" yLabel="H-bonds" height={240} legend={series.length > 1} zeroLine={false} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {stats && <Stat label="H-bonds · mean per frame" value={stats.mean.toFixed(1)} hint={'from ' + stats.min + ' to ' + stats.max + ' · ' + stats.frames + ' frames'} />}
        {(record.summary ?? []).map(l => <Stat key={l} label="gmx printed" value={<span className="text-control">{l}</span>} />)}
      </div>
      <p className="m-0 text-caption text-muted-foreground">
        between {ref?.name} and {target?.name} · {legacy ? 'legacy criteria (' + (record.command.args[0] === 'hbond' ? 'gmx hbond of this GROMACS' : 'gmx hbond-legacy') + ')' : 'the selection tool, gmx hbond'} · the count over time is the file for the vault
      </p>
      {/* Both tools write densities: each integrates to 1 (checked on their 2025.4 output). */}
      {dist && distribution(dist, 'Distance distribution', legacy ? 'donor – acceptor (nm)' : 'distance (nm)', 'density (1/nm)')}
      {ang && distribution(ang, 'Angle distribution', 'angle (°)', 'density (1/°)')}
      {dan && distribution(dan, 'Donors and acceptors', 'time (ps)', 'number')}
      {(dist || ang || dan) && <p className="m-0 text-caption text-muted-foreground">not sent to the vault: PMF Sequences would read these as an umbrella histogram or as H-bonds</p>}
    </div>
  )
}

/**
 * A quantity per group over time (R9), one curve each in the group's tone, and a tile each: the mean with its standard
 * deviation over the frames, and the last value. `groups` are the curves' groups, in the file's column order.
 */
function GroupSeries({ job, groups, yLabel, unit, note }: { job: Job; groups: { name: string; tone: Tone }[]; yLabel: string; unit: string; note: string }) {
  const xvg = useOutput(job.id, 'xvg')
  if (xvg == null) return <p className="m-0 text-caption text-muted-foreground" aria-live="polite">reading the result…</p>
  const curves = resultSeries(xvg), at = (i: number) => groups[i] ?? { name: curves[i].label, tone: TONES_FOR_TERMS[i % 8] }
  return (
    <div className="flex flex-col gap-3">
      <LineChart series={curves.map((c, i) => ({ label: at(i).name, points: c.points, tone: at(i).tone }))} xLabel="time (ps)" yLabel={yLabel} height={240} legend={curves.length > 1} zeroLine={false} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {curves.map((c, i) => {
          const st = curveStats(c.points)
          return st && <Stat key={i} label={at(i).name + ' · mean'} value={st.mean.toFixed(3) + ' ' + unit} hint={'± ' + st.sd.toFixed(3) + ' (standard deviation) · last ' + st.last.toFixed(3) + ' · ' + st.frames + ' frames'} />
        })}
      </div>
      <p className="m-0 text-caption text-muted-foreground">{note}</p>
    </div>
  )
}

/** gmx rms (R9a): the fit group's RMSD and each further group's, after the fit. */
function RmsChart({ job, record }: { job: Job; record: RunRecord }) {
  const fit = String(record.options.find(o => o.flag === 'fit')?.value ?? 'rot+trans'), prev = Number(record.options.find(o => o.flag === 'prev')?.value ?? 0)
  const against = prev > 0 ? 'the frame ' + prev + ' frame' + (prev > 1 ? 's' : '') + ' before' : "the run input's structure"
  const how = fit === 'none' ? 'without a fit' : 'after a fit of ' + record.groups[0]?.name + ' (' + (fit === 'translation' ? 'translation only' : 'rotation and translation') + ')'
  return <GroupSeries job={job} groups={record.groups} yLabel="RMSD (nm)" unit="nm" note={'against ' + against + ', ' + how + (record.groups.length > 1 ? ' · PMF Sequences takes the first curve, ' + record.groups[0].name : '')} />
}

/** gmx rmsf (R9b): the fluctuation along the group's atoms or residues, its highest point marked. */
function RmsfChart({ job, record }: { job: Job; record: RunRecord }) {
  const xvg = useOutput(job.id, 'xvg')
  if (xvg == null) return <p className="m-0 text-caption text-muted-foreground" aria-live="polite">reading the result…</p>
  const curve = resultSeries(xvg)[0], st = curve && curveStats(curve.points), g = record.groups[0]
  const res = record.options.find(o => o.flag === 'res')?.value === true, fit = record.options.find(o => o.flag === 'fit')?.value !== false, unit = res ? 'residue' : 'atom'
  const top = curve?.points.reduce((a, p) => (p[1] > a[1] ? p : a), curve.points[0])
  return (
    <div className="flex flex-col gap-3">
      {curve && <LineChart series={[{ label: g?.name ?? 'RMSF', points: curve.points, tone: g?.tone ?? 'coral', marker: 'max', markerLabel: 'x' }]} xLabel={unit + ' (number in the system)'} yLabel="RMSF (nm)" height={240} legend={false} zeroLine={false} />}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {st && <Stat label={'mean over ' + st.frames + ' ' + unit + 's'} value={st.mean.toFixed(3) + ' nm'} hint={'± ' + st.sd.toFixed(3) + ' (standard deviation) · lowest ' + st.min.toFixed(3)} />}
        {top && <Stat label={'highest · ' + unit + ' ' + top[0]} value={top[1].toFixed(3) + ' nm'} hint={g?.name} />}
      </div>
      <p className="m-0 text-caption text-muted-foreground">
        per {unit} of {g?.name}, {fit ? "after a fit onto the run input's structure" : 'without a fit: the group\'s own motion is included'} · PMF Sequences labels this x "Residue"{res ? '' : ', though here it is atoms'}
      </p>
    </div>
  )
}

/** What a run wrote, its result, its groups as gmx counted them, and "run again" (sections 10.5, 11.4). */
export function RunResult({ job, onRunAgain, vault }: { job: Job; onRunAgain: (r: RunRecord) => void; vault: string | null }) {
  const r = useRecord(job)
  const [sending, setSending] = React.useState(false)
  const sendButton = React.useRef<HTMLButtonElement>(null)
  if (!isRun(job.kind) || !job.ended) return null
  if (!r) return <p className="m-0 text-caption text-muted-foreground" aria-live="polite">reading the run record…</p>
  if (r.error) return <p className="m-0 text-caption text-muted-foreground">no run record: {r.error}</p>
  const rec = r.record!, dir = (job.meta?.outDir as string) || ''
  return (
    <div className="flex flex-col gap-3">
      {rec.problems.length > 0 && (
        <Alert variant="warning"><TriangleAlert /><AlertTitle>gmx-cypher's promise was broken</AlertTitle><AlertDescription>{rec.problems.map(p => <p key={p}>{p}</p>)}</AlertDescription></Alert>
      )}
      {job.status === 'done' && (job.kind === 'energy' ? <EnergyChart job={job} record={rec} /> : job.kind === 'awh' ? <AwhChart job={job} record={rec} /> : job.kind === 'wham' ? <WhamChart job={job} record={rec} /> : job.kind === 'distance' ? <DistanceChart job={job} record={rec} /> : job.kind === 'hbond' || job.kind === 'hbond-legacy' ? <HbondChart job={job} record={rec} /> : job.kind === 'rms' ? <RmsChart job={job} record={rec} /> : job.kind === 'rmsf' ? <RmsfChart job={job} record={rec} /> : <RdfChart job={job} record={rec} />)}
      {rec.groups.length > 0 && <Section label="Groups" />}
      {rec.groups.length > 0 && <table className="text-control"><tbody>
        {rec.groups.map(g => (
          <tr key={g.index}>
            <td className="py-0.5 pr-4 text-muted-foreground">group {g.index}</td>
            <td className={cn('pr-4 font-bold', toneText[g.tone])}>{g.name}</td>
            <td className="pr-4 text-right">{g.count} atoms</td>
            <td className="text-caption text-muted-foreground">{g.gmxCount === g.count ? '✓ gmx agrees' : 'gmx: ' + g.gmxCount} · {g.atoms.length > 40 ? g.atoms.slice(0, 40) + '…' : g.atoms}</td>
          </tr>
        ))}
      </tbody></table>}
      <Section label="Files"><span className="text-caption text-muted-foreground">{dir}</span></Section>
      <table className="text-control"><tbody>
        {[...rec.outputs.map(o => ({ name: o.path.split('/').pop()!, size: size(o.size), hash: 'sha256 ' + o.sha256.slice(0, 12) + '…' })), { name: String(job.meta?.record ?? '').split('/').pop()!, size: '', hash: 'this record' }].map(f => (
          <tr key={f.name}><td className="py-0.5 pr-4">{f.name}</td><td className="pr-4 text-right text-muted-foreground">{f.size}</td><td className="text-caption text-muted-foreground">{f.hash}</td></tr>
        ))}
      </tbody></table>
      <div className="flex flex-wrap items-center gap-3">
        {job.status === 'done' && vault && <Button ref={sendButton} onClick={() => setSending(true)}>send to vault…</Button>}
        <Button variant="outline" onClick={() => onRunAgain(rec)}>run again</Button>
        <span className="text-caption text-muted-foreground">{job.status === 'done' && !vault ? 'set a PMF Sequences vault in settings to send this result · ' : ''}run again opens this recipe in {rec.analysis ?? 'rdf'}; the new run gets new names</span>
      </div>
      {vault && <SendDialog job={job} open={sending} onOpenChange={setSending} returnFocus={sendButton} />}
    </div>
  )
}
