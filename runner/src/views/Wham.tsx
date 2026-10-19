import * as React from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Field, FieldHint, Label } from '../ui/label'
import { Section } from '../ui/separator'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { postJson, type GmxState } from '../api'
import type { Draft } from '../draft'
import { commandText } from '../lib/command'
import { WHAM_FORM } from '../lib/wham'
import { usePlan } from '../plan'
import { Code } from './Code'

interface Found { rel: string; tpr: string; pull: string | null }
type Pull = 'pullx' | 'pullf'

const FIRST = ['b', 'temp', 'nBootstrap'], MORE = ['e', 'bs-method', 'bins', 'zprof0', 'cycl']
const PLACEHOLDER: Record<string, string> = { b: '50 (gmx)', temp: 'from the run inputs', nBootstrap: '0', e: 'to the end', bins: '200 (gmx)', zprof0: '0', 'bs-method': 'b-hist' }

/** gmx wham's own view (R6): the windows found under a folder by a template, which ones to use, the options, what will run. */
export function Wham({ gmx, draft, setDraft, onStarted }: { gmx: GmxState; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; onStarted: (id: string) => void }) {
  const w = draft.wham ?? { pull: 'pullx' as Pull, windows: [] }
  const [root, setRoot] = React.useState(w.root ?? '')
  const [glob, setGlob] = React.useState(w.glob ?? '*/umbrella.tpr')
  const [found, setFound] = React.useState<Found[] | null>(null)
  const [unread, setUnread] = React.useState<string[]>([])
  const [finding, setFinding] = React.useState(false)
  const [more, setMore] = React.useState(false)
  const [starting, setStarting] = React.useState(false)
  const [refused, setRefused] = React.useState<{ key: string; message: string } | null>(null)
  const options = draft.options
  const body = w.windows.length ? { tool: 'wham', inputs: {}, groups: [], options, windows: w.windows, pull: w.pull, template: draft.template, outDir: draft.outDir } : null
  const planned = usePlan(body), plan = planned?.plan, key = JSON.stringify(body)

  const setWham = (patch: Partial<NonNullable<Draft['wham']>>) => setDraft(d => ({ ...d, wham: { ...(d.wham ?? { pull: 'pullx', windows: [] }), ...patch } }))
  const setOption = (flag: string, v: string | boolean | undefined) => setDraft(d => {
    const { [flag]: _gone, ...rest } = d.options
    return { ...d, options: v === undefined || v === '' || v === false ? rest : { ...rest, [flag]: v } }
  })
  const find = async (pull: Pull = w.pull) => {
    setFinding(true)
    try {
      const r = await postJson<{ windows: Found[]; unread: string[] }>('/api/wham/windows', { root, glob, pull })
      setFound(r.windows); setUnread(r.unread)
      // Every window with its pull file is used until you leave it out.
      setWham({ root, glob, pull, windows: r.windows.filter(x => x.pull).map(x => ({ tpr: x.tpr, pull: x.pull! })) })
    } catch (e) { toast.error('✗ ' + (e as Error).message) }
    finally { setFinding(false) }
  }
  const used = new Set(w.windows.map(x => x.tpr))
  const toggle = (f: Found) => setWham({ windows: used.has(f.tpr) ? w.windows.filter(x => x.tpr !== f.tpr) : (found ?? []).filter(x => x.pull && (used.has(x.tpr) || x.tpr === f.tpr)).map(x => ({ tpr: x.tpr, pull: x.pull! })) })
  // Windows from a run again or an earlier visit, before a new search: shown as they are.
  const rows: Found[] = found ?? w.windows.map(x => ({ rel: x.tpr.split('/').slice(-2).join('/'), tpr: x.tpr, pull: x.pull }))
  const start = async () => {
    setStarting(true)
    try { onStarted((await postJson<{ id: string }>('/api/runs', body)).id) }
    catch (e) { setRefused({ key, message: (e as Error).message }) }
    finally { setStarting(false) }
  }
  const field = (flag: string) => {
    const f = WHAM_FORM.find(x => x.flag === flag)!, id = 'wham-' + flag
    if (flag === 'cycl') return (
      <label key={flag} htmlFor={id} className="flex items-start gap-2.5 text-control">
        <Checkbox id={id} className="mt-0.5" checked={options.cycl === true} onCheckedChange={v => setOption('cycl', v === true)} />
        <span><span className="font-bold">{f.label}</span><span className="block text-caption text-muted-foreground">{f.what}</span></span>
      </label>
    )
    return (
      <Field key={flag}>
        <Label htmlFor={id}>{f.label}{f.unit ? ' · ' + f.unit : ''}</Label>
        <Input id={id} size="sm" value={String(options[flag] ?? '')} placeholder={PLACEHOLDER[flag]} onChange={e => setOption(flag, e.target.value)} />
        <FieldHint>{f.what}</FieldHint>
      </Field>
    )
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-5">
      <div className="flex min-w-0 flex-col gap-4">
        <Section label="Windows" />
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
          <Field>
            <Label htmlFor="wham-root">folder</Label>
            <Input id="wham-root" size="sm" value={root} placeholder="the folder that holds the window folders" onChange={e => setRoot(e.target.value)} onKeyDown={e => e.key === 'Enter' && root && find()} />
            <FieldHint>inside the allowed folders</FieldHint>
          </Field>
          <Field>
            <Label htmlFor="wham-glob">each window's run input</Label>
            <Input id="wham-glob" size="sm" value={glob} onChange={e => setGlob(e.target.value)} onKeyDown={e => e.key === 'Enter' && root && find()} />
            <FieldHint>* matches within one name</FieldHint>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup type="single" value={w.pull} onValueChange={v => { if (v) { setWham({ pull: v as Pull }); if (found) find(v as Pull) } }} aria-label="pull files">
            <ToggleGroupItem value="pullx">positions · pullx</ToggleGroupItem>
            <ToggleGroupItem value="pullf">forces · pullf</ToggleGroupItem>
          </ToggleGroup>
          <Button variant="outline" disabled={!root || !glob || finding} onClick={() => find()}>{finding ? 'finding…' : 'find windows'}</Button>
        </div>
        {unread.length > 0 && <p className="m-0 text-caption text-muted-foreground">not looked into: {unread.join(', ')}</p>}
        {rows.length > 0 && (
          <table className="text-control" aria-label="windows">
            <thead><tr className="text-left text-label uppercase text-muted-foreground"><th className="py-1 pr-3 font-normal">use</th><th className="pr-3 font-normal">#</th><th className="pr-3 font-normal">run input</th><th className="font-normal">{w.pull} file</th></tr></thead>
            <tbody>
              {rows.map(f => {
                const n = w.windows.findIndex(x => x.tpr === f.tpr)
                return (
                  <tr key={f.tpr} className="border-t border-border">
                    <td className="py-1 pr-3"><Checkbox aria-label={'use ' + f.rel} checked={n >= 0} disabled={!f.pull || !found} onCheckedChange={() => toggle(f)} /></td>
                    <td className="pr-3 text-muted-foreground">{n >= 0 ? n + 1 : '—'}</td>
                    <td className="pr-3">{f.rel}</td>
                    <td className={f.pull ? 'text-muted-foreground' : 'text-destructive'}>{f.pull ? '✓ ' + f.pull.split('/').pop() : '✗ none beside it'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {found && !found.length && <p className="m-0 text-control text-muted-foreground">no run input matches {glob} under {root}</p>}
        <p className="m-0 text-caption text-muted-foreground">{w.windows.length} window{w.windows.length === 1 ? '' : 's'} in the lists, numbered as gmx wham reads them · the lists are written beside the outputs, never over your own</p>

        <Section label="Options" />
        <div className="grid grid-cols-3 gap-4">{FIRST.map(field)}</div>
        {more && <div className="grid grid-cols-3 gap-4">{MORE.map(field)}</div>}
        <button className="self-start text-caption text-foreground underline underline-offset-[3px] hover:decoration-2" aria-expanded={more} onClick={() => setMore(m => !m)}>{more ? 'fewer options' : 'more options'}</button>
        <p className="m-0 text-caption text-muted-foreground">kJ/mol always (gmx wham -unit is not offered) · the histograms go to the vault; the profile stays here, since the Matrix would read it as a histogram</p>
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        <Section label="Command" />
        {!body && <p className="m-0 text-control text-muted-foreground">find the windows first</p>}
        {planned?.error && <Alert variant="destructive"><X /><AlertTitle>gmx-cypher can't plan this run</AlertTitle><AlertDescription><p className="whitespace-pre-line">{planned.error}</p></AlertDescription></Alert>}
        {plan && <>
          {plan.problems.length > 0 && <Alert variant="destructive" aria-live="polite"><X /><AlertTitle>gmx would refuse this run</AlertTitle><AlertDescription>{plan.problems.map(p => <p key={p}>{p}</p>)}</AlertDescription></Alert>}
          <Code text={commandText({ cwd: plan.cwd, file: plan.file, args: plan.argv, env: plan.env })} label="wham command" />
          {plan.notes.map(n => <p key={n} className="m-0 text-caption text-muted-foreground">{n}</p>)}
          <p className="m-0 text-caption text-muted-foreground">writes {[plan.names.xvg, ...(plan.names.more ?? [])].join(' · ')} and its record in {plan.outDir.split('/').slice(-2).join('/')}/ · new names, nothing overwritten</p>
        </>}
        {refused?.key === key && <Alert variant="destructive"><X /><AlertTitle>gmx-cypher didn't start this run</AlertTitle><AlertDescription><p className="whitespace-pre-line">{refused.message}</p></AlertDescription></Alert>}
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" disabled={!gmx.ok || !body || !!planned?.error || !!plan?.problems.length || starting} onClick={start}>{starting ? 'starting…' : 'run'}</Button>
          <span className="text-caption text-muted-foreground" aria-live="polite">{!gmx.ok ? 'no working gmx: see settings' : w.windows.length < 2 ? 'at least two windows' : 'the overlap of neighbouring windows comes with the result'}</span>
        </div>
      </aside>
    </div>
  )
}
