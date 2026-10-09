import * as React from 'react'
import { Check, Info, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Button } from '../ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogHeading, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Field, FieldHint, Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Section } from '../ui/separator'
import { getJson, postJson } from '../api'
import type { Job } from '../jobs'
import type { Fields, Landing, Source } from '../lib/landing'

interface VaultInfo { path: string; projects: { id: string; name: string; dir: string }[]; error?: string }
interface Sent { path: string; name: string; renamed: boolean; next: string[]; link?: string }
interface Preview {
  project: { id: string; name: string; dir: string }; pattern: string; pathPattern: string
  fields: Fields; from: Partial<Record<string, Source>>; name: string; missing: string[]; preview: Landing; reasons: string[]
}

const FROM: Record<Source, string> = { path: 'from the folder pattern', header: 'from the folder pattern', name: 'from the file name' }
const FIELD_KEY: Record<keyof Fields, string> = { name: 'name', col: 'col', group: 'group', run: 'run', time: 'time' }

/** The send dialog (R6b): where the result belongs, its file name by the project's pattern, and PMF Sequences' own landing preview. */
export function SendDialog({ job, open, onOpenChange, returnFocus }: { job: Job; open: boolean; onOpenChange: (o: boolean) => void; returnFocus?: React.RefObject<HTMLElement | null> }) {
  const [vault, setVault] = React.useState<VaultInfo | null>(null)
  const [project, setProject] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Fields | null>(null)
  const [typed, setTyped] = React.useState<Set<keyof Fields>>(new Set())
  const [name, setName] = React.useState<string | null>(null)
  const [p, setP] = React.useState<{ key: string; preview?: Preview; error?: string } | null>(null)
  const [sent, setSent] = React.useState<Sent | null>(null)
  const [sending, setSending] = React.useState(false)
  const [sendError, setSendError] = React.useState('')
  React.useEffect(() => {
    if (!open) return
    getJson<VaultInfo>('/api/vault').then(v => { setVault(v); setProject(id => id ?? v.projects?.[0]?.id ?? null) }, e => setVault({ path: '', projects: [], error: (e as Error).message }))
  }, [open])
  const body = { job: job.id, project, ...(fields ? { fields } : {}), ...(name != null ? { name } : {}) }, key = JSON.stringify(body)
  React.useEffect(() => {
    if (!open || !project) return
    let alive = true
    const t = setTimeout(() => postJson<Preview>('/api/landing', body).then(preview => alive && setP({ key, preview }), e => alive && setP({ key, error: (e as Error).message })), 200)
    return () => { alive = false; clearTimeout(t) }
  }, [key, open]) // eslint-disable-line react-hooks/exhaustive-deps -- body is what key says
  const r = p?.key === key ? p : null, pv = r?.preview, l = pv?.preview
  const shown = fields ?? pv?.fields
  const set = (k: keyof Fields, v: string) => { if (!shown) return; setFields({ ...shown, [k]: k === 'run' ? Number(v) || 0 : v }); setTyped(t => new Set(t).add(k)) }
  const hint = (k: keyof Fields) => (typed.has(k) ? 'typed' : pv?.from[FIELD_KEY[k]] ? FROM[pv.from[FIELD_KEY[k]]!] : k === 'time' && shown?.time ? "the run's last time (ps)" : 'not in the folder or the file name: type it')
  const needsTime = !!pv && /\{t(ime)?\}/i.test(pv.pattern)
  const lost = l ? l.curves.inFile.filter(c => !l.curves.imported.includes(c)) : []
  const fileName = name ?? pv?.name ?? ''
  const ready = !!l && l.ok && !pv!.reasons.length && !pv!.missing.length
  const send = async () => {
    setSending(true); setSendError('')
    try { setSent(await postJson<Sent>('/api/send', { job: job.id, project, name: fileName })) } catch (e) { setSendError((e as Error).message) } finally { setSending(false) }
  }
  const close = (o: boolean) => { if (!o) { setSent(null); setSendError('') } onOpenChange(o) }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-[720px]" onCloseAutoFocus={e => { if (returnFocus?.current) { e.preventDefault(); returnFocus.current.focus() } }}>
        <DialogHeader>
          <DialogHeading>
            <DialogTitle>{l?.row ? l.row + ' × ' + l.col.label : 'send to the vault'}</DialogTitle>
            <DialogDescription>send {String(job.meta?.stem)} to the vault · {vault?.path.split('/').pop()}{pv && ' · ' + pv.project.name}</DialogDescription>
          </DialogHeading>
        </DialogHeader>
        {sent ? (
          <DialogBody>
            <Alert variant="success"><Check /><AlertTitle>sent: {sent.path}</AlertTitle>
              <AlertDescription>{sent.renamed && <p>A file of that name was already in the inbox, so this one is {sent.name}.</p>}<p>Nothing else in the vault changed. The run's own files stay where they are.</p></AlertDescription>
            </Alert>
            <Section label="In PMF Sequences" />
            <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-control">{sent.next.map(x => <li key={x}>{x}</li>)}</ol>
            {sent.link && <a className="self-start text-control text-coral-strong underline-offset-[3px] hover:underline" href={sent.link} target="_blank" rel="noopener noreferrer">open {pv?.project.name} in PMF Sequences ↗</a>}
          </DialogBody>
        ) : (
        <DialogBody>
          {vault?.error && <FieldHint error>✗ {vault.error}</FieldHint>}
          {vault && vault.projects.length > 1 && (
            <Field>
              <Label htmlFor="project">project</Label>
              <Select value={project ?? undefined} onValueChange={v => { setProject(v); setFields(null); setTyped(new Set()); setName(null) }}>
                <SelectTrigger id="project" size="sm" className="w-72"><SelectValue /></SelectTrigger>
                <SelectContent>{vault.projects.map(x => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
          <Section label="Where it belongs" />
          {shown && (
            <div className="grid grid-cols-4 gap-3">
              {(['name', 'col', 'group', 'run', ...(needsTime ? ['time'] : [])] as (keyof Fields)[]).map(k => (
                <Field key={k}>
                  <Label htmlFor={'f-' + k}>{{ name: 'sequence', col: 'column', group: 'group', run: 'run', time: 'time' }[k]}</Label>
                  <Input id={'f-' + k} size="sm" value={String(shown[k] ?? '')} inputMode={k === 'run' ? 'numeric' : undefined} onChange={e => set(k, e.target.value)} />
                  <FieldHint>{hint(k)}</FieldHint>
                </Field>
              ))}
            </div>
          )}
          {pv && (
            <Field>
              <Label htmlFor="f-file">file name</Label>
              <Input id="f-file" size="sm" value={name ?? pv.name} onChange={e => setName(e.target.value)} />
              {pv.missing.length > 0 ? <FieldHint error>✗ the project's pattern {pv.pattern} needs {pv.missing.join(', ')}: type it above</FieldHint>
                : <FieldHint>{name != null ? 'typed · ' : ''}the project's pattern {pv.pattern}, filled from the fields above</FieldHint>}
            </Field>
          )}
          <Section label="Landing preview"><span className="text-caption text-muted-foreground">PMF Sequences' own planBatch on this file</span></Section>
          {r?.error && <FieldHint error>✗ {r.error}</FieldHint>}
          {!r && <p className="m-0 text-control text-muted-foreground" aria-live="polite">asking PMF Sequences' planner…</p>}
          {l && (
            <div className="flex flex-col gap-3" aria-live="polite">
              <p className="m-0 text-control">
                {l.row ? <>PMF Sequences will put it at <b>{l.row} × {l.col.label}</b> · run {l.run} · {l.type.label} (from the {l.type.how === 'header' ? 'header' : l.type.how}){l.rowNew && ' · new row'}{l.col.isNew && ' · new column'}{l.replaces && ' · replaces the RDF there'}</> : 'PMF Sequences would not know where to put it'}
                {' · '}{pv.reasons.length ? <span className="text-destructive">✗ not what you chose: {pv.reasons.join(', ')}</span> : <span className="text-mint-strong">✓ matches what you chose</span>}
              </p>
              {(l.problems.length > 0 || pv.reasons.length > 0) && (
                <Alert variant="destructive"><X /><AlertTitle>it would not land where you chose</AlertTitle>
                  <AlertDescription>
                    {l.problems.map(x => <p key={x}>{x}</p>)}
                    {pv.reasons.length > 0 && <p>{name != null ? 'The typed name does not read as ' : 'The name does not read as '}the fields above with the pattern {pv.pattern}{pv.pathPattern ? ', and the folder pattern ' + pv.pathPattern + ' reads the run’s working directory' : ''}. Use the suggested name (clear the file name), or change the fields.</p>}
                  </AlertDescription>
                </Alert>
              )}
              {l.twin && (
                <Alert variant="warning"><Info /><AlertTitle>PMF Sequences would start a second row {l.row}</AlertTitle>
                  <AlertDescription><p>It matches a row by group, name and sequence together. The row {l.row} there has {l.twin.seq ? 'sequence ' + l.twin.seq : 'no sequence'}{l.twin.group ? ' and group ' + l.twin.group : ''}; this file gives {l.seq ? 'sequence ' + l.seq : 'no sequence'}{l.group ? ' and group ' + l.group : ''}. When you attach it, type {l.twin.seq ? 'the sequence ' + l.twin.seq : 'the group ' + l.twin.group} in PMF Sequences' upload dialog, or add {'{seq}'} to the project's file pattern.</p></AlertDescription>
                </Alert>
              )}
              {lost.length > 0 && (
                <Alert variant="warning"><Info /><AlertTitle>{l.curves.inFile.length} curves in this file, {l.curves.imported.length} will be imported</AlertTitle>
                  <AlertDescription><p>The project's {l.type.label} reads {l.curves.imported.join(', ')} only. To keep {lost.join(', ')} too, set {l.type.label} y columns to all in PMF Sequences → Settings → Analyses.</p></AlertDescription>
                </Alert>
              )}
            </div>
          )}
          {pv && <FieldHint>copies to {pv.project.dir}/_inbox/{fileName} · only g(r), not the cumulative number · nothing else in the vault changes</FieldHint>}
          {sendError && <FieldHint error>✗ {sendError}</FieldHint>}
        </DialogBody>
        )}
        <DialogFooter>
          {sent ? <Button variant="ghost" onClick={() => close(false)}>close</Button> : <>
            <Button variant="ghost" onClick={() => close(false)}>cancel</Button>
            <Button disabled={!ready || sending} onClick={send}>{sending ? 'sending…' : 'send to vault'}</Button>
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
