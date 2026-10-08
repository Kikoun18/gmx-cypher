import * as React from 'react'
import { Button } from '../ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogHeading, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Field, FieldHint, Label } from '../ui/label'
import { Section } from '../ui/separator'
import { postJson, type AppState } from '../api'

export function Settings({ state, open, onOpenChange, onState }: { state: AppState; open: boolean; onOpenChange: (o: boolean) => void; onState: (s: AppState) => void }) {
  const [gmx, setGmx] = React.useState(state.config.gmx || '')
  const [busy, setBusy] = React.useState(false)
  const check = async () => {
    setBusy(true)
    try { onState(await postJson<AppState>('/api/config', { gmx: gmx.trim() || null })) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
        </DialogBody>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
