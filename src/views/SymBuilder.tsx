import { useBuildCheck, useBuildLanding } from '../buildCheck'
import { useBuildDraft } from '../buildDraft'
import { systemsOf } from '../lib/build/plan'
import type { ProjectLike } from '../lib/build/project'
import { SYM_VIEWS, type Route, type SymView } from '../lib/route'
import { useProject } from '../project'
import { SubTabs } from '../ui/tabs'
import { BuildView } from './Build'
import { BuildFilesView } from './BuildFiles'
import { SystemsView } from './Systems'
import { ProgressView } from './Progress'
import { SummaryView, type OnPmf } from './Summary'
import type { useBuilds } from '../builds'


/** SymBuilder (R1b, R3c): its views as a second line of tabs (T204); the build being planned is kept in this browser. */
export function SymBuilder({ route, go, gmx, gmxOk = true, base, vault, projectId, builds, onAnalyse, onPmf }: { route: Extract<Route, { view: 'symbuilder' }>; go: (r: Route) => void; gmx: string; gmxOk?: boolean; base: string | null | undefined; vault?: string | null; projectId?: string | null; builds: ReturnType<typeof useBuilds>
  /** R10: set-up's batch mode with this root and path template. */
  onAnalyse?: (root: string, template: string) => void; onPmf?: OnPmf }) {
  const [draft, setDraft] = useBuildDraft(), { check, error } = useBuildCheck(draft, base), project = useProject<ProjectLike>(vault, projectId)
  const landing = useBuildLanding(draft, vault && route.sub === 'systems' ? projectId : null, base)
  return (
    <SubTabs value={route.sub} onValueChange={v => go({ view: 'symbuilder', sub: v as SymView })} label="symbuilder views" items={SYM_VIEWS.map(v => ({ value: v, label: v, ...(v === 'systems' ? { count: String(systemsOf(draft.systems).length).padStart(2, '0') } : v === 'progress' && builds.building ? { count: builds.building + ' building' } : {}) }))}>
      {route.sub === 'build' && <BuildView draft={draft} setDraft={setDraft} gmx={gmx} />}
      {route.sub === 'systems' && <SystemsView draft={draft} setDraft={setDraft} missing={check?.missing ?? null} answers={check?.pdb2gmx ?? null} timestep={check?.timestep ?? []} project={project} landing={landing}
        build={{ blocked: !base ? 'set a base folder in settings → SymBuilder first' : !gmxOk ? 'no working gmx: set it in settings → gmx' : builds.runs[0]?.status === 'running' ? 'a build is running: one at a time' : null,
          start: () => builds.start(draft).then(() => go({ view: 'symbuilder', sub: 'progress' })) }} />}
      {route.sub === 'summary' && <SummaryView runs={builds.runs} onAnalyse={onAnalyse} onPmf={onPmf} />}
      {route.sub === 'progress' && <ProgressView runs={builds.runs} logs={builds.logs} loadLog={builds.loadLog} onCancel={id => void builds.cancel(id)} onRetry={builds.retry} />}
      {route.sub === 'files' && <BuildFilesView draft={draft} setDraft={setDraft} check={check} error={error} base={base} />}
    </SubTabs>
  )
}
