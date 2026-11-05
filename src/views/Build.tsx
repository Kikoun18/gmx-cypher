import * as React from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GripVertical, Plus, X } from 'lucide-react'
import { getJson, postJson } from '../api'
import type { BuildDraft } from '../buildDraft'
import { planProblems, STAGES, systemsOf, type BuildPlan, type Science, type StageId, type System } from '../lib/build/plan'
import { orderProblems, planSystem } from '../lib/build/steps'
import { CATS, firstSystem, keyOf, KINDS, pills, stepLine, tileSteps, toneOf, where } from '../lib/build/tiles'
import { toneSoft, toneSolid, toneText } from '../lib/tones'
import { cn } from '../lib/utils'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Status } from '../ui/status'

type Sel = { s: number; t: number }
const move = (plan: BuildPlan, from: Sel, to: Sel): BuildPlan => {
  const stages = plan.stages.map(s => ({ ...s, tiles: [...s.tiles] })), [tile] = stages[from.s].tiles.splice(from.t, 1)
  stages[to.s].tiles.splice(Math.min(to.t, stages[to.s].tiles.length), 0, tile)
  return { ...plan, stages }
}

function Palette({ onAdd }: { onAdd: (key: string) => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3">
      {CATS.map(c => {
        const kinds = Object.entries(KINDS).filter(([, v]) => v.cat === c.id)
        return (
          <div key={c.id} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 pt-1"><span className="text-label uppercase text-muted-foreground">{c.name}</span><span className="h-px flex-1 bg-border" /><span className="text-caption">{String(kinds.length).padStart(2, '0')}</span></div>
            {kinds.map(([key, v]) => (
              <button key={key} draggable onDragStart={e => e.dataTransfer.setData('text/x-tile', key)} onClick={() => onAdd(key)}
                className="group flex items-center gap-2 rounded-lg border border-border bg-background/40 px-2 py-1.5 text-left hover:border-ring">
                <span className={cn('grid size-7 shrink-0 place-items-center rounded-md', toneSoft[c.tone])}><v.icon className="size-3.5" aria-hidden /></span>
                <span className="flex min-w-0 flex-1 flex-col"><span className="text-control font-bold"><span className="sr-only">add </span>{v.label}</span><span className="truncate text-[11px] text-muted-foreground">{v.what}</span></span>
                <Plus className="size-3.5 text-muted-foreground group-hover:text-foreground" aria-hidden />
              </button>
            ))}
          </div>
        )
      })}
      <p className="m-0 text-[11px] text-muted-foreground">drag a tile onto the stack, or click it to add it after the selected tile</p>
    </div>
  )
}

/** symbuilder · build (R3c): the palette, the stack by stage, and the selected tile with its commands for the first system. */
export function BuildView({ draft, setDraft, gmx }: { draft: BuildDraft; setDraft: React.Dispatch<React.SetStateAction<BuildDraft>>; gmx: string }) {
  const plan = draft.plan, sys = firstSystem(draft), all = React.useMemo(() => planSystem(plan, sys, { base: '{base}' }), [plan, sys])
  const [sel, setSel] = React.useState<Sel>({ s: 0, t: plan.stages[0].tiles.findIndex(t => t.type === 'pdb2gmx') })
  const [folded, setFolded] = React.useState<StageId[]>([])
  const [drag, setDrag] = React.useState<Sel | null>(null)
  const setPlan = (p: BuildPlan) => setDraft(d => ({ ...d, plan: p }))
  const tileOf = (x: Sel) => plan.stages[x.s]?.tiles[x.t]
  const current = tileOf(sel) ? sel : { s: 0, t: 0 }
  const order = orderProblems(all)
  const add = (key: string, at = { s: current.s, t: current.t + 1 }) => {
    const kind = KINDS[key], s = plan.stages.findIndex(x => x.id === kind.stage), t = s === at.s ? at.t : plan.stages[s].tiles.length
    setPlan({ ...plan, stages: plan.stages.map((x, i) => (i === s ? { ...x, tiles: [...x.tiles.slice(0, t), kind.tile, ...x.tiles.slice(t)] } : x)) }); setSel({ s, t })
  }
  const step = (x: Sel, by: -1 | 1) => { const t = x.t + by; if (t < 0 || t >= plan.stages[x.s].tiles.length) return; setPlan(move(plan, x, { s: x.s, t })); setSel({ s: x.s, t }) }
  const toggle = (x: Sel) => setPlan({ ...plan, stages: plan.stages.map((s, i) => (i === x.s ? { ...s, tiles: s.tiles.map((t, j) => (j === x.t ? { ...t, on: !t.on } : t)) } : s)) })
  const remove = (x: Sel) => { setPlan({ ...plan, stages: plan.stages.map((s, i) => (i === x.s ? { ...s, tiles: s.tiles.filter((_, j) => j !== x.t) } : s)) }); setSel({ s: x.s, t: Math.max(0, x.t - 1) }) }
  const drop = (to: Sel) => (e: React.DragEvent) => {
    e.preventDefault()
    const key = e.dataTransfer.getData('text/x-tile')
    if (key && KINDS[key]?.stage === plan.stages[to.s].id) add(key, to)
    else if (drag && plan.stages[drag.s].id === plan.stages[to.s].id) { setPlan(move(plan, drag, to)); setSel(to) }
    setDrag(null)
  }
  return (
    <div className="grid grid-cols-[250px_minmax(0,1fr)_360px] items-start gap-5 max-[1180px]:grid-cols-[minmax(0,1fr)_330px]">
      <div className="max-[1180px]:hidden"><Palette onAdd={k => add(k)} /></div>
      <div className="flex flex-col gap-3">
        <PlanBar draft={draft} setPlan={setPlan} />
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3 text-control">
          <span className="flex flex-wrap items-center gap-2">for each system
            <span className={cn('rounded-full px-2 py-px text-caption', toneSoft.coral)}>{'{method}'} × {draft.systems.methods.length}</span>
            <span className={cn('rounded-full px-2 py-px text-caption', toneSoft.sky)}>{'{saccharide}'} × {draft.systems.saccharides.length}</span>
            <span className={cn('rounded-full px-2 py-px text-caption', toneSoft.mint)}>{'{sequence}'} × {draft.systems.sequences.length}</span></span>
          <span className="text-caption text-muted-foreground">= {systemsOf(draft.systems).length} systems · solutions/{'{method}/{saccharide}/{sequence}'}/ · <a href="#symbuilder/systems" className="text-[var(--ring)] underline underline-offset-[3px]">the systems →</a></span>
        </div>
        {order.map(o => <Status key={o} level="error" word="order">{o}</Status>)}
        {plan.stages.map((stage, si) => {
          const meta = STAGES[si], fold = folded.includes(stage.id)
          return (
            <section key={stage.id} aria-label={meta.name} className="flex flex-col gap-1.5">
              <div className="mt-2 flex items-center gap-2.5">
                <button aria-expanded={!fold} aria-label={(fold ? 'show ' : 'fold ') + meta.name} onClick={() => setFolded(f => (fold ? f.filter(x => x !== stage.id) : [...f, stage.id]))}>{fold ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}</button>
                <b className="text-control uppercase tracking-[0.08em]">{meta.name}</b>
                <span className="text-caption text-muted-foreground">{stage.tiles.length} {stage.tiles.length === 1 ? 'tile' : 'tiles'}{stage.id === 'walkers' ? ' · once 8.pull/pullx.xvg exists' : ''}</span>
                <span className="h-px flex-1 bg-border" />
                <button aria-pressed={stage.on} onClick={() => setPlan({ ...plan, stages: plan.stages.map((x, i) => (i === si ? { ...x, on: !x.on } : x)) })}
                  className={cn('rounded-full border px-2.5 py-px text-[11px]', stage.on ? cn('border-mint-strong/50', toneText.mint) : 'border-border text-muted-foreground line-through')}>{stage.on ? 'in this build' : 'left out'}</button>
              </div>
              {!fold && <div className="ml-[7px] flex flex-col gap-1.5 border-l border-dashed border-border pl-3" onDragOver={e => e.preventDefault()} onDrop={drop({ s: si, t: stage.tiles.length })}>
                {stage.tiles.map((tile, ti) => {
                  const key = keyOf(stage.id, tile), kind = KINDS[key], tone = toneOf(key), on = sel.s === si && sel.t === ti, off = !tile.on || !stage.on, outs = tileSteps(plan, si, ti, sys).flatMap(x => [...x.writes, ...x.replaces]).filter(f => !f.includes('/visualization/')), out = [...outs].reverse().find(f => f.endsWith('.gro')) ?? outs.pop()
                  if (!kind) return null
                  return (
                    <React.Fragment key={ti}>
                      <div draggable onDragStart={() => setDrag({ s: si, t: ti })} onDragEnd={() => setDrag(null)} onDragOver={e => e.preventDefault()} onDrop={drop({ s: si, t: ti })}
                        className={cn('flex items-center gap-2.5 rounded-xl border px-2.5 py-2', off ? 'border-dashed border-border text-muted-foreground' : cn(toneSoft[tone], 'border-current/25 text-foreground'), on && 'ring-2 ring-ring ring-offset-2 ring-offset-background', drag?.s === si && drag.t === ti && 'border-dashed')}>
                        <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
                        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', off ? 'border border-border' : toneSolid[tone])}><kind.icon className="size-4" aria-hidden /></span>
                        <button onClick={() => setSel({ s: si, t: ti })} aria-current={on ? 'true' : undefined} className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
                          <span className="flex flex-wrap items-baseline gap-x-2"><b className={cn('text-control', off ? 'text-muted-foreground' : toneText[tone])}>{kind.label}</b><span className="text-caption">{kind.what}</span></span>
                          <span className="flex flex-wrap gap-1">{pills(key, plan.science).map(p => <span key={p} className="whitespace-nowrap rounded-full border border-current/30 bg-background/40 px-2 py-px text-[11px] leading-4">{p}</span>)}</span>
                        </button>
                        <button onClick={() => toggle({ s: si, t: ti })} aria-pressed={tile.on} className="whitespace-nowrap rounded-full border border-border bg-background/50 px-2 py-px text-[11px]">{tile.on ? where(stage.id) : 'off'}</button>
                        <span className="flex text-muted-foreground">
                          <button aria-label={'move ' + kind.label + ' up'} onClick={() => step({ s: si, t: ti }, -1)} className="grid size-6 place-items-center rounded hover:bg-background/60"><ArrowUp className="size-3.5" /></button>
                          <button aria-label={'move ' + kind.label + ' down'} onClick={() => step({ s: si, t: ti }, 1)} className="grid size-6 place-items-center rounded hover:bg-background/60"><ArrowDown className="size-3.5" /></button>
                          <RemoveTile label={kind.label} onRemove={() => remove({ s: si, t: ti })} />
                        </span>
                      </div>
                      {out && tile.on && ti < stage.tiles.length - 1 && <span className="ml-3 w-fit rounded-md bg-muted px-1.5 text-[11px] text-muted-foreground">→ {out.split('/').pop()}</span>}
                    </React.Fragment>
                  )
                })}
              </div>}
            </section>
          )
        })}
      </div>
      {tileOf(current) && <Inspector plan={plan} setPlan={setPlan} si={current.s} ti={current.t} sys={sys} gmx={gmx} />}
    </div>
  )
}

/** Removing a tile is armed on the first click and done on the second (Morpheus). */
function RemoveTile({ label, onRemove }: { label: string; onRemove: () => void }) {
  const [armed, setArmed] = React.useState(false)
  React.useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 2600); return () => clearTimeout(t) }, [armed])
  return <button aria-label={armed ? 'click again to remove ' + label : 'remove ' + label} onClick={() => (armed ? onRemove() : setArmed(true))} className={cn('grid size-6 place-items-center rounded hover:bg-background/60', armed && 'bg-background text-foreground ring-1 ring-ring')}><X className="size-3.5" /></button>
}

/** The plan's name, saved build plans, and the plan as a JSON file (T209). */
function PlanBar({ draft, setPlan }: { draft: BuildDraft; setPlan: (p: BuildPlan) => void }) {
  const [saved, setSaved] = React.useState<{ id: string; name: string; problems: string[] }[]>([])
  const [said, setSaid] = React.useState(''), [clash, setClash] = React.useState(false)
  const list = React.useCallback(() => { getJson<typeof saved>('/api/builds').then(setSaved, () => {}) }, [])
  React.useEffect(list, [list])
  const save = async (replace = false) => {
    try { await postJson('/api/builds' + (replace ? '?replace=1' : ''), draft.plan); setSaid('saved'); setClash(false); list() }
    catch (e) { const m = (e as Error).message; setSaid(m); setClash((e as { status?: number }).status === 409) }
  }
  const load = async (id: string) => { try { setPlan(await getJson<BuildPlan>('/api/builds/' + encodeURIComponent(id))); setSaid('loaded ' + id) } catch (e) { setSaid((e as Error).message) } }
  const exportJson = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(draft.plan, null, 2) + '\n'], { type: 'application/json' })); a.download = draft.plan.name + '.build.json'; a.click(); URL.revokeObjectURL(a.href) }
  const importJson = async (f: File | undefined) => {
    if (!f) return
    try { const p = JSON.parse(await f.text()), problems = planProblems(p); if (problems.length) setSaid(problems.join('; ')); else { setPlan(p); setSaid('opened ' + f.name) } } catch { setSaid(f.name + ' is not JSON') }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label="build plan name" value={draft.plan.name} onChange={e => setPlan({ ...draft.plan, name: e.target.value })} className="w-[300px]" />
      <Button variant="outline" size="sm" onClick={() => save()}>save build plan</Button>
      {clash && <Button variant="outline" size="sm" onClick={() => save(true)}>replace it</Button>}
      {saved.length > 0 && (
        <select aria-label="open a saved build plan" className="h-[26px] rounded-sm border border-input bg-background px-2 text-caption" value="" onChange={e => e.target.value && load(e.target.value)}>
          <option value="">open…</option>{saved.map(p => <option key={p.id} value={p.id} disabled={p.problems.length > 0}>{p.name}</option>)}
        </select>
      )}
      <Button variant="ghost" size="sm" onClick={exportJson}>export json</Button>
      <label className="cursor-pointer text-caption underline-offset-[3px] hover:underline">import json<input type="file" accept=".json,application/json" className="sr-only" onChange={e => importJson(e.target.files?.[0])} /></label>
      <span className="text-caption text-muted-foreground" aria-live="polite">{said}</span>
    </div>
  )
}

/** Which science values a tile's options are. */
const OPTIONS: Partial<Record<string, (keyof Science | `mdp.${keyof Science['mdp']}`)[]>> = {
  pdb2gmx: ['forcefield', 'answers'], 'editconf:saccharide': ['shift'], merge: ['box'], genion: ['salt', 'ionCharge', 'positive', 'negative', 'waterMolarity'],
  'md:min': ['mdp.min', 'maxwarn'], 'md:nvt': ['mdp.nvt', 'maxwarn'], 'md:npt': ['mdp.npt', 'maxwarn'], awh: ['mdp.awh', 'mdp.awhHmr'], pull: ['mdp.pull'], walkers: ['walkers', 'mdp.walkers'],
}
const read = (sc: Science, k: string) => { const v = k.startsWith('mdp.') ? sc.mdp[k.slice(4) as keyof Science['mdp']] : sc[k as keyof Science]; return Array.isArray(v) ? v.join(' ') : String(v) }
function write(sc: Science, k: string, text: string): Science {
  if (k.startsWith('mdp.')) return { ...sc, mdp: { ...sc.mdp, [k.slice(4)]: text } }
  const old = sc[k as keyof Science]
  if (Array.isArray(old)) { const v = text.trim().split(/\s+/).map(Number); return v.every(Number.isFinite) ? { ...sc, [k]: v } : sc }
  if (typeof old === 'number') { const v = Number(text); return Number.isFinite(v) ? { ...sc, [k]: v } : sc }
  return { ...sc, [k]: text }
}

function Inspector({ plan, setPlan, si, ti, sys, gmx }: { plan: BuildPlan; setPlan: (p: BuildPlan) => void; si: number; ti: number; sys: System; gmx: string }) {
  const stage = plan.stages[si], tile = stage.tiles[ti], key = keyOf(stage.id, tile), kind = KINDS[key], tone = toneOf(key), steps = tileSteps(plan, si, ti, sys)
  const files = (what: 'reads' | 'writes' | 'replaces') => [...new Set(steps.flatMap(s => s[what]))].map(f => f.startsWith(sys.dir + '/') ? f.slice(sys.dir.length + 1) : f)
  return (
    <aside aria-label={'the selected tile: ' + kind.label} className="sticky top-4 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', toneSolid[tone])}><kind.icon className="size-5" aria-hidden /></span>
        <div className="flex min-w-0 flex-1 flex-col"><b className="text-heading">{kind.label}</b><span className="text-caption text-muted-foreground">{STAGES[si].name} · {kind.what}</span></div>
        <span className={cn('rounded-full px-2.5 py-0.5 text-[11px]', toneSoft[tone])}>{CATS.find(c => c.id === kind.cat)!.name}</span>
      </div>
      <div className="flex items-center gap-2"><span className="text-label uppercase text-muted-foreground">command · first system</span><span className="h-px flex-1 bg-border" /></div>
      {steps.length ? (
        <pre className="m-0 whitespace-pre-wrap break-all rounded-xl border border-border bg-background px-3 py-2.5 text-caption leading-5">
          {steps.map((s, i) => <React.Fragment key={i}>{stepLine(s, gmx)}{s.stdin ? '\n# stdin  ' + s.stdin.trim().split('\n').join(' · ') : ''}{'\n'}</React.Fragment>)}
        </pre>
      ) : <span className="text-caption text-muted-foreground">{tile.type === 'hmr' ? 'nothing for ' + sys.method + ': its name has no hmr' : tile.type === 'glucose' ? 'planned once insert-molecules\' output is known' : 'off'}</span>}
      <span className="-mt-2 text-caption text-muted-foreground">in {steps[0]?.cwd ?? sys.dir} · {sys.method} / {sys.saccharide} / {sys.sequence}{steps.some(s => s.resolves?.length) ? ' · the {values} are worked out while it builds' : ''}</span>
      {OPTIONS[key] && <>
        <div className="flex items-center gap-2"><span className="text-label uppercase text-muted-foreground">options · the whole build plan</span><span className="h-px flex-1 bg-border" /></div>
        <div className="grid grid-cols-2 gap-3">
          {OPTIONS[key]!.map(o => (
            <label key={o} className="flex flex-col gap-1 text-label uppercase text-muted-foreground">{o.replace('mdp.', 'mdp · ')}
              <Input size="sm" defaultValue={read(plan.science, o)} key={key + o + read(plan.science, o)} onBlur={e => setPlan({ ...plan, science: write(plan.science, o, e.target.value) })} className="normal-case" /></label>
          ))}
        </div>
      </>}
      <div className="flex items-center gap-2"><span className="text-label uppercase text-muted-foreground">files</span><span className="h-px flex-1 bg-border" /></div>
      <dl className="m-0 grid grid-cols-[70px_1fr] gap-y-1 text-caption">
        {(['reads', 'writes', 'replaces'] as const).map(w => files(w).length > 0 && <React.Fragment key={w}><dt className="text-muted-foreground">{w}</dt><dd className="m-0 break-all">{files(w).join(' · ')}</dd></React.Fragment>)}
      </dl>
      <span className="text-caption text-muted-foreground">runs {where(stage.id).replace(' · qq script', ': its qq script, and the submit line printed')}</span>
    </aside>
  )
}
