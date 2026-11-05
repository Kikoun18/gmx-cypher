// The build being planned (R3c): its build plan and its systems, kept in this browser between visits, as set-up's
// draft is: a convenience, never data. A saved build plan lives on the server (R3a).

import * as React from 'react'
import { DEFAULT_PLAN, planProblems, type BuildPlan, type Systems } from './lib/build/plan'

export type IfExists = 'continue' | 'skip' | 'repeat'
export interface BuildDraft {
  plan: BuildPlan
  systems: Systems
  /** What a build does with a system folder that exists (R6): carry on, leave it, or build a repeat beside it. */
  ifExists: IfExists
  /** On a failure: go on with the next system, or stop the build (R6). */
  onFailure: 'next' | 'stop'
}

const KEY = 'gmx-cypher-build'
export const EMPTY_BUILD: BuildDraft = { plan: DEFAULT_PLAN, systems: { methods: ['hmr+fast+6'], saccharides: [], sequences: [], repeats: 0 }, ifExists: 'continue', onFailure: 'next' }

/** The draft as this browser keeps it, read once (cluster · scripts shows its first system's scripts). */
export function readBuildDraft(): BuildDraft {
  try {
    const d = { ...EMPTY_BUILD, ...JSON.parse(localStorage.getItem(KEY) || '{}') } as BuildDraft
    return planProblems(d.plan).length ? { ...d, plan: DEFAULT_PLAN } : d
  } catch { return EMPTY_BUILD }
}

export function useBuildDraft(): [BuildDraft, React.Dispatch<React.SetStateAction<BuildDraft>>] {
  const [d, setD] = React.useState<BuildDraft>(readBuildDraft)
  React.useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* a convenience only */ } }, [d])
  return [d, setD]
}
