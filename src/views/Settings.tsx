import * as React from 'react'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogHeading, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Field, FieldHint, Label } from '../ui/label'
import { Kbd } from '../ui/kbd'
import { Section } from '../ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { getJson, postJson, type AppState } from '../api'
import { bindingOf, DEFAULT_BINDINGS, keyLabel, keyProblem, pressed, useBindings, type Bindings } from '../lib/shortcuts'
import { KEYS, type KeyAction } from '../core/contract'
import { Status } from '../ui/status'
import { ExportSettings } from './ExportSettings'
import { DEFAULT_PROFILES, PROFILES, SCRIPTED_STAGES, type ScriptedStage } from '../lib/build/qq'

/** The key of one action: change it by pressing the new one (Escape keeps the old one); what it would clash with, in words. */
function KeyField({ action, words, bindings, setBindings }: { action: KeyAction; words: string; bindings: Bindings; setBindings: (b: Bindings) => void }) {
  const [listening, setListening] = React.useState(false)
  const b = bindings[action], problem = keyProblem(b, action, bindings), id = 'key-' + action
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
      <span id={id + '-label'} className="text-control">{words}</span>
      <div className="flex items-center gap-1.5">
        <Kbd className="h-6 min-w-6 text-[11px]">{keyLabel(b)}</Kbd>
        <Button id={id} variant="outline" size="sm" aria-pressed={listening} aria-labelledby={id + '-label ' + id} data-key-listening={listening || undefined}
          onClick={() => setListening(l => !l)} onBlur={() => setListening(false)}
          onKeyDown={e => {
            if (!listening) return
            e.preventDefault(); e.stopPropagation()
            if (pressed(e, 'escape')) { setListening(false); return }
            const next = bindingOf(e)
            if (!next) return
            setBindings({ ...bindings, [action]: next }); setListening(false)
          }}>{listening ? 'press a key…' : 'change'}</Button>
        {b && <Button variant="ghost" size="sm" onClick={() => setBindings({ ...bindings, [action]: null })}>no key</Button>}
        {keyLabel(b) !== keyLabel(DEFAULT_BINDINGS[action]) && <Button variant="ghost" size="sm" onClick={() => setBindings({ ...bindings, [action]: DEFAULT_BINDINGS[action] })}>back to {keyLabel(DEFAULT_BINDINGS[action])}</Button>}
      </div>
      {problem && <Status level="error" className="col-span-2">{problem}</Status>}
    </div>
  )
}

/** Every key (R8b), by where it works; kept in this browser. */
function Keyboard() {
  const [bindings, setBindings] = useBindings()
  return (
    <div className="flex flex-col gap-3">
      {(['anywhere', 'structures', 'compare'] as const).map(w => (
        <div key={w} className="flex flex-col gap-2">
          <span className="text-label uppercase text-muted-foreground">{w}</span>
          {KEYS.filter(k => k.where === w).map(k => <KeyField key={k.action} action={k.action} words={k.words} bindings={bindings} setBindings={setBindings} />)}
        </div>
      ))}
      <FieldHint>keys work anywhere but in a field · {keyLabel(bindings.sheet)} lists them all, with the keys that are not rebound · kept in this browser</FieldHint>
    </div>
  )
}

export function Settings({ state, open, onOpenChange, onState, returnFocus }: { state: AppState; open: boolean; onOpenChange: (o: boolean) => void; onState: (s: AppState) => void; returnFocus?: React.RefObject<HTMLElement | null> }) {
  const [gmx, setGmx] = React.useState(state.config.gmx || '')
  const [busy, setBusy] = React.useState(false)
  const [folder, setFolder] = React.useState('')
  const [folderError, setFolderError] = React.useState('')
  const [vault, setVault] = React.useState(state.config.vault || '')
  const [vaultError, setVaultError] = React.useState('')
  const [pmfUrl, setPmfUrl] = React.useState(state.config.pmfUrl || '')
  const [pmfError, setPmfError] = React.useState('')
  // The cluster tools (R10), each a name on PATH or a path; empty: its usual name on PATH.
  const [tools, setTools] = React.useState({ qq: state.config.qq || '', gmxEta: state.config.gmxEta || '' })
  const [toolsError, setToolsError] = React.useState('')
  const saveTools = async () => { try { onState(await postJson<AppState>('/api/config', { qq: tools.qq.trim() || null, gmxEta: tools.gmxEta.trim() || null })); setToolsError('') } catch (e) { setToolsError((e as Error).message) } }
  const toolsChanged = tools.qq.trim() !== (state.config.qq || '') || tools.gmxEta.trim() !== (state.config.gmxEta || '')
  // SymBuilder (R4): the base folder its builds read and write, and the python that builds peptides and masses.
  const w0 = state.config.buildWait ?? { every: 10, max: 600 }
  const [sym, setSym] = React.useState({ base: state.config.base || '', python: state.config.python || '', every: String(w0.every), max: String(w0.max) })
  const [symError, setSymError] = React.useState('')
  const saveSym = async () => {
    try { onState(await postJson<AppState>('/api/config', { base: sym.base.trim() || null, python: sym.python.trim() || null, buildWait: { every: Number(sym.every), max: Number(sym.max) } })); setSymError('') } catch (e) { setSymError((e as Error).message) }
  }
  const symChanged = sym.base.trim() !== (state.config.base || '') || sym.python.trim() !== (state.config.python || '') || sym.every !== String(w0.every) || sym.max !== String(w0.max)
  // A build's qq scripts (R7a): each stage's profile, the queue, and whether gmx-cypher submits them (T206, off by default).
  const q0 = { profiles: { ...DEFAULT_PROFILES, ...(state.config.qqBuild?.profiles ?? {}) } as Record<ScriptedStage, string>, submit: state.config.qqBuild?.submit ?? false, queue: state.config.qqBuild?.queue ?? 'gpu' }
  const [qqb, setQqb] = React.useState(q0)
  const [qqbError, setQqbError] = React.useState('')
  const saveQqb = async () => { try { onState(await postJson<AppState>('/api/config', { qqBuild: qqb })); setQqbError('') } catch (e) { setQqbError((e as Error).message) } }
  const qqbChanged = JSON.stringify(qqb) !== JSON.stringify(q0)
  const savePmfUrl = async () => { try { onState(await postJson<AppState>('/api/config', { pmfUrl: pmfUrl.trim() || null })); setPmfError('') } catch (e) { setPmfError((e as Error).message) } }
  // The vault's projects, for the connected one (R14b): read again when the vault changes.
  const vaultAt = state.config.vault, [read, setRead] = React.useState<{ vault: string; projects: { id: string; name: string }[] } | null>(null)
  const [projectError, setProjectError] = React.useState('')
  React.useEffect(() => { if (vaultAt) getJson<{ projects?: { id: string; name: string }[] }>('/api/vault').then(v => setRead({ vault: vaultAt, projects: v.projects ?? [] }), () => setRead({ vault: vaultAt, projects: [] })) }, [vaultAt])
  const projects = vaultAt && read?.vault === vaultAt ? read.projects : []
  const chooseProject = async (id: string | null) => { try { onState(await postJson<AppState>('/api/config', { project: id })); setProjectError('') } catch (e) { setProjectError((e as Error).message) } }
  const chooseVault = async (path: string | null) => {
    try { onState(await postJson<AppState>('/api/config', { vault: path })); setVaultError(''); if (!path) setVault('') } catch (e) { setVaultError((e as Error).message) }
  }
  const setAllow = async (allow: string[]) => {
    try { onState(await postJson<AppState>('/api/config', { allow })); setFolder(''); setFolderError('') } catch (e) { setFolderError((e as Error).message) }
  }
  const check = async () => {
    setBusy(true)
    try { onState(await postJson<AppState>('/api/config', { gmx: gmx.trim() || null })) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={e => { if (returnFocus?.current) { e.preventDefault(); returnFocus.current.focus() } }}
        // While the key field listens, Escape is its answer (keep the old key), not the dialog's.
        onEscapeKeyDown={e => { if (document.activeElement?.hasAttribute('data-key-listening')) e.preventDefault() }}>
        <DialogHeader>
          <DialogHeading>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>{state.name} {state.version}</DialogDescription>
          </DialogHeading>
        </DialogHeader>
        <DialogBody>
          <Section label="GROMACS" />
          <Field>
            <Label htmlFor="gmx">gmx</Label>
            <div className="flex gap-2">
              <Input id="gmx" size="sm" value={gmx} placeholder="gmx_mpi, then gmx, on PATH" onChange={e => setGmx(e.target.value)} onKeyDown={e => pressed(e, 'enter') && check()} />
              <Button variant="outline" onClick={check} disabled={busy}>{busy ? 'checking…' : 'check'}</Button>
            </div>
            {state.gmx.ok ? <Status level="ok">{state.gmx.path + ' · ' + state.gmx.version}</Status> : <Status level="error">{state.gmx.error}</Status>}
            <FieldHint>A name on PATH or a path. Start gmx-cypher after module add, so it finds gmx and its libraries.</FieldHint>
          </Field>
          <Section label="Allowed folders" />
          <FieldHint>The file browser shows only these folders and what is inside them. Removing one deletes nothing.</FieldHint>
          {state.config.allow.map(f => (
            <div key={f} className="flex items-center gap-2 text-control">
              <span className="min-w-0 flex-1 break-all">{f}</span>
              <Button variant="ghost" size="sm" onClick={() => setAllow(state.config.allow.filter(x => x !== f))} aria-label={'remove ' + f}>remove</Button>
            </div>
          ))}
          <Field>
            <Label htmlFor="folder">add a folder</Label>
            <div className="flex gap-2">
              <Input id="folder" size="sm" value={folder} placeholder="/home/you/simulations" onChange={e => setFolder(e.target.value)} onKeyDown={e => pressed(e, 'enter') && folder.trim() && setAllow([...state.config.allow, folder.trim()])} />
              <Button variant="outline" onClick={() => setAllow([...state.config.allow, folder.trim()])} disabled={!folder.trim()}>add</Button>
            </div>
            {folderError && <Status level="error">{folderError}</Status>}
          </Field>
          <Section label="Matrix vault" />
          <Field>
            <Label htmlFor="vault">vault folder</Label>
            <div className="flex gap-2">
              <Input id="vault" size="sm" value={vault} placeholder="/home/you/pmf-vault" onChange={e => setVault(e.target.value)} onKeyDown={e => pressed(e, 'enter') && vault.trim() && chooseVault(vault.trim())} />
              <Button variant="outline" onClick={() => chooseVault(vault.trim())} disabled={!vault.trim() || vault.trim() === state.config.vault}>use</Button>
              {state.config.vault && <Button variant="ghost" onClick={() => chooseVault(null)}>forget</Button>}
            </div>
            {vaultError ? <Status level="error">{vaultError}</Status> : state.config.vault && <Status level="ok">{state.config.vault}</Status>}
            <FieldHint>Read only: projects, rows and patterns, for where a result lands. A result you send goes into the project's _inbox folder, and its record into gmx-cypher's own folder at the vault's top; nothing else in the vault is ever written.</FieldHint>
          </Field>
          {state.config.vault && (
            <Field>
              <Label htmlFor="project">connected project</Label>
              <Select value={state.config.project ?? 'none'} onValueChange={v => chooseProject(v === 'none' ? null : v)}>
                <SelectTrigger id="project" size="sm" className="w-80"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">none</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {projectError ? <Status level="error">{projectError}</Status> : <FieldHint>Its pattern names your jobs from their folders; sends go to it unless you choose another.</FieldHint>}
            </Field>
          )}
          <Field>
            <Label htmlFor="pmf-url">The Matrix address · optional</Label>
            <div className="flex gap-2">
              <Input id="pmf-url" size="sm" value={pmfUrl} placeholder="http://localhost:5173/" onChange={e => setPmfUrl(e.target.value)} onKeyDown={e => pressed(e, 'enter') && savePmfUrl()} />
              <Button variant="outline" onClick={savePmfUrl} disabled={pmfUrl.trim() === (state.config.pmfUrl || '')}>save</Button>
            </div>
            {pmfError ? <Status level="error">{pmfError}</Status> : <FieldHint>Where you open the Matrix; after sending, gmx-cypher links to the project there.</FieldHint>}
          </Field>
          <Section label="Export" />
          <ExportSettings />
          <Section label="Keyboard" />
          <Keyboard />
          <Section label="Cluster" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Field>
              <Label htmlFor="qq">qq</Label>
              <Input id="qq" size="sm" value={tools.qq} placeholder="qq, on PATH" onChange={e => setTools(t => ({ ...t, qq: e.target.value }))} onKeyDown={e => pressed(e, 'enter') && saveTools()} />
            </Field>
            <Field>
              <Label htmlFor="gmx-eta">gmx-eta</Label>
              <Input id="gmx-eta" size="sm" value={tools.gmxEta} placeholder="gmx-eta, on PATH" onChange={e => setTools(t => ({ ...t, gmxEta: e.target.value }))} onKeyDown={e => pressed(e, 'enter') && saveTools()} />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={saveTools} disabled={!toolsChanged}>save</Button>
            {toolsError ? <Status level="error">{toolsError}</Status> : <FieldHint>The cluster view runs qq jobs and gmx-eta -a on this machine, as you would after kinit. Watch only: it never kills or submits a job.</FieldHint>}
          </div>
          <Section label="SymBuilder" />
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-x-4 gap-y-2">
            <Field>
              <Label htmlFor="sym-base">base folder</Label>
              <Input id="sym-base" size="sm" value={sym.base} placeholder="the folder with solutions/, ff/, inputs/ and molecules/" onChange={e => setSym(x => ({ ...x, base: e.target.value }))} onKeyDown={e => pressed(e, 'enter') && saveSym()} />
            </Field>
            <Field>
              <Label htmlFor="sym-python">python</Label>
              <Input id="sym-python" size="sm" value={sym.python} placeholder="python3, on PATH" onChange={e => setSym(x => ({ ...x, python: e.target.value }))} onKeyDown={e => pressed(e, 'enter') && saveSym()} />
            </Field>
            <Field>
              <Label htmlFor="sym-every">wait for mdrun's .gro: look every (s)</Label>
              <Input id="sym-every" size="sm" type="number" min={1} max={600} value={sym.every} onChange={e => setSym(x => ({ ...x, every: e.target.value }))} />
            </Field>
            <Field>
              <Label htmlFor="sym-max">up to (s)</Label>
              <Input id="sym-max" size="sm" type="number" min={1} max={86400} value={sym.max} onChange={e => setSym(x => ({ ...x, max: e.target.value }))} />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={saveSym} disabled={!symChanged}>save</Button>
            {symError ? <Status level="error">{symError}</Status> : <FieldHint>The base folder is your notebook's BASE_DIR, inside an allowed folder: builds read ff/, inputs/ and molecules/ there and write solutions/. Python, with PyMOL and gromologist, builds the peptides and their hydrogen masses.</FieldHint>}
          </div>
          <Section label="SymBuilder · qq scripts" />
          <div className="grid grid-cols-3 gap-x-4 gap-y-2 max-[640px]:grid-cols-2">
            {SCRIPTED_STAGES.map(st => (
              <Field key={st}>
                <Label htmlFor={'qq-' + st}>{st === 'min' ? 'minimisation' : st === 'walkers' ? 'multiwalker' : st}</Label>
                <Select value={qqb.profiles[st]} onValueChange={v => setQqb(x => ({ ...x, profiles: { ...x.profiles, [st]: v } }))}>
                  <SelectTrigger id={'qq-' + st} size="sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROFILES.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            ))}
            <Field>
              <Label htmlFor="qq-queue">queue</Label>
              <Input id="qq-queue" size="sm" value={qqb.queue} onChange={e => setQqb(x => ({ ...x, queue: e.target.value }))} />
            </Field>
          </div>
          <div className="flex items-center gap-2 text-control"><Checkbox id="qq-submit" checked={qqb.submit} onCheckedChange={v => setQqb(x => ({ ...x, submit: v === true }))} /><Label htmlFor="qq-submit">submit them for me (qq submit -q {qqb.queue || 'gpu'} &lt;script&gt;, in the step's folder)</Label></div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={saveQqb} disabled={!qqbChanged}>save</Button>
            {qqbError ? <Status level="error">{qqbError}</Status> : <FieldHint>Off, a build writes each script and prints its submit line, and you submit it; on, gmx-cypher runs that line itself, nothing else. The walkers run together with -multidir, which needs an MPI gmx.</FieldHint>}
          </div>
        </DialogBody>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
