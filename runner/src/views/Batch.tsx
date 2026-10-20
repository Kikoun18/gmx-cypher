import * as React from 'react'
import { TriangleAlert, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Field, FieldHint, Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Section } from '../ui/separator'
import { pressed } from '../lib/shortcuts'
import { getJson, postJson, type AppState } from '../api'
import type { Draft } from '../draft'
import { statusOf, type Job } from '../jobs'
import { Status } from '../ui/status'
import { batchSummary, sentSummary } from '../lib/batch'
import { recipeFromDraft, type Recipe } from '../lib/recipe'
import { FIELD_LABEL } from '../../../matrix/src/lib/seq'

interface Item { rel: string; fields: Record<string, string>; run: number | null; runInput: string | null; structure: string | null; counts: number[] | null; problems: string[] }
interface Batch { id: string; recipe: string; root: string; template: string; concurrency: number; created: string; cancelled: boolean; items: (Item & { status: string; job?: string; error?: string })[] }

/** Batches of this session, kept current by the server's event stream. */
function useBatches() {
  const [list, setList] = React.useState<Batch[]>([])
  React.useEffect(() => {
    getJson<Batch[]>('/api/batches').then(setList, () => {})
    const es = new EventSource('/api/events')
    es.addEventListener('batch', e => { const b = JSON.parse((e as MessageEvent).data) as Batch; setList(l => [b, ...l.filter(x => x.id !== b.id)].sort((a, c) => c.created.localeCompare(a.created))) })
    return () => es.close()
  }, [])
  return list
}

export const FORM = '__form'
/** What the cluster tab hands over (R15): a finished job's input folder as the root, and a recipe (FORM: the form). Nothing runs. */
export interface BatchPreset { id: number; root: string; recipe: string }

/** One batch: its matches' states, cancel all (armed), and send all to the vault. */
function BatchCard({ b, jobs, vault, onOpenJob }: { b: Batch; jobs: Job[]; vault: string | null; onOpenJob: (id: string) => void }) {
  const [armed, setArmed] = React.useState(false)
  React.useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 2600); return () => clearTimeout(t) }, [armed])
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([])
  const [project, setProject] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState<{ rel: string; sent?: string; skipped?: string }[] | null>(null)
  const [error, setError] = React.useState('')
  React.useEffect(() => { if (vault) getJson<{ projects?: { id: string; name: string }[] }>('/api/vault').then(v => { setProjects(v.projects || []); setProject(p => p ?? v.projects?.[0]?.id ?? null) }, () => {}) }, [vault])
  const job = (id?: string) => jobs.find(j => j.id === id)
  const word = (i: Batch['items'][number]) => {
    if (i.status === 'started') { const j = job(i.job); return j ? statusOf(j) : { level: 'info' as const, word: 'started' } }
    return { level: i.status === 'refused' ? 'error' as const : 'info' as const, word: { queued: 'queued', starting: 'checking groups…', refused: 'refused', cancelled: 'cancelled' }[i.status] || i.status }
  }
  const running = b.items.some(i => i.status === 'queued' || i.status === 'starting' || (i.status === 'started' && job(i.job)?.status === 'running'))
  const done = b.items.filter(i => job(i.job)?.status === 'done').length
  const sendAll = async () => { setError(''); try { setSent(await postJson('/api/batches/' + b.id + '/send', { project })) } catch (e) { setError((e as Error).message) } }
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3" aria-label={'batch ' + b.recipe}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-control font-bold">{b.recipe}</span>
        <span className="min-w-0 flex-1 truncate text-caption text-muted-foreground">{b.template} · {b.concurrency} at a time</span>
        <span className="text-caption" aria-live="polite">{batchSummary(b.items, id => job(id)?.status)}</span>
        {running && <Button variant="destructive" size="sm" onClick={() => { if (armed) { postJson('/api/batches/' + b.id + '/cancel', {}).catch(() => {}); setArmed(false) } else setArmed(true) }}>{armed ? 'click again to cancel all' : 'cancel all'}</Button>}
      </div>
      <table className="text-control"><tbody>
        {b.items.map(i => {
          const w = word(i), s = sent?.find(x => x.rel === i.rel)
          return (
            <tr key={i.rel} className="align-top">
              <td className="py-0.5 pr-3 break-all">{i.job ? <button className="text-left underline-offset-[3px] hover:underline" onClick={() => onOpenJob(i.job!)}>{i.rel}</button> : i.rel}</td>
              <td className="whitespace-nowrap pr-3 text-caption"><Status inline level={w.level} word={w.word} /></td>
              <td className="text-caption text-muted-foreground">{i.error ? i.error.split('\n')[0] : s ? (s.sent ? <Status inline level="ok" word="sent">to {s.sent}</Status> : <Status inline level="warning" word="not sent">{s.skipped}</Status>) : ''}</td>
            </tr>
          )
        })}
      </tbody></table>
      {vault && done > 0 && !running && (
        <div className="flex flex-wrap items-center gap-2">
          {projects.length > 1 && (
            <Select value={project ?? undefined} onValueChange={setProject}>
              <SelectTrigger size="sm" className="w-56" aria-label="project"><SelectValue /></SelectTrigger>
              <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" disabled={!project || !!sent} onClick={sendAll}>{sent ? 'sent' : 'send all to vault'}</Button>
          <span className="text-caption text-muted-foreground" aria-live="polite">{sent ? sentSummary(sent) : 'each by the rule of a single send: only where the Matrix would put it where its path says; the rest are listed'}</span>
        </div>
      )}
      {error && <Status level="error">{error}</Status>}
    </section>
  )
}

/** Batches (R7b): one recipe over the trajectories a path template finds under a root; a preview first, then a queue. */
export function BatchView({ state, draft, jobs, onOpenJob, onMatches, preset }: { state: AppState; draft: Draft; jobs: Job[]; onOpenJob: (id: string) => void; onMatches: (n: number | null) => void; preset?: BatchPreset | null }) {
  const [recipes, setRecipes] = React.useState<{ id: string; name: string }[]>([])
  const [recipeId, setRecipeId] = React.useState(preset?.recipe ?? FORM)
  const [root, setRoot] = React.useState(preset?.root ?? (state.config.allow[0] || ''))
  const [template, setTemplate] = React.useState('')
  const [concurrency, setConcurrency] = React.useState(String(state.config.concurrency))
  const [items, setItems] = React.useState<Item[] | null>(null)
  const [unread, setUnread] = React.useState<string[]>([])
  const [chosen, setChosen] = React.useState<Set<string>>(new Set())
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const batches = useBatches()
  React.useEffect(() => onMatches(items ? items.length : null), [items]) // eslint-disable-line react-hooks/exhaustive-deps -- the count, as the preview changes
  React.useEffect(() => { getJson<{ id: string; name: string }[]>('/api/recipes').then(setRecipes, () => {}) }, [])
  const recipe = async (): Promise<Recipe> => (recipeId === FORM ? recipeFromDraft(draft, 'the ' + (draft.analysis ?? 'rdf') + ' form') : getJson<Recipe>('/api/recipes/' + encodeURIComponent(recipeId)))
  const preview = async () => {
    setBusy(true); setError('')
    try {
      const r = await postJson<{ items: Item[]; unread: string[] }>('/api/batch/preview', { root, template, recipe: await recipe() })
      setItems(r.items); setUnread(r.unread); setChosen(new Set(r.items.filter(i => !i.problems.length).map(i => i.rel)))
    } catch (e) { setError((e as Error).message); setItems(null) } finally { setBusy(false) }
  }
  const run = async () => {
    setBusy(true); setError('')
    try { await postJson('/api/batches', { root, template, recipe: await recipe(), rels: [...chosen], concurrency: Number(concurrency) || 1 }); setItems(null) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-[220px_minmax(0,1fr)_minmax(0,1.4fr)_110px] items-start gap-3">
        <Field>
          <Label htmlFor="b-recipe">recipe</Label>
          <Select value={recipeId} onValueChange={v => { setRecipeId(v); setItems(null) }}>
            <SelectTrigger id="b-recipe" size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={FORM}>the {draft.analysis ?? 'rdf'} form, as it is</SelectItem>
              {recipes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <FieldHint>its groups, options and names, for every match</FieldHint>
        </Field>
        <Field>
          <Label htmlFor="b-root">root</Label>
          <Input id="b-root" size="sm" value={root} onChange={e => { setRoot(e.target.value); setItems(null) }} />
          <FieldHint>a folder inside the allowed ones</FieldHint>
        </Field>
        <Field>
          <Label htmlFor="b-template">path template</Label>
          <Input id="b-template" size="sm" value={template} placeholder="hmr+fast+6/{column}/{seq}/9.multiwalker/{run}/07_md.xtc" onChange={e => { setTemplate(e.target.value); setItems(null) }} onKeyDown={e => pressed(e, 'enter') && template && preview()} />
          <FieldHint>The Matrix's tokens ({'{method} {column} {name} {seq} {run} {time}'}), {'{*}'} for any one folder, ** for any folders</FieldHint>
        </Field>
        <Field>
          <Label htmlFor="b-n">at a time</Label>
          <Input id="b-n" size="sm" inputMode="numeric" value={concurrency} onChange={e => setConcurrency(e.target.value)} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" disabled={!root || !template || busy} onClick={preview}>{busy && !items ? 'looking…' : 'preview'}</Button>
        {items && state.gmx.ok && <Button size="lg" disabled={!chosen.size || busy} onClick={run}>{busy ? 'starting…' : 'run ' + chosen.size + ' of ' + items.length}</Button>}
        {items && !state.gmx.ok && <Status level="error" className="text-control">no working gmx: set it in settings to run these</Status>}
        <span className="text-caption text-muted-foreground" aria-live="polite">{items ? items.length + ' trajectories match · nothing runs until you press run' : 'nothing runs until you have seen the preview'}</span>
      </div>
      {error && <Alert variant="destructive"><X /><AlertTitle>no batch</AlertTitle><AlertDescription><p className="whitespace-pre-line">{error}</p></AlertDescription></Alert>}
      {items && unread.length > 0 && (
        <Alert variant="warning"><TriangleAlert /><AlertTitle>{unread.length === 1 ? 'one place was not looked into' : unread.length + ' places were not looked into'}</AlertTitle>
          <AlertDescription>{unread.map(u => <p key={u} className="break-all">{u}</p>)}</AlertDescription></Alert>
      )}
      {items && (
        <table className="text-control">
          <thead><tr className="text-left text-label uppercase text-muted-foreground"><th className="w-8" /><th className="py-1 pr-3 font-normal">trajectory</th><th className="pr-3 font-normal">fields</th><th className="pr-3 font-normal">inputs</th><th className="pr-3 font-normal">atoms per group</th><th className="font-normal">problems</th></tr></thead>
          <tbody>
            {items.map(i => (
              <tr key={i.rel} className="border-t border-border align-top">
                <td className="py-1"><Checkbox aria-label={'run ' + i.rel} checked={chosen.has(i.rel)} disabled={!!i.problems.length} onCheckedChange={c => setChosen(s => { const n = new Set(s); if (c === true) n.add(i.rel); else n.delete(i.rel); return n })} /></td>
                <td className="py-1 pr-3 break-all">{i.rel}</td>
                <td className="pr-3 text-caption">{Object.entries(i.fields).filter(([k]) => k !== 'run').map(([k, v]) => (FIELD_LABEL[k as keyof typeof FIELD_LABEL] || k) + ' ' + v).concat(i.run ? ['run ' + i.run] : []).join(' · ')}</td>
                <td className="pr-3 text-caption text-muted-foreground">{[i.runInput, i.structure].filter(Boolean).map(p => p!.split('/').pop()).join(' · ')}</td>
                <td className="pr-3 text-caption">{i.counts?.join(' · ')}</td>
                <td className="text-caption"><Status inline level="error" word="not run">{i.problems.join('; ')}</Status></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {batches.length > 0 && <Section label={'Batches ' + String(batches.length).padStart(2, '0')} />}
      {batches.map(b => <BatchCard key={b.id} b={b} jobs={jobs} vault={state.config.vault} onOpenJob={onOpenJob} />)}
    </div>
  )
}
