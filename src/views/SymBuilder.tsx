import { SYM_VIEWS, type Route, type SymView } from '../lib/route'
import { SubTabs } from '../ui/tabs'

/** What each view will hold, said while it is empty (contract §6.4). */
const EMPTY: Record<SymView, string> = {
  build: 'no build plan yet · the stack of tiles, stage by stage, and each step\'s command for the first system will be here',
  systems: 'no systems yet · methods × saccharides × sequences, and a preview of every system before anything is built',
  files: 'nothing read yet · the .gro and .itp of each saccharide, the mdp file of each stage and the force field',
  progress: 'nothing is building',
  summary: 'no build yet',
}

/** SymBuilder (R1b): its views, as a second line of tabs (T204). */
export function SymBuilder({ route, go }: { route: Extract<Route, { view: 'symbuilder' }>; go: (r: Route) => void }) {
  return (
    <SubTabs value={route.sub} onValueChange={v => go({ view: 'symbuilder', sub: v as SymView })} label="symbuilder views" items={SYM_VIEWS.map(v => ({ value: v, label: v }))}>
      <p className="m-0 text-control text-muted-foreground">{EMPTY[route.sub]}</p>
    </SubTabs>
  )
}
