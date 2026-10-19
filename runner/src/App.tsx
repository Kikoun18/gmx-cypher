import * as React from 'react'
import { Moon, Settings as SettingsIcon, Sun, X } from 'lucide-react'
import { Alert, AlertActions, AlertDescription, AlertTitle } from './ui/alert'
import { Button } from './ui/button'
import { Toaster } from './ui/sonner'
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from './ui/tabs'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { getJson, type AppState } from './api'
import { readThemePref, saveThemePref, themeOf, type ThemePref } from './lib/theme'
import { useJobs, useNaming } from './jobs'
import { useDraft } from './draft'
import { recipeFromRecord } from './lib/record'
import { BatchView } from './views/Batch'
import { Groups } from './views/Groups'
import { ClusterView } from './views/Cluster'
import { Inputs } from './views/Inputs'
import { Analysis } from './views/Analysis'
import { commandOf, withCommand } from './lib/commands'
import { JobsView } from './views/Jobs'
import { Settings } from './views/Settings'
import { useDecypherSources, type SourceRef } from './decypher/state'
import { keyLabel, matches, typing, useBindings } from './lib/shortcuts'

// (de)Cypher is loaded the first time it opens, as 3Dmol is: the page starts without it.
const Decypher = React.lazy(() => import('./decypher/Decypher').then(m => ({ default: m.Decypher })))

const TABS = ['inputs', 'groups', 'analysis', 'jobs', 'batch', 'cluster'] as const
type Tab = (typeof TABS)[number]

/** The open tab lives in the address (#jobs), so a reload keeps it. */
function useTab(): [Tab, (t: Tab) => void] {
  // The analysis tab was the rdf tab until R3b: an old address still opens it.
  const read = (): Tab => { const h = location.hash.slice(1) === 'rdf' ? 'analysis' : location.hash.slice(1); return (TABS as readonly string[]).includes(h) ? (h as Tab) : TABS[0] }
  const [tab, setTab] = React.useState<Tab>(read)
  React.useEffect(() => { const on = () => setTab(read()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on) }, [])
  return [tab, t => { history.replaceState(null, '', '#' + t); setTab(t) }]
}

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
  return v.error ? <span className="text-caption text-destructive" title={v.error}>✗ vault</span> : <span className="text-caption text-muted-foreground">vault · {v.path.split('/').pop()}</span>
}

function GmxStatus({ gmx }: { gmx: AppState['gmx'] }) {
  return gmx.ok
    ? <span className="text-caption text-muted-foreground">{gmx.name} {gmx.version} · <span className="text-mint-strong">✓ ready</span></span>
    : <span className="text-caption text-destructive">✗ no gmx</span>
}

export function App() {
  const [pref, setPref] = useTheme()
  const [state, setState] = React.useState<AppState | null>(null)
  const [error, setError] = React.useState('')
  const [settings, setSettings] = React.useState(false)
  const [tab, setTab] = useTab()
  const jobs = useJobs(useNaming(state?.config.vault ?? null, state?.config.project ?? null))
  const [draft, setDraft] = useDraft()
  const groupsStep = commandOf(draft.analysis ?? 'rdf')?.groups ?? true
  const [selectedJob, setSelectedJob] = React.useState<string | null>(null)
  // Closing settings returns the focus to its button, wherever the dialog was opened from.
  const settingsButton = React.useRef<HTMLButtonElement>(null)
  const running = jobs.jobs.filter(j => j.status === 'running').length
  React.useEffect(() => { getJson<AppState>('/api/state').then(setState, e => setError(String(e.message || e))) }, [])
  // (de)Cypher: the RDFs picked in the jobs tab (or in it), opened and closed by its key or the jobs tab's button.
  const sources = useDecypherSources()
  const [decypher, setDecypher] = React.useState(false), [decypherUsed, setDecypherUsed] = React.useState(false)
  if (decypher && !decypherUsed) setDecypherUsed(true)
  const [bindings] = useBindings()
  const openDecypher = (add: SourceRef[] = []) => { sources.add(add); setDecypher(true) }
  React.useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.repeat || typing(e.target) || !matches(bindings.decypher, e)) return
      // A list or menu that is open, or a select that has the focus, types its own letters.
      if ((e.target as HTMLElement | null)?.closest?.('[role=listbox],[role=menu],[role=combobox]')) return
      // Not over another dialog (settings, send…): the key belongs to it.
      if ([...document.querySelectorAll('[data-slot=dialog-content]')].some(d => !d.hasAttribute('data-decypher'))) return
      e.preventDefault()
      setDecypher(o => !o)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [bindings])

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
      <Tabs value={tab} onValueChange={v => setTab(v as Tab)} className="flex-1 gap-0">
        <TabsList className="px-3">
          <TabsTrigger value="inputs">inputs</TabsTrigger>
          {groupsStep && <TabsTrigger value="groups">groups</TabsTrigger>}
          <TabsTrigger value="analysis">command</TabsTrigger>
          <TabsTrigger value="jobs">jobs {jobs.jobs.length > 0 && <TabsCount>{running ? running + ' running' : String(jobs.jobs.length).padStart(2, '0')}</TabsCount>}</TabsTrigger>
          <TabsTrigger value="batch">batch</TabsTrigger>
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
        <TabsContent value="inputs">{state && <Inputs state={state} draft={draft} setDraft={setDraft} onSettings={() => setSettings(true)} onNext={() => setTab(groupsStep ? 'groups' : 'analysis')} />}</TabsContent>
        <TabsContent value="groups"><Groups draft={draft} setDraft={setDraft} /></TabsContent>
        <TabsContent value="analysis">{state && <Analysis gmx={state.gmx} draft={draft} setDraft={setDraft} onStarted={id => { setSelectedJob(id); setTab('jobs') }} />}</TabsContent>
        <TabsContent value="jobs"><JobsView {...jobs} selected={selectedJob} onSelect={setSelectedJob} vault={state?.config.vault ?? null} onRunAgain={r => { setDraft(d => ({ ...withCommand(d, r.analysis ?? 'rdf'), ...recipeFromRecord(r) })); setTab('analysis') }}
          decypher={{ sources, open: openDecypher, keyName: bindings.decypher ? keyLabel(bindings.decypher) : null }} /></TabsContent>
        <TabsContent value="cluster"><ClusterView /></TabsContent>
        <TabsContent value="batch">{state && <BatchView state={state} draft={draft} jobs={jobs.jobs} onOpenJob={id => { setSelectedJob(id); setTab('jobs') }} />}</TabsContent>
      </main>
      </Tabs>
      <Toaster />
      {state && <Settings state={state} open={settings} onOpenChange={setSettings} onState={setState} returnFocus={settingsButton} />}
      {decypherUsed && (
        <React.Suspense fallback={null}>
          <Decypher open={decypher} onOpenChange={setDecypher} sources={sources} jobs={jobs.jobs} jobsLoaded={jobs.loaded} allow={state?.config.allow ?? []} vaultPath={state?.config.vault ?? null} version={state?.version ?? ''}
            keyName={bindings.decypher ? keyLabel(bindings.decypher) : null} />
        </React.Suspense>
      )}
    </div>
  )
}
