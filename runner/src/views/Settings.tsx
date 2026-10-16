import * as React from 'react'
import { Button } from '../ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogHeading, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Field, FieldHint, Label } from '../ui/label'
import { Kbd } from '../ui/kbd'
import { Section } from '../ui/separator'
import { postJson, type AppState } from '../api'
import { bindingOf, DEFAULT_BINDINGS, keyLabel, keyProblem, useBindings } from '../lib/shortcuts'

/** The key that opens and closes (de)Cypher: change it by pressing the new one; Escape keeps the old one. */
function KeyField() {
  const [bindings, setBindings] = useBindings()
  const [listening, setListening] = React.useState(false)
  const b = bindings.decypher, problem = keyProblem(b)
  return (
    <Field>
      <Label id="key-decypher-label">open and close (de)Cypher</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Kbd className="h-6 min-w-6 text-[11px]">{keyLabel(b)}</Kbd>
        <Button id="key-decypher" variant="outline" size="sm" aria-pressed={listening} aria-labelledby="key-decypher-label key-decypher"
          onClick={() => setListening(l => !l)} onBlur={() => setListening(false)}
          onKeyDown={e => {
            if (!listening) return
            e.preventDefault(); e.stopPropagation()
            if (e.key === 'Escape') { setListening(false); return }
            const next = bindingOf(e)
            if (!next) return
            setBindings({ ...bindings, decypher: next }); setListening(false)
          }}>{listening ? 'press a key… (Escape keeps ' + keyLabel(b) + ')' : 'change'}</Button>
        {b && <Button variant="ghost" size="sm" onClick={() => setBindings({ ...bindings, decypher: null })}>no key</Button>}
        {keyLabel(b) !== keyLabel(DEFAULT_BINDINGS.decypher) && <Button variant="ghost" size="sm" onClick={() => setBindings(DEFAULT_BINDINGS)}>back to {keyLabel(DEFAULT_BINDINGS.decypher)}</Button>}
      </div>
      {problem ? <FieldHint error>✗ {problem}</FieldHint> : <FieldHint>{b ? keyLabel(b) + ' anywhere but in a field; the jobs tab has the same as a button.' : 'no key: open (de)Cypher from the jobs tab.'} Inside it, F fits the plotted groups, R resets the view and [ ] step through jobs. Kept in this browser.</FieldHint>}
    </Field>
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
  const savePmfUrl = async () => { try { onState(await postJson<AppState>('/api/config', { pmfUrl: pmfUrl.trim() || null })); setPmfError('') } catch (e) { setPmfError((e as Error).message) } }
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
        onEscapeKeyDown={e => { const el = document.activeElement; if (el?.id === 'key-decypher' && el.getAttribute('aria-pressed') === 'true') e.preventDefault() }}>
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
              <Input id="gmx" size="sm" value={gmx} placeholder="gmx_mpi, then gmx, on PATH" onChange={e => setGmx(e.target.value)} onKeyDown={e => e.key === 'Enter' && check()} />
              <Button variant="outline" onClick={check} disabled={busy}>{busy ? 'checking…' : 'check'}</Button>
            </div>
            <FieldHint error={!state.gmx.ok}>{state.gmx.ok ? '✓ ' + state.gmx.path + ' · ' + state.gmx.version : '✗ ' + state.gmx.error}</FieldHint>
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
              <Input id="folder" size="sm" value={folder} placeholder="/home/you/simulations" onChange={e => setFolder(e.target.value)} onKeyDown={e => e.key === 'Enter' && folder.trim() && setAllow([...state.config.allow, folder.trim()])} />
              <Button variant="outline" onClick={() => setAllow([...state.config.allow, folder.trim()])} disabled={!folder.trim()}>add</Button>
            </div>
            {folderError && <FieldHint error>✗ {folderError}</FieldHint>}
          </Field>
          <Section label="Matrix vault" />
          <Field>
            <Label htmlFor="vault">vault folder</Label>
            <div className="flex gap-2">
              <Input id="vault" size="sm" value={vault} placeholder="/home/you/pmf-vault" onChange={e => setVault(e.target.value)} onKeyDown={e => e.key === 'Enter' && vault.trim() && chooseVault(vault.trim())} />
              <Button variant="outline" onClick={() => chooseVault(vault.trim())} disabled={!vault.trim() || vault.trim() === state.config.vault}>use</Button>
              {state.config.vault && <Button variant="ghost" onClick={() => chooseVault(null)}>forget</Button>}
            </div>
            {vaultError ? <FieldHint error>✗ {vaultError}</FieldHint> : state.config.vault && <FieldHint>✓ {state.config.vault}</FieldHint>}
            <FieldHint>Read only: projects, rows and patterns, for where a result lands. A result you send goes into the project's _inbox folder; nothing else in the vault is ever written.</FieldHint>
          </Field>
          <Field>
            <Label htmlFor="pmf-url">The Matrix address · optional</Label>
            <div className="flex gap-2">
              <Input id="pmf-url" size="sm" value={pmfUrl} placeholder="http://localhost:5173/" onChange={e => setPmfUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && savePmfUrl()} />
              <Button variant="outline" onClick={savePmfUrl} disabled={pmfUrl.trim() === (state.config.pmfUrl || '')}>save</Button>
            </div>
            {pmfError ? <FieldHint error>✗ {pmfError}</FieldHint> : <FieldHint>Where you open the Matrix; after sending, gmx-cypher links to the project there.</FieldHint>}
          </Field>
          <Section label="Keyboard" />
          <KeyField />
          <Section label="Cluster" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Field>
              <Label htmlFor="qq">qq</Label>
              <Input id="qq" size="sm" value={tools.qq} placeholder="qq, on PATH" onChange={e => setTools(t => ({ ...t, qq: e.target.value }))} onKeyDown={e => e.key === 'Enter' && saveTools()} />
            </Field>
            <Field>
              <Label htmlFor="gmx-eta">gmx-eta</Label>
              <Input id="gmx-eta" size="sm" value={tools.gmxEta} placeholder="gmx-eta, on PATH" onChange={e => setTools(t => ({ ...t, gmxEta: e.target.value }))} onKeyDown={e => e.key === 'Enter' && saveTools()} />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={saveTools} disabled={!toolsChanged}>save</Button>
            {toolsError ? <FieldHint error>✗ {toolsError}</FieldHint> : <FieldHint>The cluster view runs qq jobs and gmx-eta -a on this machine, as you would after kinit. Watch only: it never kills or submits a job.</FieldHint>}
          </div>
        </DialogBody>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
