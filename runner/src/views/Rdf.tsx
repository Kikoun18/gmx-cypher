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
import { getJson, postJson, type GmxState } from '../api'
import type { Draft } from '../draft'
import { commandText } from '../lib/command'
import type { HelpOption } from '../lib/gmxText'
import { groupAtoms } from '../lib/groups'
import { DEFAULT_TEMPLATE, NAME_TOKENS } from '../lib/names'
import { FORM, isDefault, recipeProblems, type RdfIo } from '../lib/rdf'
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

interface Plan { cwd: string; outDir: string; stem: string; names: { xvg: string; cn: string; ndx: string; record: string }; io: RdfIo; file: string; argv: string[]; problems: string[] }

/** Where and under which free names the run would write now, as the server sees the folder (T30); asked again 250 ms after a change. */
function usePlan(draft: Draft) {
  const { trajectory, runInput, structure } = draft.inputs
  const body = trajectory && runInput ? { inputs: { trajectory: trajectory.path, runInput: runInput.path, structure: structure?.path }, groups: draft.groups, options: draft.options, template: draft.template, outDir: draft.outDir } : null
  const key = JSON.stringify(body)
  const [p, setP] = React.useState<{ key: string; plan?: Plan; error?: string } | null>(null)
  React.useEffect(() => {
    if (!body) return
    let alive = true
    const t = setTimeout(() => postJson<Plan>('/api/plan', body).then(plan => alive && setP({ key, plan }), e => alive && setP({ key, error: (e as Error).message })), 250)
    return () => { alive = false; clearTimeout(t) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- body is what key says
  return p?.key === key ? p : null
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

/** The file-name template (T30, tokens as PMF Sequences' plus the runner's) and another output folder, if any. */
function Names({ draft, setDraft, plan }: { draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; plan: Plan | undefined }) {
  const id = React.useId()
  return (
    <>
      <Field className="col-start-2 row-start-1">
        <Label htmlFor={id}>file name</Label>
        <Input id={id} size="sm" value={draft.template ?? DEFAULT_TEMPLATE} onChange={e => setDraft(d => ({ ...d, template: e.target.value }))} list={id + 't'} />
        <datalist id={id + 't'}>{NAME_TOKENS.map(t => <option key={t} value={(draft.template ?? DEFAULT_TEMPLATE) + t} />)}</datalist>
        <FieldHint>{plan ? '→ ' + plan.names.xvg : 'tokens: ' + NAME_TOKENS.slice(0, 2).join(' ')}; a taken name gets (2), (3)…</FieldHint>
      </Field>
      <Field className="col-span-2">
        <Label htmlFor={id + 'o'}>output folder</Label>
        <Input id={id + 'o'} size="sm" value={draft.outDir ?? ''} placeholder={plan ? plan.cwd + '/rdf' : "rdf/ in the trajectory's folder"} onChange={e => setDraft(d => ({ ...d, outDir: e.target.value.trim() || null }))} />
        <FieldHint>empty: rdf/ next to the trajectory · another folder must exist and be inside the allowed folders</FieldHint>
      </Field>
    </>
  )
}

export function Rdf({ gmx, draft, setDraft }: { gmx: GmxState; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>> }) {
  const h = useHelp(gmx)
  const planned = usePlan(draft)
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
  const plan = planned?.plan
  const where = plan && (plan.outDir === plan.cwd + '/rdf' ? "rdf/ in the trajectory's folder" : plan.outDir)

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
              ) : <div className="grid grid-cols-2 gap-x-6 gap-y-4">{flags.map(field)}{g === 'output' && <Names draft={draft} setDraft={setDraft} plan={plan} />}</div>}
            </section>
          )
        })}
      </div>
      <aside className="flex flex-col gap-3">
        <Section label="Command" />
        {!trajectory || !runInput ? <p className="m-0 text-control text-muted-foreground">pick a trajectory and a run input in inputs</p>
          : planned?.error ? <FieldHint error>✗ {planned.error}</FieldHint>
          : plan ? <Code label="command" text={commandText({ cwd: plan.cwd, file: plan.file, args: plan.argv })} />
          : <p className="m-0 text-control text-muted-foreground" aria-live="polite">choosing names…</p>}
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
            {[plan.names.xvg, ...(options.cn === true ? [plan.names.cn] : []), plan.names.ndx, plan.names.record].join(' · ')} — in {where} · new names, nothing overwritten
          </p>
        </>}
      </aside>
    </div>
  )
}
