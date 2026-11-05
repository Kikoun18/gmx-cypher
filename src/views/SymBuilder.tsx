import { useBuildCheck } from '../buildCheck'
import { useBuildDraft } from '../buildDraft'
import { SYM_VIEWS, type Route, type SymView } from '../lib/route'
import { SubTabs } from '../ui/tabs'
import { BuildView } from './Build'
import { BuildFilesView } from './BuildFiles'
import { SystemsView } from './Systems'

/** What a view not built yet will hold, said while it is empty (contract §6.4). */
const LATER: Partial<Record<SymView, string>> = {
  progress: 'nothing is building',
  summary: 'no build yet',
}

/** SymBuilder (R1b, R3c): its views as a second line of tabs (T204); the build being planned is kept in this browser. */
export function SymBuilder({ route, go, gmx, base }: { route: Extract<Route, { view: 'symbuilder' }>; go: (r: Route) => void; gmx: string; base: string | null | undefined }) {
  const [draft, setDraft] = useBuildDraft(), { check, error } = useBuildCheck(draft, base)
  return (
    <SubTabs value={route.sub} onValueChange={v => go({ view: 'symbuilder', sub: v as SymView })} label="symbuilder views" items={SYM_VIEWS.map(v => ({ value: v, label: v }))}>
      {route.sub === 'build' && <BuildView draft={draft} setDraft={setDraft} gmx={gmx} />}
      {route.sub === 'systems' && <SystemsView draft={draft} setDraft={setDraft} missing={check?.missing ?? null} />}
      {route.sub === 'files' && <BuildFilesView draft={draft} check={check} error={error} base={base} />}
      {LATER[route.sub] && <p className="m-0 text-control text-muted-foreground">{LATER[route.sub]}</p>}
    </SubTabs>
  )
}
