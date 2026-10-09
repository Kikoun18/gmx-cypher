import * as React from 'react'
import { Plus, TriangleAlert, X } from 'lucide-react'
import { Alert, AlertActions, AlertDescription, AlertTitle } from '../ui/alert'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { FieldHint } from '../ui/label'
import { Kbd } from '../ui/kbd'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Section } from '../ui/separator'
import { postJson } from '../api'
import type { Draft } from '../draft'
import { useIndex, useStructure } from '../structure'
import { fromRanges, toRanges, type Atom } from '../lib/atoms'
import { clickStep, groupAtoms, nameProblem, ruleText, shared, type Group, type Rule, type Step } from '../lib/groups'
import { fitKeys, initialKeys, removeKey } from '../lib/keys'
import type { NdxGroup } from '../lib/ndx'
import { TONES, toneSolid, toneText, type Tone } from '../lib/tones'
import { cn } from '../lib/utils'
import { Viewer, type PickHow } from './Viewer'

type Kind = Exclude<Rule['kind'], 'atoms'> | 'index'
const KINDS: { kind: Kind; label: string }[] = [
  { kind: 'resname', label: 'residue name' }, { kind: 'resnr', label: 'residue numbers' },
  { kind: 'name', label: 'atom name' }, { kind: 'element', label: 'element' }, { kind: 'index', label: 'index group' },
]

/**
 * A rule from what the structure contains: the names offered are the file's own. An index group is taken
 * as its atoms (the step notes which group), so the group never depends on the index file again (T51).
 */
function RuleForm({ atoms, index, onStep }: { atoms: Atom[]; index: { file: string; groups: NdxGroup[] }; onStep: (s: Step) => void }) {
  const [kind, setKind] = React.useState<Kind>('resname')
  const [value, setValue] = React.useState('')
  const [within, setWithin] = React.useState('')
  const options = React.useMemo(() => {
    const vals = kind === 'resname' ? atoms.map(a => a.resn) : kind === 'name' ? atoms.map(a => a.name) : kind === 'element' ? atoms.map(a => a.elem || '') : []
    return [...new Set(vals)].filter(Boolean).sort()
  }, [atoms, kind])
  const id = React.useId()
  const picked = kind === 'index' ? index.groups[Number(value)] : undefined
  const rule = (): Rule | null => {
    const v = value.trim()
    if (kind === 'index') return picked?.atoms.length ? { kind: 'atoms', atoms: toRanges(picked.atoms) } : null
    if (kind === 'resnr') { const m = /^(\d+)\s*(?:[-–]\s*(\d+))?$/.exec(v); return m ? { kind, from: +m[1], to: +(m[2] ?? m[1]) } : null }
    if (!v) return null
    return kind === 'name' ? { kind, value: v, ...(within.trim() ? { resn: within.trim() } : {}) } : { kind, value: v }
  }
  const r = rule()
  const note = picked && 'index group ' + picked.label + ' (#' + value + ' in ' + index.file + ')'
  const go = (op: Step['op']) => { if (r) { onStep({ op, rule: r, ...(note ? { note } : {}) }); setValue(''); setWithin('') } }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-input p-2">
      <Select value={kind} onValueChange={k => { setKind(k as typeof kind); setValue('') }}>
        <SelectTrigger size="sm" className="w-40" aria-label="rule"><SelectValue /></SelectTrigger>
        <SelectContent>{KINDS.filter(k => k.kind !== 'index' || index.groups.length).map(k => <SelectItem key={k.kind} value={k.kind}>{k.label}</SelectItem>)}</SelectContent>
      </Select>
      {kind === 'index' ? (
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger size="sm" className="w-44" aria-label="index group"><SelectValue placeholder="group" /></SelectTrigger>
          <SelectContent>{index.groups.map((g, i) => <SelectItem key={i} value={String(i)}>{i} · {g.label} · {g.atoms.length}</SelectItem>)}</SelectContent>
        </Select>
      ) : (
        <Input size="sm" className="w-28" value={value} onChange={e => setValue(e.target.value)} list={id} placeholder={kind === 'resnr' ? '1-6' : 'value'} aria-label="value"
          onKeyDown={e => e.key === 'Enter' && go('add')} />
      )}
      <datalist id={id}>{options.map(o => <option key={o} value={o} />)}</datalist>
      {kind === 'name' && <Input size="sm" className="w-24" value={within} onChange={e => setWithin(e.target.value)} list={id + 'r'} placeholder="in every…" aria-label="in every residue named" />}
      <datalist id={id + 'r'}>{[...new Set(atoms.map(a => a.resn))].sort().map(o => <option key={o} value={o} />)}</datalist>
      <Button variant="outline" size="sm" disabled={!r} onClick={() => go('add')}>+ add</Button>
      <Button variant="ghost" size="sm" disabled={!r} onClick={() => go('remove')}>− remove</Button>
      {r && <span className="text-caption text-muted-foreground">{picked ? picked.label + ' · ' + picked.atoms.length + ' atoms' : ruleText(r)}</span>}
    </div>
  )
}

function GroupCard({ group, atoms, index, nrs, others, current, onCurrent, onChange, onRemove }: {
  group: Group; atoms: Atom[]; index: { file: string; groups: NdxGroup[] }; nrs: number[]; others: string[]; current: boolean
  onCurrent: () => void; onChange: (g: Group) => void; onRemove?: () => void
}) {
  const [rule, setRule] = React.useState(false)
  const [typed, setTyped] = React.useState<string | null>(null)
  const [armed, setArmed] = React.useState(false)
  React.useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 2600); return () => clearTimeout(t) }, [armed])
  const problem = nameProblem(group.name, others)
  const beyond = nrs.filter(n => n > atoms.length)
  const steps = (s: Step[]) => onChange({ ...group, steps: s })
  // Typed atoms become steps against what the group has: rules stay, and the difference is recorded.
  const commitTyped = () => {
    if (typed == null) return
    try {
      const want = fromRanges(typed), have = new Set(nrs), now = new Set(want)
      const add = want.filter(n => !have.has(n)), drop = nrs.filter(n => !now.has(n))
      steps([...group.steps, ...(add.length ? [{ op: 'add' as const, rule: { kind: 'atoms' as const, atoms: toRanges(add) }, note: 'typed' }] : []),
        ...(drop.length ? [{ op: 'remove' as const, rule: { kind: 'atoms' as const, atoms: toRanges(drop) }, note: 'typed' }] : [])])
      setTyped(null)
    } catch { /* the field shows the error until it reads */ }
  }
  let typedError = ''
  if (typed != null) { try { fromRanges(typed) } catch (e) { typedError = (e as Error).message } }
  return (
    <section className={cn('flex flex-col gap-2 rounded-lg border bg-card p-3', current ? 'border-ring' : 'border-border')} aria-label={group.role + ' ' + group.name}>
      <div className="flex items-center gap-2">
        <span className={cn('rounded-full px-2.5 py-px text-caption font-bold', toneSolid[group.tone])}>{group.role === 'reference' ? 'ref' : 'sel'}</span>
        <Input size="sm" value={group.name} aria-invalid={!!problem} aria-label={group.role + ' name'} className="h-7 w-36 font-bold" onChange={e => onChange({ ...group, name: e.target.value.trim() })} />
        <span className={cn('whitespace-nowrap text-control font-bold', toneText[group.tone])}>{nrs.length} atoms</span>
        <span className="flex-1" />
        <Button variant={current ? 'secondary' : 'ghost'} size="sm" aria-pressed={current} onClick={onCurrent}>{current ? 'picking' : 'pick'}</Button>
        {onRemove && <Button variant="ghost" size="sm" onClick={() => (armed ? onRemove() : setArmed(true))}>{armed ? 'click again to remove' : 'remove'}</Button>}
      </div>
      {problem && <FieldHint error>✗ {problem}</FieldHint>}
      {group.steps.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-caption">
          {group.steps.map((s, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{s.op === 'add' ? '+' : '−'}</span>
              <span>{ruleText(s.rule)}{s.note && <span className="text-muted-foreground"> · {s.note}</span>}</span>
              <button className="ml-auto text-muted-foreground hover:text-foreground" aria-label={'remove step ' + ruleText(s.rule)} onClick={() => steps(group.steps.filter((_, j) => j !== i))}><X className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      <Input size="sm" value={typed ?? toRanges(nrs)} placeholder="atoms, e.g. 5-30:5, 47" aria-label={group.name + ' atoms'} aria-invalid={!!typedError}
        onChange={e => setTyped(e.target.value)} onBlur={commitTyped} onKeyDown={e => { if (e.key === 'Enter') commitTyped(); if (e.key === 'Escape') setTyped(null) }} />
      {typedError && <FieldHint error>✗ {typedError}</FieldHint>}
      {beyond.length > 0 && <FieldHint error>✗ atoms {toRanges(beyond)} are beyond the structure's {atoms.length}</FieldHint>}
      {rule ? <RuleForm atoms={atoms} index={index} onStep={s => { steps([...group.steps, s]); setRule(false) }} /> : <Button variant="ghost" size="sm" className="self-start" onClick={() => setRule(true)}>+ rule</Button>}
    </section>
  )
}

export function Groups({ draft, setDraft }: { draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>> }) {
  const structure = useStructure(draft.inputs.structure?.path)
  const indexGroups = useIndex(draft.inputs.index?.path)
  const index = React.useMemo(() => ({ file: draft.inputs.index?.path.split('/').pop() || '', groups: indexGroups }), [draft.inputs.index, indexGroups])
  const [current, setCurrent] = React.useState(0)
  // Each card keeps its own key, so removing one doesn't pass its state to the next (review finding 7).
  const [cardKeys, setCardKeys] = React.useState(() => initialKeys(draft.groups.length))
  const keys = fitKeys(cardKeys, draft.groups.length)
  if (keys !== cardKeys) setCardKeys(keys)
  const atoms = structure && !('error' in structure) ? structure.atoms : null
  const sets = React.useMemo(() => (atoms ? draft.groups.map(g => groupAtoms(atoms, g.steps)) : []), [atoms, draft.groups])
  const colour = React.useMemo(() => {
    const m = new Map<number, Tone>()
    // Selections in order, then the reference: an atom in both shows the reference's hue.
    for (const i of [...sets.keys()].slice(1).concat(0)) for (const nr of sets[i] || []) m.set(nr, draft.groups[i].tone)
    return m
  }, [sets, draft.groups])
  const setGroup = (i: number, g: Group) => setDraft(d => ({ ...d, groups: d.groups.map((x, j) => (j === i ? g : x)) }))
  const onPick = React.useCallback((nr: number, how: PickHow) => {
    if (!atoms) return
    setDraft(d => ({ ...d, groups: d.groups.map((g, j) => (j === current ? { ...g, steps: clickStep(atoms, g.steps, nr, how) } : g)) }))
  }, [atoms, current, setDraft])
  const describe = React.useCallback((nr: number) => { const names = draft.groups.filter((_, i) => sets[i]?.includes(nr)).map(g => g.name); return names.length ? 'in ' + names.join(', ') : '' }, [draft.groups, sets])

  if (!draft.inputs.structure) return <p className="m-0 text-control text-muted-foreground">pick a structure in inputs first</p>
  if (!structure) return <p className="m-0 text-control text-muted-foreground" aria-live="polite">reading the structure…</p>
  if ('error' in structure) return <p className="m-0 text-control text-destructive">✗ {structure.error}</p>
  const ref = draft.groups[0], names = (i: number) => draft.groups.filter((_, j) => j !== i).map(g => g.name)
  const addSelection = () => setDraft(d => ({ ...d, groups: [...d.groups, { role: 'selection', name: 'selection' + d.groups.length, tone: TONES[d.groups.length % TONES.length], steps: [] }] }))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_420px] gap-5">
      <div className="flex min-w-0 flex-col gap-3">
        <Viewer text={structure.text} format={structure.format} atoms={structure.atoms} colour={colour} onPick={onPick} describe={describe} />
        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-muted-foreground">
          <span className="whitespace-nowrap">click an atom: in or out of <b className={toneText[draft.groups[current]?.tone || 'coral']}>{draft.groups[current]?.name}</b></span>
          <span className="whitespace-nowrap"><Kbd>shift</Kbd> click: its residue</span>
          <span className="whitespace-nowrap"><Kbd>alt</Kbd> click: its atom name in every residue of that name</span>
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Section label="Reference" />
        <GroupCard group={ref} atoms={structure.atoms} index={index} nrs={sets[0]} others={names(0)} current={current === 0} onCurrent={() => setCurrent(0)} onChange={g => setGroup(0, g)} />
        <Section label={'Selections ' + String(draft.groups.length - 1).padStart(2, '0')}><Button variant="dashed" size="sm" shape="pill" onClick={addSelection}><Plus /> group</Button></Section>
        {draft.groups.slice(1).map((g, k) => {
          const i = k + 1
          return <GroupCard key={keys.keys[i]} group={g} atoms={structure.atoms} index={index} nrs={sets[i]} others={names(i)} current={current === i} onCurrent={() => setCurrent(i)} onChange={x => setGroup(i, x)}
            onRemove={draft.groups.length > 2 ? () => { setDraft(d => ({ ...d, groups: d.groups.filter((_, j) => j !== i) })); setCardKeys(c => removeKey(c, i)); setCurrent(0) } : undefined} />
        })}
        {draft.groups.slice(1).map((g, k) => {
          const both = shared(sets[0], sets[k + 1])
          if (!both.length) return null
          return (
            <Alert key={'o' + k} variant="warning">
              <TriangleAlert />
              <AlertTitle>{ref.name} and {g.name} share {both.length} atom{both.length > 1 ? 's' : ''}</AlertTitle>
              <AlertDescription><p>Self-pairs at r = 0 and bonded neighbours distort g(r) of {g.name}. Exclusions don't change the normalisation.</p></AlertDescription>
              <AlertActions>
                <Button variant="outline" size="sm" disabled={draft.options.excl === true} onClick={() => setDraft(d => ({ ...d, options: { ...d.options, excl: true } }))}>{draft.options.excl === true ? '✓ exclusions on (-excl)' : 'use exclusions (-excl)'}</Button>
                <Button variant="ghost" size="sm" onClick={() => setGroup(k + 1, { ...g, steps: [...g.steps, { op: 'remove', rule: { kind: 'atoms', atoms: toRanges(both) }, note: 'shared with ' + ref.name }] })}>remove the {both.length} from {g.name}</Button>
              </AlertActions>
            </Alert>
          )
        })}
        <SizeCheck draft={draft} sets={sets} />
      </div>
    </div>
  )
}

interface Sizes { ok: boolean; problems: string[]; sizes: number[] | null }

/** The groups counted by gmx select against the run input (T21); a result shows only while the groups are unchanged. */
function SizeCheck({ draft, sets }: { draft: Draft; sets: number[][] }) {
  const runInput = draft.inputs.runInput?.path
  const body = { runInput, groups: draft.groups.map((g, i) => ({ name: g.name, atoms: toRanges(sets[i] || []) })) }
  const key = JSON.stringify(body)
  const [result, setResult] = React.useState<{ key: string; sizes?: Sizes; error?: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const run = async () => {
    setBusy(true)
    try { setResult({ key, sizes: await postJson<Sizes>('/api/sizes', body) }) } catch (e) { setResult({ key, error: (e as Error).message }) } finally { setBusy(false) }
  }
  const r = result?.key === key ? result : null
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" disabled={!runInput || busy || body.groups.some(g => !g.atoms)} onClick={run}>{busy ? 'counting…' : 'check sizes with gmx'}</Button>
        <span className="text-caption text-muted-foreground">{runInput ? 'gmx select on ' + runInput.split('/').pop() : 'needs a run input'}</span>
      </div>
      {r?.sizes?.ok && <p className="m-0 text-control text-mint-strong">✓ gmx counts the same: {draft.groups.map((g, i) => g.name + ' ' + r.sizes!.sizes![i]).join(' · ')}</p>}
      {r && !r.sizes?.ok && (
        <Alert variant="destructive"><X /><AlertTitle>these groups can't run</AlertTitle><AlertDescription>{(r.sizes?.problems || [r.error]).map(p => <p key={p} className="whitespace-pre-line">{p}</p>)}</AlertDescription></Alert>
      )}
    </div>
  )
}
