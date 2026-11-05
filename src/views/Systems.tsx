import * as React from 'react'
import { X } from 'lucide-react'
import type { BuildDraft, IfExists } from '../buildDraft'
import { nameProblem, repeatName, STAGES, switches, systemsOf, type Systems } from '../lib/build/plan'
import { orderProblems, planSystem } from '../lib/build/steps'
import { toneSolid, toneSoft, toneText, type Tone } from '../lib/tones'
import { TONES } from '../core'
import { cn } from '../lib/utils'
import { Button } from '../ui/button'
import { Stat } from '../ui/card'
import { Input } from '../ui/input'
import { pressed } from '../lib/shortcuts'
import { Status } from '../ui/status'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'

const Head = ({ label, n }: { label: string; n?: number }) => (
  <div className="flex items-center gap-2"><span className="text-label uppercase text-muted-foreground">{label}</span><span className="h-px flex-1 bg-border" />{n != null && <span className="text-control">{String(n).padStart(2, '0')}</span>}</div>
)
const Panel = ({ className, ...p }: React.ComponentProps<'section'>) => <section className={cn('flex flex-col gap-3 rounded-2xl border border-border bg-card p-4', className)} {...p} />
const HEAVY = [['min', 'minimise'], ['nvt', 'equilibrate nvt'], ['npt', 'equilibrate npt'], ['awh', 'awh'], ['pull', 'pull'], ['walkers', 'walker windows']] as const

/** One list of names, as chips: each removable, a new one typed and checked (it lands in folders and arguments). */
function Chips({ label, kind, items, tones, onChange }: { label: string; kind: 'method' | 'saccharide' | 'sequence'; items: string[]; tones: (i: number) => Tone; onChange: (v: string[]) => void }) {
  const [text, setText] = React.useState(''), problem = text.trim() ? nameProblem(kind, text.trim()) : null
  const add = () => { const v = text.trim(); if (!v || problem || items.includes(v)) return; onChange([...items, v]); setText('') }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-label uppercase text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((v, i) => (
          <span key={v} className={cn('inline-flex items-center gap-1 rounded-md py-0.5 pl-2.5 pr-1 text-control font-bold', toneSolid[tones(i)])}>{v}
            <button aria-label={'leave out ' + v} onClick={() => onChange(items.filter(x => x !== v))} className="grid size-5 place-items-center rounded hover:bg-background/30"><X className="size-3" /></button></span>
        ))}
        <Input size="sm" aria-label={'add a ' + kind} placeholder={'+ ' + kind} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => pressed(e, 'enter') && add()} onBlur={add} className="w-[150px]" />
      </div>
      {problem && <Status inline level="error" word="not a name">{problem}</Status>}
    </div>
  )
}

/** symbuilder · systems (R3c): methods × saccharides × sequences, repeats, and a preview of every system before anything runs. */
export function SystemsView({ draft, setDraft }: { draft: BuildDraft; setDraft: React.Dispatch<React.SetStateAction<BuildDraft>> }) {
  const s = draft.systems, all = systemsOf(s), set = (patch: Partial<Systems>) => setDraft(d => ({ ...d, systems: { ...d.systems, ...patch } }))
  const sacTone = (c: string) => TONES[Math.max(0, s.saccharides.indexOf(c)) % TONES.length]
  const plan = draft.plan, scripted = plan.stages.filter(x => x.on && x.tiles.some(t => t.on) && x.id !== 'sb').length
  const rows = React.useMemo(() => all.map(sys => { const steps = planSystem(plan, sys, { base: '{base}' }); return { sys, steps, problems: orderProblems(steps) } }), [all, plan])
  const here = rows[0]?.steps.filter(x => x.where === 'here').length ?? 0
  return (
    <div className="grid grid-cols-[300px_minmax(0,1fr)_minmax(0,1.15fr)] items-start gap-5 max-[1180px]:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Panel aria-label="where heavy steps run" className="max-[1180px]:col-span-2">
        <Head label="where heavy steps run" />
        <p className="m-0 text-caption text-muted-foreground">minimise, nvt and npt run here, with a progress bar, as in the notebook · awh, pull and the walkers get a qq script and its submit line · the next system starts while one waits for the cluster</p>
        <div role="img" aria-label="three systems: each prepared here, then its qq job on the cluster, then it goes on; the next system starts while the first waits" className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-3">
          {[[0, 8, 38], [8, 16, 46], [16, 24, 54]].map(([a, b, c], i) => (
            <div key={i} className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-2"><span className="text-[11px] text-muted-foreground">system {i + 1}</span>
              <div className="relative h-[18px] rounded-xs bg-card">{([[a, 8, 'bg-stone'], [b, 30, 'bg-butter'], [c, 8, 'bg-sky']] as const).map(([l, w, bg]) => <span key={bg} className={cn('absolute inset-y-0 rounded-xs', bg)} style={{ left: l + '%', width: w + '%' }} />)}</div></div>
          ))}
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 pl-[60px] text-[10px] leading-[14px] text-muted-foreground">
            {([['bg-stone', 'prepare here'], ['bg-butter', 'qq job on the cluster'], ['bg-sky', 'goes on after the job']] as const).map(([bg, w]) => <span key={w}><span aria-hidden className={cn('mr-1.5 inline-block size-2 rounded-[2px]', bg)} />{w}</span>)}<span>time →</span>
          </div>
        </div>
        <Head label="heavy tiles" n={HEAVY.length} />
        {HEAVY.map(([id, name]) => {
          const cluster = id === 'awh' || id === 'pull' || id === 'walkers', on = plan.stages.find(x => x.id === id)?.on
          return <div key={id} className={cn('flex justify-between border-t border-border pt-1.5 text-caption', !on && 'text-muted-foreground')}><b>{name}</b><span className={cluster ? toneText.butter : 'text-muted-foreground'}>{on ? (cluster ? 'cluster' : 'here') : 'left out'}</span></div>
        })}
      </Panel>
      <Panel aria-label="systems">
        <Head label="systems" n={all.length} />
        <Chips label="{method}" kind="method" items={s.methods} tones={() => 'coral'} onChange={v => set({ methods: v })} />
        <Chips label="{saccharide}" kind="saccharide" items={s.saccharides} tones={i => TONES[i % TONES.length]} onChange={v => set({ saccharides: v })} />
        <Chips label="{sequence}" kind="sequence" items={s.sequences} tones={() => 'coral'} onChange={v => set({ sequences: v })} />
        <span className="text-caption text-muted-foreground">each method switches on what its name says: hmr · hydrogen masses by gromologist, fast · TIP3PF water · sequences keep your spelling in folder names, upper-case for PyMOL</span>
        <Head label="if a folder already exists" />
        <ToggleGroup type="single" size="sm" value={draft.ifExists} onValueChange={v => v && setDraft(d => ({ ...d, ifExists: v as IfExists }))} aria-label="if a folder already exists">
          <ToggleGroupItem value="continue">continue</ToggleGroupItem><ToggleGroupItem value="skip">skip</ToggleGroupItem><ToggleGroupItem value="repeat">repeat (r, r1 …)</ToggleGroupItem>
        </ToggleGroup>
        <span className="text-caption text-muted-foreground">{draft.ifExists === 'continue' ? 'from the first step whose output is missing · nothing is overwritten' : draft.ifExists === 'skip' ? 'a system whose folder exists is left as it is' : 'a new folder tree beside it, with the next repeat\'s name'}</span>
        <Head label="repeats" />
        <label className="flex items-center gap-3 text-control">build every system again, as repeats
          <Input size="sm" type="number" min={0} max={9} value={s.repeats} onChange={e => set({ repeats: Math.max(0, Math.min(9, Number(e.target.value) || 0)) })} className="w-[64px]" /></label>
        {s.methods[0] && (
          <div className="overflow-hidden rounded-xl border border-border text-caption">
            {Array.from({ length: s.repeats + 1 }, (_, r) => (
              <div key={r} className="flex gap-4 border-b border-border px-3 py-1.5 last:border-0"><span className="w-20 text-muted-foreground">{r ? 'repeat ' + r : 'original'}</span><b>solutions/{repeatName(s.methods[0], r)}/{s.saccharides[0] ?? '{saccharide}'}/{s.sequences[0] ?? '{sequence}'}</b></div>
            ))}
          </div>
        )}
      </Panel>
      <Panel aria-label="preview" className="max-[1180px]:col-span-2">
        <Head label="preview" n={all.length} />
        <div className="grid grid-cols-3 gap-2">
          <Stat label="systems" value={all.length} hint={s.methods.length + ' × ' + s.saccharides.length + ' × ' + s.sequences.length + (s.repeats ? ' × ' + (s.repeats + 1) : '')} />
          <Stat label="qq scripts" value={all.length * plan.stages.filter(x => x.on && ['min', 'nvt', 'npt', 'awh', 'pull', 'walkers'].includes(x.id)).length} hint={scripted + ' per system'} />
          <Stat label="steps here" value={all.length * here} hint={here + ' per system'} />
        </div>
        {!all.length && <p className="m-0 text-control text-muted-foreground">add a method, a saccharide and a sequence: every combination is a system</p>}
        {all.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-2 border-b border-border px-3 py-1.5 text-label uppercase text-muted-foreground"><span>system</span><span>check</span></div>
            {rows.slice(0, 200).map(({ sys, problems }) => (
              <div key={sys.dir} className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-center gap-2 border-b border-border px-3 py-1.5 text-caption last:border-0">
                <span className="truncate">{sys.method} / <span className={toneText[sacTone(sys.saccharide)]}>{sys.saccharide}</span> / <b>{sys.sequence}</b>{switches(sys.method).hmr ? <span className={cn('ml-2 rounded px-1', toneSoft.sky)}>hmr</span> : null}{switches(sys.method).fast ? <span className={cn('ml-1 rounded px-1', toneSoft.aqua)}>fast</span> : null}</span>
                {problems.length ? <Status inline level="error" word="order">{problems[0]}</Status> : <Status inline level="ok" word="ready" />}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" disabled aria-describedby="build-later">build {all.length} {all.length === 1 ? 'system' : 'systems'}</Button>
          <span id="build-later" className="text-caption text-muted-foreground">building comes in the next version · this preview is every command each system will run, before anything runs</span>
        </div>
        <Head label="stages" />
        <div className="flex flex-wrap gap-1.5">{STAGES.map(st => {
          const on = !!plan.stages.find(x => x.id === st.id)?.on
          return <button key={st.id} aria-pressed={on} onClick={() => setDraft(d => ({ ...d, plan: { ...d.plan, stages: d.plan.stages.map(x => (x.id === st.id ? { ...x, on: !on } : x)) } }))}
            className={cn('rounded-full border px-3 py-0.5 text-caption', on ? cn('border-mint-strong/60', toneSoft.mint) : 'border-border text-muted-foreground line-through')}>{st.name}</button>
        })}</div>
        <span className="text-caption text-muted-foreground">{plan.stages.filter(x => x.on).length} of 7 stages in this build · like processes = [...] in the notebook · a stage left out reads what an earlier build left on disk</span>
        <Head label="when a system fails" />
        <ToggleGroup type="single" size="sm" value={draft.onFailure} onValueChange={v => v && setDraft(d => ({ ...d, onFailure: v as 'next' | 'stop' }))} aria-label="when a system fails">
          <ToggleGroupItem value="next">go on with the next system</ToggleGroupItem><ToggleGroupItem value="stop">stop the build</ToggleGroupItem>
        </ToggleGroup>
      </Panel>
    </div>
  )
}
