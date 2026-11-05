// What a build reads, checked (R4): the server's answer for the build being planned, asked again when it changes.

import * as React from 'react'
import { postJson } from './api'
import type { BuildDraft } from './buildDraft'
import type { Input } from './lib/build/inputs'
import type { PmfLanding } from './lib/build/landing'

export interface BuildCheck { base: string; files: (Input & { found: boolean })[]; missing: Record<string, string[]> }

export function useBuildCheck(draft: BuildDraft, base: string | null | undefined): { check: BuildCheck | null; error: string } {
  // An answer belongs to the base folder it was asked for, and an error replaces it (review: no stale found/missing).
  const [read, setRead] = React.useState<{ base: string; check: BuildCheck | null; error: string } | null>(null)
  React.useEffect(() => {
    if (!base) return
    let alive = true
    const t = setTimeout(() => postJson<BuildCheck>('/api/build/check', { plan: draft.plan, systems: draft.systems })
      .then(c => alive && setRead({ base, check: c, error: '' }), e => alive && setRead({ base, check: null, error: (e as Error).message })), 300)
    return () => { alive = false; clearTimeout(t) }
  }, [draft.plan, draft.systems, base])
  return base && read?.base === base ? { check: read.check, error: read.error } : { check: null, error: '' }
}

/** Where each system's PMF would land in the connected project (R8b), as `POST /api/build/landing` answers. */
export interface BuildLanding { project: { name: string; pattern: string; pathPattern: string }; systems: Record<string, PmfLanding | null>; more: number }

export function useBuildLanding(draft: BuildDraft, project: string | null | undefined, base: string | null | undefined): BuildLanding | null {
  const [landing, setLanding] = React.useState<{ key: string; landing: BuildLanding } | null>(null)
  React.useEffect(() => {
    if (!project) return
    let alive = true
    const t = setTimeout(() => postJson<BuildLanding>('/api/build/landing', { plan: draft.plan, systems: draft.systems }).then(l => alive && setLanding({ key: project, landing: l }), () => alive && setLanding(null)), 300)
    return () => { alive = false; clearTimeout(t) }
  }, [draft.plan, draft.systems, project, base])
  return project && landing?.key === project ? landing.landing : null
}
