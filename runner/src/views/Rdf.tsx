import * as React from 'react'
import { X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Field, FieldHint, Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Section } from '../ui/separator'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { getJson, type GmxState } from '../api'
import type { Draft } from '../draft'
import { commandText } from '../lib/command'
import type { HelpOption } from '../lib/gmxText'
import { groupAtoms } from '../lib/groups'
import { FORM, isDefault, rdfArgs, rdfIo, recipeProblems } from '../lib/rdf'
import { toneText } from '../lib/tones'
import { cn } from '../lib/utils'
import { useStructure } from '../structure'
import { Code } from './Code'

interface Help { gmx: string; version: string; options: HelpOption[] }

/** The installed gmx rdf's options (T22), read again only when gmx changes. */
function useHelp(gmx: GmxState) {
  const key = gmx.ok ? gmx.path + ' ' + gmx.version : ''
  const [h, setH] = React.useState<{ key: string; help?: Help; error?: string } | null>(null)
  React.useEffect(() => {
    if (!key) return
    let alive = true
    getJson<Help>('/api/help/rdf').then(help => alive && setH({ key, help }), e => alive && setH({ key, error: (e as Error).message }))
    return () => { alive = false }
  }, [key])
  return h?.key === key ? h : null
}

const shown = (v: string | boolean | null) => (v === true ? 'yes' : v === false ? 'no' : String(v))

/** One option: its label and flag, the control, `default` or `changed · default …` (which resets), and what it changes. */
function OptionField({ f, o, value, set }: { f: (typeof FORM)[number]; o: HelpOption; value: string | boolean | undefined; set: (v: string | boolean | undefined) => void }) {
  const id = React.useId(), changed = !isDefault(o, value)
  const chip = changed
    ? <button type="button" className="rounded-full" onClick={() => set(undefined)} aria-label={'reset -' + f.flag + ' to ' + shown(o.default)}><Badge tone="coral">changed · default {shown(o.default)}</Badge></button>
    : <Badge>default</Badge>
  if (o.type === 'bool') {
    const on = value === undefined ? o.default === true : value === true
    return (
      <div className="flex items-start gap-2">
        <Checkbox id={id} checked={on} onCheckedChange={c => set(c === o.default ? undefined : c === true)} className="mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <label htmlFor={id} className="flex flex-wrap items-center gap-2 text-control">{f.label} <span className="text-muted-foreground">-{f.flag}</span>{changed && chip}</label>
          <FieldHint>{f.what}</FieldHint>
        </div>
      </div>
    )
  }
  const v = value === undefined || value === '' ? undefined : String(value)
  return (
    <Field>
      <Label htmlFor={id}>{f.label} <span className="normal-case tracking-normal">-{f.flag}</span></Label>
      <div className="flex flex-wrap items-center gap-2">
        {o.type === 'enum' && o.values!.length <= 3 ? (
          <ToggleGroup id={id} type="single" size="sm" value={v ?? String(o.default)} onValueChange={x => x && set(x === o.default ? undefined : x)} aria-label={f.label}>
            {o.values!.map(x => <ToggleGroupItem key={x} value={x}>{x}</ToggleGroupItem>)}
          </ToggleGroup>
        ) : o.type === 'enum' ? (
          <Select value={v ?? String(o.default)} onValueChange={x => set(x === o.default ? undefined : x)}>
            <SelectTrigger id={id} size="sm" className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{o.values!.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <Input id={id} size="sm" className="w-28" inputMode="decimal" value={v ?? ''} placeholder={String(o.default)} onChange={e => set(e.target.value.trim() || undefined)} />
        )}
        {f.unit && <span className="text-caption text-muted-foreground">{f.unit}</span>}
        {chip}
      </div>
      <FieldHint>{f.what}</FieldHint>
    </Field>
  )
}

const GROUPS = [...new Set(FORM.map(f => f.group))]

export function Rdf({ gmx, draft, setDraft }: { gmx: GmxState; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>> }) {
  const h = useHelp(gmx)
  const structure = useStructure(draft.inputs.structure?.path)
  const [more, setMore] = React.useState(false)
  const options = draft.options
  const set = (flag: string, v: string | boolean | undefined) => setDraft(d => {
    const { [flag]: _, ...rest } = d.options
    return { ...d, options: v === undefined ? rest : { ...rest, [flag]: v } }
  })
  if (!gmx.ok) return <p className="m-0 text-control text-muted-foreground">set a working gmx first: the options come from its gmx rdf -h</p>
  if (!h) return <p className="m-0 text-control text-muted-foreground" aria-live="polite">reading gmx rdf -h…</p>
  if (h.error) return <Alert variant="destructive"><X /><AlertTitle>can't read the options of gmx rdf</AlertTitle><AlertDescription><p>{h.error}</p></AlertDescription></Alert>
  // -cn is a file option to gmx; here it is a switch, and gmx-cypher names the file.
  const help = h.help!, by = new Map(help.options.map(o => [o.flag, o.flag === 'cn' ? { ...o, type: 'bool', default: false } : o]))
  const problems = recipeProblems(options, help.options)
  const { trajectory, runInput } = draft.inputs
  const atoms = structure && !('error' in structure) ? structure.atoms : null
  const counts = atoms ? draft.groups.map(g => groupAtoms(atoms, g.steps).length) : null
  // Until R5 picks free names, the stem is the default template's: rdf_<trajectory>.
  const stem = trajectory ? 'rdf_' + trajectory.path.split('/').pop()!.replace(/\.[^.]+$/, '') : ''
  const plan = trajectory && runInput ? rdfIo({ trajectory: trajectory.path, runInput: runInput.path }, stem) : null
  let command = '', commandError = ''
  if (plan) { try { command = commandText({ cwd: plan.cwd, file: help.gmx, args: rdfArgs({ options, selections: draft.groups.length - 1 }, plan.io, help.options) }) } catch (e) { commandError = (e as Error).message } }

  const field = (flag: string) => { const f = FORM.find(x => x.flag === flag)!, o = by.get(flag); return o ? <OptionField key={flag} f={f} o={o} value={options[flag]} set={v => set(flag, v)} /> : null }
  const quiet = (g: string) => g === 'periodic boundaries · surface' && FORM.filter(f => f.group === g).every(f => !by.has(f.flag) || isDefault(by.get(f.flag)!, options[f.flag]))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_420px] gap-8">
      <div className="flex min-w-0 flex-col gap-4">
        {GROUPS.map(g => {
          const flags = FORM.filter(f => f.group === g && by.has(f.flag)).map(f => f.flag)
          if (!flags.length) return null
          const folded = quiet(g) && !more
          return (
            <section key={g} className="flex flex-col gap-4" aria-label={g}>
              <Section label={g}>{quiet(g) && <span className="text-caption text-muted-foreground">all at default</span>}</Section>
              {folded ? (
                <p className="m-0 flex flex-wrap items-center gap-x-3 text-caption text-muted-foreground">
                  {flags.map(fl => <span key={fl}>-{fl} {shown(by.get(fl)!.default)}</span>)}
                  <Button variant="link" size="sm" onClick={() => setMore(true)}>show</Button>
                </p>
              ) : <div className="grid grid-cols-2 gap-x-6 gap-y-4">{flags.map(field)}</div>}
            </section>
          )
        })}
      </div>
      <aside className="flex flex-col gap-3">
        <Section label="Command" />
        {!plan ? <p className="m-0 text-control text-muted-foreground">pick a trajectory and a run input in inputs</p>
          : commandError ? <FieldHint error>✗ {commandError}</FieldHint>
          : <Code label="command" text={command} />}
        <FieldHint>exactly what will run, without a shell · options read from this {gmx.name} {gmx.version} (gmx rdf -h)</FieldHint>
        {problems.length > 0 && (
          <Alert variant="destructive" aria-live="polite"><X /><AlertTitle>gmx would refuse these options</AlertTitle><AlertDescription>{problems.map(p => <p key={p}>{p}</p>)}</AlertDescription></Alert>
        )}
        {plan && <>
          <Section label={'Groups in ' + plan.io.index.split('/').pop()} />
          <table className="text-control"><tbody>
            {draft.groups.map((g, i) => (
              <tr key={i}>
                <td className="py-0.5 pr-4 text-muted-foreground">group {i}</td>
                <td className={cn('pr-4 font-bold', toneText[g.tone])}>{g.name}</td>
                <td className="text-right">{counts ? counts[i] + ' atoms' : '…'}</td>
                <td className="pl-3 text-caption text-muted-foreground">{i === 0 ? 'reference' : 'selection'}</td>
              </tr>
            ))}
          </tbody></table>
          <Section label="Writes" />
          <p className="m-0 text-caption text-muted-foreground">
            {[plan.io.output, ...(options.cn === true ? [plan.io.cn] : []), plan.io.index, 'rdf/' + stem + '.run.json'].join(' · ')} — in the trajectory's folder
          </p>
        </>}
      </aside>
    </div>
  )
}
