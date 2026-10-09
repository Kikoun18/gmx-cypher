import * as React from 'react'
import { Moon, Settings as SettingsIcon, Sun, X } from 'lucide-react'
import { Alert, AlertActions, AlertDescription, AlertTitle } from './ui/alert'
import { Button } from './ui/button'
import { Toaster } from './ui/sonner'
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from './ui/tabs'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { getJson, type AppState } from './api'
import { readThemePref, saveThemePref, themeOf, type ThemePref } from './lib/theme'
import { useJobs } from './jobs'
import { useDraft } from './draft'
import { Groups } from './views/Groups'
import { Inputs } from './views/Inputs'
import { JobsView } from './views/Jobs'
import { Settings } from './views/Settings'

const TABS = ['inputs', 'groups', 'jobs'] as const
type Tab = (typeof TABS)[number]

/** The open tab lives in the address (#jobs), so a reload keeps it. */
function useTab(): [Tab, (t: Tab) => void] {
  const read = (): Tab => (TABS as readonly string[]).includes(location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : TABS[0]
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
  const jobs = useJobs()
  const [draft, setDraft] = useDraft()
  const [selectedJob, setSelectedJob] = React.useState<string | null>(null)
  const running = jobs.jobs.filter(j => j.status === 'running').length
  React.useEffect(() => { getJson<AppState>('/api/state').then(setState, e => setError(String(e.message || e))) }, [])

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 items-center gap-3 border-b border-border px-5">
        <h1 className="m-0 text-heading font-bold">gmx-cypher</h1>
        <span aria-live="polite">{state && <GmxStatus gmx={state.gmx} />}</span>
        <span className="flex-1" />
        {state && <Button variant="ghost" size="sm" onClick={() => setSettings(true)}><SettingsIcon /> settings</Button>}
        <ToggleGroup type="single" size="sm" value={pref} onValueChange={v => v && setPref(v as ThemePref)} aria-label="theme">
          <ToggleGroupItem value="light" aria-label="light theme"><Sun /></ToggleGroupItem>
          <ToggleGroupItem value="dark" aria-label="dark theme"><Moon /></ToggleGroupItem>
          <ToggleGroupItem value="auto">auto</ToggleGroupItem>
        </ToggleGroup>
      </header>
      <Tabs value={tab} onValueChange={v => setTab(v as Tab)} className="flex-1 gap-0">
        <TabsList className="px-3">
          <TabsTrigger value="inputs">inputs</TabsTrigger>
          <TabsTrigger value="groups">groups</TabsTrigger>
          <TabsTrigger value="jobs">jobs {jobs.jobs.length > 0 && <TabsCount>{running ? running + ' running' : String(jobs.jobs.length).padStart(2, '0')}</TabsCount>}</TabsTrigger>
        </TabsList>
      <main className="flex flex-col gap-4 p-5">
        {error && <Alert variant="destructive"><X /><AlertTitle>✗ can't reach the gmx-cypher server</AlertTitle><AlertDescription><p>{error}</p></AlertDescription></Alert>}
        {state && !state.gmx.ok && (
          <Alert variant="destructive">
            <X />
            <AlertTitle>✗ no working gmx: nothing can run</AlertTitle>
            <AlertDescription><p>{state.gmx.error}</p></AlertDescription>
            <AlertActions><Button variant="outline" size="sm" onClick={() => setSettings(true)}>set gmx</Button></AlertActions>
          </Alert>
        )}
        <TabsContent value="inputs">{state && <Inputs state={state} draft={draft} setDraft={setDraft} onSettings={() => setSettings(true)} onNext={() => setTab('groups')} />}</TabsContent>
        <TabsContent value="groups"><Groups draft={draft} setDraft={setDraft} /></TabsContent>
        <TabsContent value="jobs"><JobsView {...jobs} selected={selectedJob} onSelect={setSelectedJob} /></TabsContent>
      </main>
      </Tabs>
      <Toaster />
      {state && <Settings state={state} open={settings} onOpenChange={setSettings} onState={setState} />}
    </div>
  )
}
