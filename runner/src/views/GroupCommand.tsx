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
import { formHelp, roleProblems, rolesOf, type CommandDef, type CommandOption } from '../lib/commands'
import type { HelpOption } from '../lib/gmxText'
import { groupAtoms, nameProblem } from '../lib/groups'
import { DEFAULT_TEMPLATE, NAME_TOKENS } from '../lib/names'
import { isDefault } from '../lib/rdf'
import { groupText } from '../lib/tones'
import { cn } from '../lib/utils'
import { usePlan, type PlanView } from '../plan'
import { useStructure } from '../structure'
import { Code } from './Code'
import { Recipes } from './Recipes'

interface Help { gmx: string; version: string; options: HelpOption[] }

/** The installed gmx's options for this command (T22), read again only when gmx or the command changes. */
function useHelp(gmx: GmxState, tool: string) {
  const key = gmx.ok ? gmx.path + ' ' + gmx.version + ' ' + tool : ''
  const [h, setH] = React.useState<{ key: string; help?: Help; error?: string } | null>(null)
  React.useEffect(() => {
    if (!key) return
    let alive = true
    getJson<Help>('/api/help/' + tool).then(help => alive && setH({ key, help }), e => alive && setH({ key, error: (e as Error).message }))
    return () => { alive = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- key is gmx and tool
  return h?.key === key ? h : null
}

/** The run as the server takes it (POST /api/plan and /api/runs): the command, input paths, groups as steps, options, names. */
function runBody(draft: Draft, tool: string) {
  const { trajectory, runInput, structure } = draft.inputs
  return trajectory && runInput ? { tool, inputs: { trajectory: trajectory.path, runInput: runInput.path, structure: structure?.path }, groups: draft.groups, options: draft.options, template: draft.template, outDir: draft.outDir } : null
}

const shown = (v: string | boolean | null) => (v === true ? 'yes' : v === false ? 'no' : String(v))

/** One option: its label and flag, the control, `default` or `changed · default …` (which resets), and what it changes. */
function OptionField({ f, o, value, set }: { f: CommandOption; o: HelpOption; value: string | boolean | undefined; set: (v: string | boolean | undefined) => void }) {
  const id = React.useId(), changed = !isDefault(o, value)
  // A switch shows the gmx flag it turns on; gmx-cypher's own choices have none.
  const flag = f.own ? null : '-' + (f.switch ?? f.flag)
  const chip = changed
    ? <button type="button" className="rounded-full" onClick={() => set(undefined)} aria-label={'reset -' + f.flag + ' to ' + shown(o.default)}><Badge tone="coral">changed · default {shown(o.default)}</Badge></button>
    : <Badge>default</Badge>
  if (o.type === 'bool') {
    const on = value === undefined ? o.default === true : value === true
    return (
      <div className="flex items-start gap-2">
        <Checkbox id={id} checked={on} onCheckedChange={c => set(c === o.default ? undefined : c === true)} className="mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <label htmlFor={id} className="flex flex-wrap items-center gap-2 text-control">{f.label} {flag && <span className="text-muted-foreground">{flag}</span>}{changed && chip}</label>
          <FieldHint>{f.what}</FieldHint>
        </div>
      </div>
    )
  }
  const v = value === undefined || value === '' ? undefined : String(value)
  return (
    <Field>
      <Label htmlFor={id}>{f.label} {flag && <span className="normal-case tracking-normal">{flag}</span>}</Label>
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
          // A list (-de N O) keeps its spaces while typed and is tidied on leaving the field; a number is trimmed as typed (review).
          o.type === 'string'
            ? <Input id={id} size="sm" className="w-28" inputMode="text" value={typeof value === 'string' ? value : ''} placeholder={String(o.default)} onChange={e => set(e.target.value.trim() ? e.target.value : undefined)} onBlur={e => set(e.target.value.trim().split(/\s+/).join(' ') || undefined)} />
            : <Input id={id} size="sm" className="w-28" inputMode="decimal" value={v ?? ''} placeholder={String(o.default)} onChange={e => set(e.target.value.trim() || undefined)} />
        )}
        {f.unit && <span className="text-caption text-muted-foreground">{f.unit}</span>}
        {chip}
      </div>
      <FieldHint>{f.what}</FieldHint>
    </Field>
  )
}

/** The file-name template (T30, tokens as the Matrix's plus the runner's) and another output folder, if any. */
function Names({ draft, setDraft, plan, tool }: { draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; plan: PlanView | undefined; tool: string }) {
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
        <Input id={id + 'o'} size="sm" value={draft.outDir ?? ''} placeholder={plan ? plan.cwd + '/' + tool : tool + "/ in the trajectory's folder"} onChange={e => setDraft(d => ({ ...d, outDir: e.target.value.trim() || null }))} />
        <FieldHint>empty: {tool}/ next to the trajectory · another folder must exist and be inside the allowed folders</FieldHint>
      </Field>
    </>
  )
}

type ViewProps = { gmx: GmxState; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; onStarted: (id: string) => void }

/**
 * The view of a command with atom groups (rdf, distance, …, R3a/R7): its options from the installed gmx's -h in the
 * definition's order and groups, the name and folder, the exact command, the groups as gmx will number them, and run.
 */
export function GroupCommand({ command, gmx, draft, setDraft, onStarted }: ViewProps & { command: CommandDef }) {
  const tool = command.tool, FORM = command.options
  const h = useHelp(gmx, tool)
  const planned = usePlan(runBody(draft, tool))
  const [starting, setStarting] = React.useState(false)
  const [refused, setRefused] = React.useState<{ key: string; message: string } | null>(null)
  const structure = useStructure(draft.inputs.structure?.path)
  const [more, setMore] = React.useState(false)
  const options = draft.options
  const set = (flag: string, v: string | boolean | undefined) => setDraft(d => {
    const { [flag]: _, ...rest } = d.options
    return { ...d, options: v === undefined ? rest : { ...rest, [flag]: v } }
  })
  if (!gmx.ok) return <p className="m-0 text-control text-muted-foreground">set a working gmx first: the options come from its gmx {tool} -h</p>
  if (!h) return <p className="m-0 text-control text-muted-foreground" aria-live="polite">reading gmx {tool} -h…</p>
  if (h.error) return <Alert variant="destructive"><X /><AlertTitle>can't read the options of gmx {tool}</AlertTitle><AlertDescription><p>{h.error}</p></AlertDescription></Alert>
  // Switches (rdf's -cn, distance's -oall…) are file options to gmx, here on or off; gmx-cypher names the files.
  const help = h.help!, by = new Map(formHelp(FORM, help.options).map(o => [o.flag, o]))
  const problems = command.problems(options, help.options)
  const { trajectory, runInput } = draft.inputs
  const atoms = structure && !('error' in structure) ? structure.atoms : null
  const sets = atoms ? draft.groups.map(g => groupAtoms(atoms, g.steps)) : null, counts = sets?.map(s => s.length) ?? null
  const plan = planned?.plan
  const names = draft.groups.map(g => g.name)
  // Too many or too few groups for this command (R9), then what it would get wrong with these.
  const roles = rolesOf(command), groupProblems = [...roleProblems(command, draft.groups.length), ...(counts ? command.groupProblems?.(options, counts, names, sets!) ?? [] : [])]
  const blockers = [
    !draft.inputs.structure && 'pick a structure in inputs: the groups are built on it',
    problems.length && 'change the options gmx would refuse',
    counts?.some(n => !n) && 'every group needs atoms',
    draft.groups.some((g, i) => nameProblem(g.name, names.filter((_, j) => j !== i))) && 'a group name gmx can\'t read (see groups)',
    ...groupProblems,
  ].filter(Boolean) as string[]
  const key = JSON.stringify(runBody(draft, tool))
  const start = async () => {
    setStarting(true)
    try { onStarted((await postJson<{ id: string }>('/api/runs', runBody(draft, tool))).id) }
    catch (e) { setRefused({ key, message: (e as Error).message }) }
    finally { setStarting(false) }
  }
  const where = plan && (plan.outDir === plan.cwd + '/' + tool ? tool + "/ in the trajectory's folder" : plan.outDir)
  const GROUPS = [...new Set(FORM.map(f => f.group))]

  const field = (flag: string) => { const f = FORM.find(x => x.flag === flag)!, o = by.get(flag); return o ? <OptionField key={flag} f={f} o={o} value={options[flag]} set={v => set(flag, v)} /> : null }
  // The periodic-boundary options are folded while all are at their defaults.
  const quiet = (g: string) => g.startsWith('periodic boundaries') && FORM.filter(f => f.group === g).every(f => !by.has(f.flag) || isDefault(by.get(f.flag)!, options[f.flag]))
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
              ) : <div className="grid grid-cols-2 gap-x-6 gap-y-4">{flags.map(field)}{g === 'output' && <Names draft={draft} setDraft={setDraft} plan={plan} tool={tool} />}</div>}
            </section>
          )
        })}
      </div>
      <aside className="flex flex-col gap-3">
        <Recipes draft={draft} setDraft={setDraft} />
        <Section label="Command" />
        {!trajectory || !runInput ? <p className="m-0 text-control text-muted-foreground">pick a trajectory and a run input in inputs</p>
          : planned?.error ? <FieldHint error>✗ {planned.error}</FieldHint>
          : plan ? <Code label="command line" text={commandText({ cwd: plan.cwd, file: plan.file, args: plan.argv, env: plan.env })} />
          : <p className="m-0 text-control text-muted-foreground" aria-live="polite">choosing names…</p>}
        {/* The tools that ask for their groups get them on stdin: part of what runs (review). */}
        {plan?.stdin != null && <p className="m-0 text-caption text-muted-foreground">answers on stdin, by group number: <span className="font-bold text-foreground">{plan.stdin.trimEnd().split('\n').join(' · ')}</span></p>}
        <FieldHint>exactly what will run, without a shell · options read from this {gmx.name} {gmx.version} (gmx {tool} -h)</FieldHint>
        {problems.length > 0 && (
          <Alert variant="destructive" aria-live="polite"><X /><AlertTitle>gmx would refuse these options</AlertTitle><AlertDescription>{problems.map(p => <p key={p}>{p}</p>)}</AlertDescription></Alert>
        )}
        {groupProblems.length > 0 && (
          <Alert variant="destructive" aria-live="polite"><X /><AlertTitle>gmx would get these groups wrong</AlertTitle><AlertDescription>{groupProblems.map(p => <p key={p}>{p}</p>)}</AlertDescription></Alert>
        )}
        {plan && <>
          <Section label={'Groups in ' + plan.names.ndx} />
          <table className="text-control"><tbody>
            {draft.groups.map((g, i) => (
              <tr key={i}>
                <td className="py-0.5 pr-4 text-muted-foreground">group {i}</td>
                <td className={cn('pr-4 font-bold', groupText(g))}>{g.name}</td>
                <td className="text-right">{counts ? counts[i] + ' atoms' : '…'}</td>
                <td className="pl-3 text-caption text-muted-foreground">{i === 0 ? roles.first : roles.rest}</td>
              </tr>
            ))}
          </tbody></table>
          <Section label="Writes" />
          <p className="m-0 text-caption text-muted-foreground">
            {[plan.names.xvg, ...(options.cn === true && plan.names.cn ? [plan.names.cn] : []), ...(plan.names.more ?? []), plan.names.ndx, plan.names.record].join(' · ')} — in {where} · new names, nothing overwritten
          </p>
          {refused?.key === key && (
            <Alert variant="destructive"><X /><AlertTitle>gmx-cypher didn't start this job</AlertTitle><AlertDescription><p className="whitespace-pre-line">{refused.message}</p></AlertDescription></Alert>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" disabled={!!blockers.length || starting} onClick={start}>{starting ? 'checking groups with gmx…' : 'run'}</Button>
            <span className="text-caption text-muted-foreground" aria-live="polite">{blockers[0] || 'gmx select confirms each group first; the job continues if this page closes'}</span>
          </div>
        </>}
      </aside>
    </div>
  )
}
