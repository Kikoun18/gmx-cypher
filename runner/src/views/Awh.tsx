import * as React from 'react'
import { X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Field, FieldHint, Label } from '../ui/label'
import { Section } from '../ui/separator'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { postJson, type GmxState } from '../api'
import type { Draft } from '../draft'
import { AWH_FORM, framesWritten, frameOptions, type AwhFrame, type FrameChoice } from '../lib/awh'
import { commandText } from '../lib/command'
import { DEFAULT_TEMPLATE } from '../lib/names'
import type { Options } from '../lib/rdf'
import { usePlan } from '../plan'
import { useAwhScan } from '../terms'
import { DEFAULT_PATTERN, FIELD_LABEL, parseName } from '../../../app/src/lib/seq'
import { Code } from './Code'

type Kind = FrameChoice['kind']

/** The choice the options say: -skip 1 is every frame, another -skip every N-th, else the last time (-b). */
function choiceOf(options: Options): Kind {
  const skip = options.skip
  if (skip === undefined || skip === '') return 'last'
  return skip === '1' ? 'all' : 'every'
}

/** The options a choice sets, keeping the others (-more). "All" is -skip 1, so the options always say the choice. */
function withChoice(options: Options, choice: FrameChoice, frames: AwhFrame[]): Options {
  const { b: _b, e: _e, skip: _s, ...rest } = options
  return { ...rest, ...(choice.kind === 'all' ? { skip: '1' } : frameOptions(frames, choice)) }
}

const timesText = (f: AwhFrame[]) => {
  const t = [...new Set(f.map(x => x.time))]
  return t.length > 8 ? t.slice(0, 3).join(', ') + ' … ' + t.slice(-2).join(', ') : t.join(', ')
}

/** gmx awh's own view (R5): which frames to write, with how many files each choice writes; the name; what will run. */
export function Awh({ gmx, draft, setDraft, onStarted }: { gmx: GmxState; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; onStarted: (id: string) => void }) {
  const edr = draft.inputs.edr?.path, tpr = draft.inputs.runInput?.path
  const read = useAwhScan(edr, tpr), frames = read?.scan?.frames ?? []
  const [starting, setStarting] = React.useState(false)
  const [refused, setRefused] = React.useState<{ key: string; message: string } | null>(null)
  const options = draft.options, choice = choiceOf(options)
  const lastTime = frames.length ? String(frames[frames.length - 1].time) : null
  // The last time is the file's own: set when the file is read, and again when another file has another last frame.
  React.useEffect(() => {
    if (lastTime != null && choice === 'last' && options.b !== lastTime) setDraft(d => ({ ...d, options: withChoice(d.options, { kind: 'last' }, frames) }))
  }, [lastTime, choice, options.b]) // eslint-disable-line react-hooks/exhaustive-deps -- frames is what lastTime says
  const body = edr && tpr ? { tool: 'awh', inputs: { edr, runInput: tpr }, groups: [], options, template: draft.template, outDir: draft.outDir } : null
  const planned = usePlan(body), plan = planned?.plan
  const key = JSON.stringify(body)

  if (!edr || !tpr) return <p className="m-0 text-control text-muted-foreground">pick the energy file and its run input in the inputs tab first</p>
  if (read?.error) return <Alert variant="destructive"><X /><AlertTitle>gmx awh could not read these files</AlertTitle><AlertDescription><p className="whitespace-pre-line">{read.error}</p></AlertDescription></Alert>
  if (!read?.scan) return <p className="m-0 text-control text-muted-foreground" aria-live="polite">reading the AWH frames of {edr.split('/').pop()} with gmx awh…</p>
  if (!frames.length) return <Alert variant="destructive"><X /><AlertTitle>no AWH data</AlertTitle><AlertDescription><p>gmx awh found no AWH frames in {edr.split('/').pop()}: was it written by a run with AWH?</p></AlertDescription></Alert>

  const setOptions = (o: Options) => setDraft(d => ({ ...d, options: o }))
  const every = Number(options.skip) > 1 ? Number(options.skip) : 4
  const count = (c: FrameChoice) => framesWritten(frames, withChoice(options, c, frames)).length
  const written = framesWritten(frames, options)
  const choose = (k: string) => k && setOptions(withChoice(options, k === 'every' ? { kind: 'every', n: every } : { kind: k as 'last' | 'all' }, frames))
  const more = AWH_FORM.find(f => f.flag === 'more')!
  const vaultFile = plan?.names.xvg, parsed = vaultFile ? parseName(vaultFile, DEFAULT_PATTERN) : null
  const target = read.scan.targetError
  const start = async () => {
    setStarting(true)
    try { onStarted((await postJson<{ id: string }>('/api/runs', body)).id) }
    catch (e) { setRefused({ key, message: (e as Error).message }) }
    finally { setStarting(false) }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-5">
      <div className="flex min-w-0 flex-col gap-4">
        <Section label={frames.length + ' AWH frames in ' + edr.split('/').pop()} />
        <p className="m-0 text-control">{frames[0].time}–{frames[frames.length - 1].time} ps{target ? ' · target error at the last frame ' + target.kJ + ' kJ/mol (' + target.kT + ' kT)' : ''}</p>
        <Field>
          <Label id="awh-frames">frames</Label>
          <ToggleGroup type="single" value={choice} onValueChange={choose} aria-labelledby="awh-frames" className="self-start">
            <ToggleGroupItem value="last">the last time · {count({ kind: 'last' })} file{count({ kind: 'last' }) > 1 ? 's' : ''}</ToggleGroupItem>
            <ToggleGroupItem value="every">every {every}th · {count({ kind: 'every', n: every })} files</ToggleGroupItem>
            <ToggleGroupItem value="all">all · {count({ kind: 'all' })} files</ToggleGroupItem>
          </ToggleGroup>
          <FieldHint>{choice === 'last' ? 'the usual choice for PMF Sequences: the profile at the end' : choice === 'every' ? 'for convergence: the profile as it grew' : 'one file per stored frame'} · t = {timesText(written)} ps</FieldHint>
        </Field>
        {choice === 'every' && (
          <Field>
            <Label htmlFor="awh-every">every</Label>
            <Input id="awh-every" size="sm" type="number" min={2} step={1} className="w-28" value={String(every)} onChange={e => { const n = Math.max(2, Math.round(Number(e.target.value) || 2)); setOptions(withChoice(options, { kind: 'every', n }, frames)) }} />
            <FieldHint>one frame in this many, from the first (gmx awh -skip)</FieldHint>
          </Field>
        )}
        <label htmlFor="awh-more" className="flex items-start gap-2.5 text-control">
          <Checkbox id="awh-more" className="mt-0.5" checked={options.more === true} onCheckedChange={v => { const { more: _m, ...rest } = options; setOptions(v === true ? { ...rest, more: true } : rest) }} />
          <span><span className="font-bold">{more.label}</span><span className="block text-caption text-muted-foreground">{more.what}</span></span>
        </label>
        <p className="m-0 text-caption text-muted-foreground">kJ/mol always: PMF Sequences reads kJ/mol (gmx awh -kt is not offered)</p>

        <Section label="Name" />
        <Field>
          <Label htmlFor="awh-template">output name</Label>
          <Input id="awh-template" size="sm" className="max-w-md" value={draft.template ?? ''} placeholder={DEFAULT_TEMPLATE} onChange={e => setDraft(d => ({ ...d, template: e.target.value || undefined }))} />
          <FieldHint>gmx awh adds _t&lt;time&gt; to each file · a name like hmrfast6_ha_WRWYCR gives PMF Sequences' own pattern, {DEFAULT_PATTERN}</FieldHint>
        </Field>
        {vaultFile && (parsed?.matched
          ? <p className="m-0 text-control text-mint-strong" aria-live="polite">✓ PMF Sequences reads {vaultFile} as {Object.entries(parsed.fields).map(([k, v]) => FIELD_LABEL[k as keyof typeof FIELD_LABEL] + ' ' + v).join(' · ')}</p>
          : <p className="m-0 text-control text-muted-foreground" aria-live="polite">{vaultFile} doesn't follow PMF Sequences' default pattern {DEFAULT_PATTERN}: it can still be sent, and is then named by the project's pattern</p>)}
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        <Section label="Command" />
        {planned?.error && <Alert variant="destructive"><X /><AlertTitle>gmx-cypher can't plan this run</AlertTitle><AlertDescription><p className="whitespace-pre-line">{planned.error}</p></AlertDescription></Alert>}
        {plan && <>
          {plan.problems.length > 0 && <Alert variant="destructive" aria-live="polite"><X /><AlertTitle>gmx would refuse this run</AlertTitle><AlertDescription>{plan.problems.map(p => <p key={p}>{p}</p>)}</AlertDescription></Alert>}
          <Code text={commandText({ cwd: plan.cwd, file: plan.file, args: plan.argv, env: plan.env })} label="awh command" />
          <p className="m-0 text-caption text-muted-foreground">writes {[...(plan.names.more ?? []), plan.names.xvg].length > 1 ? (plan.names.more?.length ?? 0) + 1 + ' files, ' + plan.names.more![0] + ' … ' : ''}{plan.names.xvg} and its record in {plan.outDir.split('/').slice(-2).join('/')}/ · new names, nothing overwritten · {plan.names.xvg} is the one sent to the vault</p>
        </>}
        {refused?.key === key && <Alert variant="destructive"><X /><AlertTitle>gmx-cypher didn't start this run</AlertTitle><AlertDescription><p className="whitespace-pre-line">{refused.message}</p></AlertDescription></Alert>}
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" disabled={!gmx.ok || !!planned?.error || !!plan?.problems.length || starting || !written.length} onClick={start}>{starting ? 'starting…' : 'run'}</Button>
          <span className="text-caption text-muted-foreground" aria-live="polite">{!gmx.ok ? 'no working gmx: see settings' : written.length + ' file' + (written.length > 1 ? 's' : '') + ' of PMF, one per frame'}</span>
        </div>
      </aside>
    </div>
  )
}
