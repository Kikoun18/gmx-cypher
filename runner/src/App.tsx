import * as React from 'react'
import { Moon, Settings as SettingsIcon, Sun, X } from 'lucide-react'
import { Alert, AlertActions, AlertDescription, AlertTitle } from './ui/alert'
import { Button } from './ui/button'
import { toast } from 'sonner'
import { Toaster } from './ui/sonner'
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from './ui/tabs'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { getJson, type AppState } from './api'
import { readThemePref, saveThemePref, themeOf, type ThemePref } from './lib/theme'
import { useJobs, useNaming } from './jobs'
import { Status } from './ui/status'
import { useDraft } from './draft'
import { recipeFromRecord } from './lib/record'
import { ClusterView } from './views/Cluster'
import { withCommand } from './lib/commands'
import { JobsView } from './views/Jobs'
import { Settings } from './views/Settings'
import { Setup } from './views/Setup'
import { useDecypherSources } from './decypher/state'
import type { LoadedFile } from './decypher/parse'
import { keyLabel, matches, typing, useBindings } from './lib/shortcuts'
import { formatRoute, parseRoute, type Route } from './lib/route'
import { dropEntries, dropSummary, routeDrop } from './lib/drop'

// (de)Cypher is loaded the first time compare opens, as 3Dmol is: the page starts without it.
const Decypher = React.lazy(() => import('./decypher/Decypher').then(m => ({ default: m.Decypher })))

/** The view in the address (R9a): a reload keeps it, back and forward move through it, an old address is written anew. */
function useRoute(): [Route, (r: Route) => void] {
  const read = () => { const p = parseRoute(location.hash); if (p.redirect) history.replaceState(null, '', formatRoute(p.route)); return p.route }
  const [route, setRoute] = React.useState<Route>(read)
  React.useEffect(() => { const on = () => setRoute(read()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on) }, [])
  return [route, r => { const h = formatRoute(r); if (h !== location.hash) location.hash = h }]
}

/** Whether a dialog is open: its keys and drops are its own. */
const inDialog = () => !!document.querySelector('[data-slot=dialog-content]')

function useTheme() {
  const [pref, setPref] = React.useState<ThemePref>(readThemePref)
  const media = React.useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), [])
  const [systemDark, setSystemDark] = React.useState(media.matches)
  React.useEffect(() => {
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    media.addEventListener('change', on)
    return () => media.removeEventListener('change', on)
  }, [media])
  React.useLayoutEffect(() => { document.documentElement.dataset.theme = themeOf(pref, systemDark) }, [pref, systemDark])
  return [pref, (p: ThemePref) => { saveThemePref(p); setPref(p) }] as const
}

/** The vault in the header: its folder name, or why it can't be read. */
function VaultStatus({ path }: { path: string | null }) {
  const [v, setV] = React.useState<{ path: string; error?: string } | null>(null)
  React.useEffect(() => {
    if (!path) return
    let alive = true
    getJson<{ path: string; error?: string }>('/api/vault').then(x => alive && setV(x), e => alive && setV({ path, error: (e as Error).message }))
    return () => { alive = false }
  }, [path])
  if (!path || !v) return null
  return v.error ? <Status inline level="error" word="vault" why={v.error} className="text-caption" /> : <span className="text-caption text-muted-foreground">vault · {v.path.split('/').pop()}</span>
}

function GmxStatus({ gmx }: { gmx: AppState['gmx'] }) {
  return gmx.ok
    ? <span className="text-caption text-muted-foreground">{gmx.name} {gmx.version} · <Status inline level="ok" word="ready" className="text-caption" /></span>
    : <Status inline level="error" word="no gmx" className="text-caption" />
}

export function App() {
  const [pref, setPref] = useTheme()
  const [state, setState] = React.useState<AppState | null>(null)
  const [error, setError] = React.useState('')
  const [settings, setSettings] = React.useState(false)
  const [route, go] = useRoute()
  const jobs = useJobs(useNaming(state?.config.vault ?? null, state?.config.project ?? null))
  const [draft, setDraft] = useDraft()
  // Closing settings returns the focus to its button, wherever the dialog was opened from.
  const settingsButton = React.useRef<HTMLButtonElement>(null)
  const running = jobs.jobs.filter(j => j.status === 'running').length
  React.useEffect(() => { getJson<AppState>('/api/state').then(setState, e => setError(String(e.message || e))) }, [])
  // Each tab opens where it was left; results remember their selection, for the compare key from anywhere.
  const last = React.useRef<Record<string, Route>>({})
  const tab = route.view === 'compare' ? 'results' : route.view
  last.current[tab] = route
  const selection = (r => (r?.view === 'compare' ? r.jobs : r?.view === 'results' && r.job ? [r.job] : []))(last.current.results)
  // Compare: the jobs in the address, the vault RDFs and records on disk kept in this browser, the files dropped (never kept).
  const sources = useDecypherSources(route.view === 'compare' ? route.jobs : [], ids => go({ view: 'compare', jobs: ids }))
  const [files, setFiles] = React.useState<LoadedFile[]>([]), [uploads, setUploads] = React.useState<File[]>([])
  const addFiles = (f: LoadedFile[]) => f.length && setFiles(old => [...old.filter(o => !f.some(n => n.path === o.path)), ...f])
  const [bindings] = useBindings()
  // The compare key opens compare with the jobs selected, and goes back to the result from it.
  React.useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.repeat || typing(e.target) || !matches(bindings.decypher, e)) return
      // A list or menu that is open, or a select that has the focus, types its own letters.
      if ((e.target as HTMLElement | null)?.closest?.('[role=listbox],[role=menu],[role=combobox]')) return
      // Not over a dialog (settings, send…): the key belongs to it.
      if (inDialog()) return
      e.preventDefault()
      go(route.view === 'compare' ? { view: 'results', job: route.jobs[0] ?? null } : { view: 'compare', jobs: selection })
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })
  // A drop anywhere is split by what each file is (R9a): inputs to set-up, results to compare; the page says where each went.
  const [dragging, setDragging] = React.useState(false)
  React.useEffect(() => {
    const files = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files') && !inDialog()
    const over = (e: DragEvent) => { if (files(e)) { e.preventDefault(); setDragging(true) } }
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragging(false) }
    const drop = async (e: DragEvent) => {
      setDragging(false)
      if (!files(e)) return
      e.preventDefault()
      const all = await dropEntries(e.dataTransfer!), file = new Map(all.map(x => [x.path, x.file])), r = routeDrop(all.map(x => x.path))
      const big = r.compare.filter(p => file.get(p)!.size >= 80e6)
      r.compare = r.compare.filter(p => !big.includes(p)); r.left.push(...big.map(name => ({ name, why: 'over 80 MB, too large to read in the page' })))
      toast(dropSummary(r))
      if (r.compare.length) addFiles(await Promise.all(r.compare.map(async p => ({ path: p, text: await file.get(p)!.text() }))))
      if (r.inputs.length) { setUploads(r.inputs.map(p => file.get(p)!)); go({ view: 'setup', step: 'inputs', batch: false }) }
      else if (r.compare.length) go({ view: 'compare', jobs: route.view === 'compare' ? route.jobs : selection })
    }
    window.addEventListener('dragover', over); window.addEventListener('dragleave', leave); window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop) }
  })
  const openJob = (id: string) => go({ view: 'results', job: id })

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 items-center gap-3 border-b border-border px-5">
        <h1 className="m-0 text-heading font-bold">gmx-cypher</h1>
        <span aria-live="polite">{state && <GmxStatus gmx={state.gmx} />}</span>
        <span className="flex-1" />
        {state && <VaultStatus path={state.config.vault} />}
        {state && <Button ref={settingsButton} variant="ghost" size="sm" onClick={() => setSettings(true)}><SettingsIcon /> settings</Button>}
        <ToggleGroup type="single" size="sm" value={pref} onValueChange={v => v && setPref(v as ThemePref)} aria-label="theme">
          <ToggleGroupItem value="light" aria-label="light theme"><Sun /></ToggleGroupItem>
          <ToggleGroupItem value="dark" aria-label="dark theme"><Moon /></ToggleGroupItem>
          <ToggleGroupItem value="auto">auto</ToggleGroupItem>
        </ToggleGroup>
      </header>
      <Tabs value={tab} onValueChange={v => go(last.current[v] ?? (v === 'setup' ? { view: 'setup', step: 'inputs', batch: false } : v === 'results' ? { view: 'results', job: null } : { view: 'cluster' }))} className="flex-1 gap-0">
        <TabsList className="px-3">
          <TabsTrigger value="setup">set-up</TabsTrigger>
          <TabsTrigger value="results">results {jobs.jobs.length > 0 && <TabsCount>{running ? running + ' running' : String(jobs.jobs.length).padStart(2, '0')}</TabsCount>}</TabsTrigger>
          {/* Your cluster jobs (R10): another kind of job than gmx-cypher's own, so another tab. */}
          <TabsTrigger value="cluster">cluster</TabsTrigger>
        </TabsList>
      <main className="flex flex-col gap-4 p-5">
        {error && <Alert variant="destructive"><X /><AlertTitle>can't reach the gmx-cypher server</AlertTitle><AlertDescription><p>{error}</p></AlertDescription></Alert>}
        {state && !state.gmx.ok && (
          <Alert variant="destructive">
            <X />
            <AlertTitle>no working gmx: nothing can run</AlertTitle>
            <AlertDescription><p>{state.gmx.error}</p></AlertDescription>
            <AlertActions><Button variant="outline" size="sm" onClick={() => setSettings(true)}>set gmx</Button></AlertActions>
          </Alert>
        )}
        <TabsContent value="setup">{state && route.view === 'setup' && <Setup route={route} go={go} state={state} draft={draft} setDraft={setDraft} jobs={jobs.jobs} uploads={uploads} onUploaded={() => setUploads([])} onSettings={() => setSettings(true)} onOpenJob={openJob} />}</TabsContent>
        <TabsContent value="results">{(route.view === 'results' || route.view === 'compare') && (
          <JobsView {...jobs} route={route} go={go} vault={state?.config.vault ?? null} keyName={bindings.decypher ? keyLabel(bindings.decypher) : null}
            onRunAgain={r => { setDraft(d => ({ ...withCommand(d, r.analysis ?? 'rdf'), ...recipeFromRecord(r) })); go({ view: 'setup', step: 'command', batch: false }) }}
            compare={<React.Suspense fallback={<p className="m-0 text-control text-muted-foreground" aria-live="polite">opening compare…</p>}>
              <Decypher sources={sources} files={files} onFiles={addFiles} onClearFiles={() => setFiles([])} jobs={jobs.jobs} jobsLoaded={jobs.loaded} allow={state?.config.allow ?? []} vaultPath={state?.config.vault ?? null} version={state?.version ?? ''}
                keyName={bindings.decypher ? keyLabel(bindings.decypher) : null} />
            </React.Suspense>} />
        )}</TabsContent>
        <TabsContent value="cluster"><ClusterView /></TabsContent>
      </main>
      </Tabs>
      <Toaster />
      {state && <Settings state={state} open={settings} onOpenChange={setSettings} onState={setState} returnFocus={settingsButton} />}
      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-50 flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-ring bg-secondary/90">
          <span className="text-display font-bold">Drop files or a folder</span>
          <span className="text-control text-muted-foreground">a run's inputs go to set-up · xvg and run.json, with their structure and index, go to compare</span>
        </div>
      )}
    </div>
  )
}
