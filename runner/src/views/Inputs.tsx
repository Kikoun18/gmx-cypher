import * as React from 'react'
import { FileText, Folder, FolderOpen, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Dropzone } from '../ui/dropzone'
import { Section } from '../ui/separator'
import { X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { getJson, postJson, type AppState } from '../api'
import type { Draft, Picked } from '../draft'
import { COMMANDS, commandOf } from '../lib/commands'
import { inputRole, type Role, type Slot } from '../lib/inputs'
import { useTerms } from '../terms'
import { cn } from '../lib/utils'
import { fmtBytes } from '../../../app/src/lib/structFile'

interface Entry { name: string; kind: 'dir' | 'file'; size: number; mtime: number; role: Role | 'output' | null }
interface Listing { path: string; parent: string | null; entries: Entry[]; hidden: number }

const SLOTS: { slot: Slot; label: string; accepts: Role[]; optional?: boolean }[] = [
  { slot: 'trajectory', label: 'trajectory', accepts: ['trajectory', 'structure'] },
  { slot: 'runInput', label: 'run input', accepts: ['run input'] },
  { slot: 'structure', label: 'structure', accepts: ['structure'] },
  { slot: 'index', label: 'index', accepts: ['index'], optional: true },
  { slot: 'edr', label: 'energy file', accepts: ['energy file'] },
]
const SLOT_OF: Partial<Record<Role, Slot>> = { trajectory: 'trajectory', 'run input': 'runInput', structure: 'structure', index: 'index', 'energy file': 'edr' }

/** A folder as `root-name/rest`, relative to the allowed folder it is in. */
const short = (dir: string, roots: string[]) => { const r = roots.find(x => dir === x || dir.startsWith(x + '/')); return r ? r.split('/').pop() + dir.slice(r.length) : dir }
const join = (dir: string, name: string) => (dir.endsWith('/') ? dir : dir + '/') + name
const when = (ms: number) => { const d = new Date(ms), p = (n: number) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) }

function Browser({ roots, path, onPath, used, onFile }: { roots: string[]; path: string | null; onPath: (p: string) => void; used: Set<string>; onFile: (p: string, e: Entry) => void }) {
  const [listing, setListing] = React.useState<Listing | null>(null)
  const [error, setError] = React.useState('')
  React.useEffect(() => {
    if (!path) return
    getJson<Listing>('/api/ls?path=' + encodeURIComponent(path)).then(l => { setListing(l); setError('') }, e => setError(String(e.message || e)))
  }, [path])
  const root = roots.find(r => path === r || path?.startsWith(r + '/'))
  const crumbs = root && path ? [root, ...path.slice(root.length).split('/').filter(Boolean)] : []
  return (
    <Card className="gap-0 p-0">
      <div className="flex min-h-11 flex-wrap items-center gap-1 border-b border-border px-4 py-2.5 text-control">
        <FolderOpen className="size-4 text-muted-foreground" />
        {crumbs.map((c, i) => {
          const to = i === 0 ? c : root + '/' + crumbs.slice(1, i + 1).join('/')
          const label = i === 0 ? c.split('/').pop() : c
          return <React.Fragment key={to}>{i > 0 && <span className="text-muted-foreground">/</span>}{i < crumbs.length - 1 ? <button className="text-coral-strong hover:underline" title={to} onClick={() => onPath(to)}>{label}</button> : <span className="font-bold" title={to}>{label}</span>}</React.Fragment>
        })}
        <span className="flex-1" />
        {listing && <span className="text-caption text-muted-foreground">{listing.entries.filter(e => e.kind === 'file').length} files{listing.hidden ? ' · ' + listing.hidden + ' other files not shown' : ''}</span>}
      </div>
      {error && <p className="m-0 px-4 py-3 text-control text-destructive">✗ {error}</p>}
      {listing && (
        <table className="w-full text-control">
          <thead><tr className="text-left text-label uppercase text-muted-foreground"><th className="px-4 py-2 font-normal">name</th><th className="font-normal">kind</th><th className="font-normal">size</th><th className="pr-4 font-normal">modified</th></tr></thead>
          <tbody>
            {listing.parent && <tr className="border-t border-border"><td colSpan={4} className="px-4 py-1.5"><button className="inline-flex items-center gap-2 hover:underline" onClick={() => onPath(listing.parent!)}><Folder className="size-4 text-muted-foreground" />..</button></td></tr>}
            {listing.entries.map(e => {
              const p = join(listing.path, e.name)
              return (
                <tr key={e.name} className={cn('border-t border-border hover:bg-background', used.has(p) && 'bg-background font-bold')}>
                  <td className="px-4 py-1.5">
                    <button className="inline-flex items-center gap-2 text-left" onClick={() => (e.kind === 'dir' ? onPath(p) : onFile(p, e))} disabled={e.kind === 'file' && e.role === 'output'}>
                      {e.kind === 'dir' ? <Folder className="size-4 text-muted-foreground" /> : <FileText className="size-4 text-muted-foreground" />}{e.name}
                    </button>
                  </td>
                  <td>{e.kind === 'dir' ? <span className="text-muted-foreground">folder</span> : e.role && <Badge variant="outline">{e.role}</Badge>}</td>
                  <td>{e.kind === 'dir' ? '—' : fmtBytes(e.size)}</td>
                  <td className="pr-4 text-muted-foreground">{when(e.mtime)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Card>
  )
}

interface InputCheck {
  ok: boolean; problems: string[]
  counts: { structure: number | null; runInput: number | null; trajectory: number | null }
  index?: { groups: number; maxAtom: number }; estimate?: { frames: number; start: number; end: number } | null
}

/** Re-checked whenever an input changes: counts as gmx reads them, and every problem in words (R2b). */
function useInputCheck(inputs: Draft['inputs']) {
  const key = JSON.stringify(Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v!.path])))
  const complete = !!(inputs.trajectory && inputs.runInput && inputs.structure)
  const [result, setResult] = React.useState<{ key: string; check: InputCheck } | null>(null)
  React.useEffect(() => {
    if (!complete) return
    let alive = true
    const fail = (e: Error) => ({ ok: false, problems: [e.message], counts: { structure: null, runInput: null, trajectory: null } })
    postJson<InputCheck>('/api/check', { inputs: JSON.parse(key) }).then(c => alive && setResult({ key, check: c }), e => alive && setResult({ key, check: fail(e) }))
    return () => { alive = false }
  }, [key, complete])
  // The result shown is only ever the one for the current inputs.
  return { check: complete && result?.key === key ? result.check : null, busy: complete && result?.key !== key }
}

function Checks({ check, busy }: ReturnType<typeof useInputCheck>) {
  if (busy) return <p className="m-0 text-control text-muted-foreground" aria-live="polite">checking…</p>
  if (!check) return <p className="m-0 text-control text-muted-foreground">pick a trajectory, a run input and a structure</p>
  const row = (label: string, how: string, n: number | null) => (
    <tr key={label}><td className="py-1 text-muted-foreground">{label}</td><td className="text-caption text-muted-foreground">{how}</td><td className="text-right font-bold">{n == null ? '—' : n + ' atoms'}</td></tr>
  )
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <table className="text-control"><tbody>
        {row('structure', 'read here', check.counts.structure)}
        {row('run input', 'gmx dump', check.counts.runInput)}
        {row('trajectory', 'gmx check', check.counts.trajectory)}
        {check.index && <tr><td className="py-1 text-muted-foreground">index</td><td className="text-caption text-muted-foreground">{check.index.groups} groups</td><td className="text-right font-bold">atoms ≤ {check.index.maxAtom}</td></tr>}
      </tbody></table>
      {check.ok ? (
        <p className="m-0 text-control text-mint-strong">✓ the inputs agree{check.estimate ? ' · ≈' + check.estimate.frames + ' frames, ' + check.estimate.start + '–' + check.estimate.end + ' ps (from the run input)' : ''}</p>
      ) : (
        <Alert variant="destructive"><X /><AlertTitle>these inputs can't run together</AlertTitle><AlertDescription>{check.problems.map(p => <p key={p}>{p}</p>)}</AlertDescription></Alert>
      )}
    </div>
  )
}

export function Inputs({ state, draft, setDraft, onSettings, onNext }: { state: AppState; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; onSettings: () => void; onNext?: () => void }) {
  // The slots the analysis asks for: an energy file alone for gmx energy; the four for the rest (section 7).
  const command = commandOf(draft.analysis ?? 'rdf') ?? COMMANDS[0]
  const slots = command.inputs.map(slot => SLOTS.find(s => s.slot === slot)!)
  // Only the slots shown are checked: a file another command uses can't hold this one up (review finding 7).
  const checked = useInputCheck(command.groups ? Object.fromEntries(Object.entries(draft.inputs).filter(([k]) => command.inputs.includes(k as Slot))) : {})
  const energy = useTerms(command.tool === 'energy' ? draft.inputs.edr?.path : undefined)
  const ready = command.tool === 'energy' ? !!energy?.terms : !!checked.check?.ok
  const roots = state.config.allow
  const [path, setPath] = React.useState<string | null>(() => { const t = draft.inputs.trajectory?.path; return t ? t.slice(0, t.lastIndexOf('/')) : roots[0] || null })
  const [picking, setPicking] = React.useState<Slot | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const used = new Set(Object.values(draft.inputs).map(p => p!.path))

  // Another energy file is another menu: its terms are picked again, never carried over by number (review finding 4).
  const set = (slot: Slot, p: Picked) => setDraft(d => ({ ...d, inputs: { ...d.inputs, [slot]: p }, ...(slot === 'edr' && d.inputs.edr?.path !== p.path ? { terms: [] } : {}) }))
  // A trajectory's suggestions replace the slots they fill; the others (an energy file) stay.
  const others = (inputs: Draft['inputs']) => Object.fromEntries(Object.entries(inputs).filter(([k]) => !['trajectory', 'runInput', 'structure', 'index'].includes(k))) as Draft['inputs']
  const assign = async (p: string, role: Role | 'output' | null) => {
    const slot = picking || (role && role !== 'output' ? SLOT_OF[role] : undefined)
    const ok = slot && SLOTS.find(s => s.slot === slot)!.accepts.includes(role as Role)
    if (!slot || !ok) { toast.error('✗ ' + p.split('/').pop() + ' is not a ' + (picking ? SLOTS.find(s => s.slot === picking)!.label : 'GROMACS input')); return }
    if (!command.inputs.includes(slot)) { toast.error('✗ ' + p.split('/').pop() + ' is a ' + role + ': gmx ' + command.tool + ' takes ' + slots.map(s => s.label).join(' and ')); return }
    setPicking(null)
    if (slot !== 'trajectory') { set(slot, { path: p, why: 'picked' }); return }
    try { setDraft(d => ({ ...d, inputs: others(d.inputs) })); const s = await getJson<Draft['inputs']>('/api/suggest?trajectory=' + encodeURIComponent(p)); setDraft(d => ({ ...d, inputs: { ...others(d.inputs), ...s } })) }
    catch (e) { toast.error('✗ ' + (e as Error).message) }
  }
  const upload = async (files: File[]) => {
    for (const f of files) {
      const role = inputRole(f.name)
      if (!role || role === 'output') { toast.error('✗ ' + f.name + ' is not a GROMACS input (.xtc .trr .tng .tpr .gro .pdb .ndx .edr); not uploaded'); continue }
      try {
        const r = await fetch('/api/upload?name=' + encodeURIComponent(f.name), { method: 'POST', body: f })
        const body = await r.json()
        if (!r.ok) throw new Error(body.error)
        toast('✓ ' + f.name + ' uploaded · ' + fmtBytes(body.size))
        await assign(body.path, role)
      } catch (e) { toast.error('✗ ' + f.name + ': ' + (e as Error).message) }
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-5">
      <div className="flex min-w-0 flex-col gap-4">
        <Section label="Allowed folders"><Button variant="ghost" size="sm" onClick={onSettings}>+ folder</Button></Section>
        {roots.length ? (
          <div className="flex flex-wrap gap-2">
            {roots.map(r => <button key={r} onClick={() => setPath(r)}><Badge tone={path?.startsWith(r) ? 'stone' : undefined} appearance="solid" variant="outline">{r}</Badge></button>)}
          </div>
        ) : <p className="m-0 text-control text-muted-foreground">no folder is allowed yet · add one in settings, or start with --allow &lt;folder&gt;</p>}
        {picking && <p className="m-0 text-control" aria-live="polite">pick the {SLOTS.find(s => s.slot === picking)!.label} · <button className="text-coral-strong hover:underline" onClick={() => setPicking(null)}>stop picking</button></p>}
        {path && <Browser roots={[...roots, ...Object.values(draft.inputs).map(p => p!.path.slice(0, p!.path.lastIndexOf('/')))]} path={path} onPath={setPath} used={used} onFile={(p, e) => assign(p, e.role)} />}
        <input ref={fileRef} type="file" multiple hidden onChange={e => { upload(Array.from(e.target.files || [])); e.target.value = '' }} />
        <Dropzone className="max-w-none py-6" title="Drop files here" description="any GROMACS input, by upload into gmx-cypher's own folder · large trajectories are better picked by path, where they are"
          onFiles={upload} action={<Button variant="outline" onClick={() => fileRef.current?.click()}><Upload /> choose files</Button>} />
      </div>
      <div className="flex flex-col gap-4">
        <Section label="This run" />
        {slots.map(({ slot, label, optional: always }) => {
          // Optional: the index for RDF; for a command without groups, any input it can run without (energy's run input).
          const optional = always || (!command.groups && !command.required.includes(slot))
          const p = draft.inputs[slot]
          return (
            <div key={slot} className="flex items-start gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-label uppercase text-muted-foreground">{label}{optional && ' · optional'}</span>
                <span className="truncate text-body font-bold">{p ? p.path.split('/').pop() : '—'}</span>
                {p && <span className="truncate text-caption text-muted-foreground" title={p.path}>{short(p.path.slice(0, p.path.lastIndexOf('/')), roots)}</span>}
                {p && <span className="text-caption text-muted-foreground">{p.why}</span>}
              </div>
              {p && optional && <Button variant="ghost" size="sm" onClick={() => setDraft(d => { const { [slot]: _gone, ...rest } = d.inputs; return { ...d, inputs: rest } })}>clear</Button>}
              <Button variant={picking === slot ? 'secondary' : 'ghost'} size="sm" onClick={() => setPicking(picking === slot ? null : slot)}>{p ? 'change' : 'pick'}</Button>
            </div>
          )
        })}
        <Section label="Checks" />
        {command.tool === 'energy'
          ? <p className="m-0 text-control" aria-live="polite">{draft.inputs.edr ? energy?.terms ? '✓ ' + energy.terms.length + ' terms · read by gmx energy' : energy?.error ? '✗ ' + energy.error : 'reading the terms…' : 'pick an energy file'}</p>
          : <Checks {...checked} />}
        {onNext && <Button size="lg" className="self-start" disabled={!ready || !state.gmx.ok} onClick={onNext}>use these inputs</Button>}
      </div>
    </div>
  )
}
