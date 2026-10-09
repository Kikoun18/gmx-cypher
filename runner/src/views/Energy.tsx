import * as React from 'react'
import { X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Field, FieldHint, Label } from '../ui/label'
import { Section } from '../ui/separator'
import { postJson, type GmxState } from '../api'
import type { Draft } from '../draft'
import { commandText } from '../lib/command'
import { ENERGY_FORM, type EnergyTerm } from '../lib/energy'
import { cn } from '../lib/utils'
import { Code } from './Code'
import { useTerms } from '../terms'

interface EnergyPlan { cwd: string; file: string; argv: string[]; env: Record<string, string>; stdin?: string; problems: string[]; outDir: string; stem: string }

/** The run as the server plans it (POST /api/plan), so the command shown is the one that runs. */
function usePlan(body: object | null) {
  const key = JSON.stringify(body)
  const [p, setP] = React.useState<{ key: string; plan?: EnergyPlan; error?: string } | null>(null)
  React.useEffect(() => {
    if (!body) return
    let alive = true
    const t = setTimeout(() => postJson<EnergyPlan & { error?: string }>('/api/plan', body).then(plan => alive && setP(plan.error ? { key, error: plan.error } : { key, plan }), e => alive && setP({ key, error: (e as Error).message })), 250)
    return () => { alive = false; clearTimeout(t) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- body is what key says
  return p?.key === key ? p : null
}

/** The energy command's own view (R4): its terms picked by number, its first and last time, and what will run. */
export function Energy({ gmx, draft, setDraft, onStarted }: { gmx: GmxState; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; onStarted: (id: string) => void }) {
  const edr = draft.inputs.edr?.path
  const menu = useTerms(edr)
  const [filter, setFilter] = React.useState('')
  const [more, setMore] = React.useState(false)
  const [starting, setStarting] = React.useState(false)
  const [refused, setRefused] = React.useState<{ key: string; message: string } | null>(null)
  const terms = draft.terms ?? [], options = draft.options
  const body = edr ? { tool: 'energy', inputs: { edr }, groups: [], options, terms } : null
  const planned = usePlan(body), plan = planned?.plan
  const key = JSON.stringify(body)

  const setTerms = (next: number[]) => setDraft(d => ({ ...d, terms: next }))
  const toggle = (n: number) => setTerms(terms.includes(n) ? terms.filter(t => t !== n) : [...terms, n])
  const setOption = (flag: string, v: string | boolean | undefined) => setDraft(d => {
    const { [flag]: _gone, ...rest } = d.options
    return { ...d, options: v === undefined || v === '' || v === false ? rest : { ...rest, [flag]: v } }
  })

  if (!edr) return <p className="m-0 text-control text-muted-foreground">pick an energy file in the inputs tab first · its terms are read from it</p>
  if (menu?.error) return <Alert variant="destructive"><X /><AlertTitle>gmx energy could not read this file</AlertTitle><AlertDescription><p className="whitespace-pre-line">{menu.error}</p></AlertDescription></Alert>
  if (!menu?.terms) return <p className="m-0 text-control text-muted-foreground" aria-live="polite">reading the terms of {edr.split('/').pop()} with gmx energy…</p>

  const shown = menu.terms.filter(t => !filter.trim() || (t.name + ' ' + t.number).toLowerCase().includes(filter.trim().toLowerCase()))
  const first = Number(options.b ?? 0), last = Number(options.e ?? 0)
  const start = async () => {
    setStarting(true)
    try { onStarted((await postJson<{ id: string }>('/api/runs', body)).id) }
    catch (e) { setRefused({ key, message: (e as Error).message }) }
    finally { setStarting(false) }
  }
  const picked = terms.map(n => menu.terms!.find(t => t.number === n)).filter(Boolean) as EnergyTerm[]
  const blocked = !gmx.ok || !!planned?.error || !!plan?.problems.length

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-5">
      <div className="flex min-w-0 flex-col gap-4">
        <Section label={menu.terms.length + ' terms in ' + edr.split('/').pop()} />
        <Field>
          <Label htmlFor="energy-filter">find a term</Label>
          <Input id="energy-filter" size="sm" className="max-w-xs" value={filter} placeholder="Bond, Pres, or a number" onChange={e => setFilter(e.target.value)} />
          <FieldHint>a term is sent to gmx by its number, from this file's own menu</FieldHint>
        </Field>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2 p-0" aria-label="terms">
          {shown.map(t => {
            const on = terms.includes(t.number), id = 'energy-term-' + t.number
            return (
              <li key={t.number}>
                <label htmlFor={id} className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-control hover:bg-background', on && 'border-stone-strong bg-background font-bold')}>
                  <Checkbox id={id} checked={on} onCheckedChange={() => toggle(t.number)} />
                  <span className="text-muted-foreground">{t.number}</span>
                  <span className="truncate">{t.name}</span>
                </label>
              </li>
            )
          })}
        </ul>
        {!shown.length && <p className="m-0 text-caption text-muted-foreground">no term matches "{filter}"</p>}
        <p className="m-0 text-caption text-muted-foreground" aria-live="polite">{picked.length ? 'picked: ' + picked.map(t => t.number + ' ' + t.name).join(' · ') : 'no term picked yet'}{picked.length ? ' · ' : ''}{picked.length ? <button className="text-coral-strong hover:underline" onClick={() => setTerms([])}>clear</button> : null}</p>

        <Section label="Options" />
        <div className="grid grid-cols-2 gap-4">
          {ENERGY_FORM.filter(f => f.flag === 'b' || f.flag === 'e').map(f => {
            const id = 'energy-' + f.flag
            return (
              <Field key={f.flag}>
                <Label htmlFor={id}>{f.label} · {f.unit}</Label>
                <Input id={id} size="sm" type="number" min={0} step="any" placeholder="0" value={String(options[f.flag] ?? '')} onChange={e => setOption(f.flag, e.target.value)} />
                <FieldHint>{f.flag === 'b' && first > 0 ? 'the first ' + first + ' ps left out, as equilibration' : f.what}</FieldHint>
              </Field>
            )
          })}
        </div>
        <div className="flex flex-col gap-2">
          {ENERGY_FORM.filter(f => f.flag === 'sum' || (more && f.flag !== 'b' && f.flag !== 'e')).map(f => {
            const id = 'energy-opt-' + f.flag
            return (
              <label key={f.flag} htmlFor={id} className="flex items-start gap-2.5 text-control">
                <Checkbox id={id} className="mt-0.5" checked={options[f.flag] === true} onCheckedChange={v => setOption(f.flag, v === true)} />
                <span><span className="font-bold">{f.label}</span><span className="block text-caption text-muted-foreground">{f.what}</span></span>
              </label>
            )
          })}
          <button className="self-start text-caption text-coral-strong hover:underline" aria-expanded={more} onClick={() => setMore(m => !m)}>{more ? 'fewer options' : 'more options'}</button>
        </div>
        {last > 0 && first >= last && <p className="m-0 text-caption text-destructive">-e must be after -b</p>}
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        <Section label="Command" />
        {planned?.error && <Alert variant="destructive"><X /><AlertTitle>gmx-cypher can't plan this run</AlertTitle><AlertDescription><p className="whitespace-pre-line">{planned.error}</p></AlertDescription></Alert>}
        {plan && <>
          {plan.problems.length > 0 && <Alert variant="destructive" aria-live="polite"><X /><AlertTitle>gmx would refuse this run</AlertTitle><AlertDescription>{plan.problems.map(p => <p key={p}>{p}</p>)}</AlertDescription></Alert>}
          <Code text={commandText({ cwd: plan.cwd, file: plan.file, args: plan.argv, env: plan.env })} label="energy command" />
          {plan.stdin != null && <p className="m-0 text-caption text-muted-foreground">answers on stdin, then the end: <span className="font-bold text-foreground">{plan.stdin.trimEnd().split('\n').join(' · ')}</span></p>}
          <p className="m-0 text-caption text-muted-foreground">writes {plan.stem}.xvg and its record in {plan.outDir.split('/').slice(-2).join('/')}/ · new names, nothing overwritten</p>
        </>}
        {refused?.key === key && <Alert variant="destructive"><X /><AlertTitle>gmx-cypher didn't start this run</AlertTitle><AlertDescription><p className="whitespace-pre-line">{refused.message}</p></AlertDescription></Alert>}
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" disabled={blocked || starting || !terms.length} onClick={start}>{starting ? 'starting…' : 'run'}</Button>
          <span className="text-caption text-muted-foreground" aria-live="polite">{!gmx.ok ? 'no working gmx: see settings' : !terms.length ? 'pick at least one term' : 'the statistics come out with the result'}</span>
        </div>
      </aside>
    </div>
  )
}
