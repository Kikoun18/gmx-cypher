// What a build reads, checked (R4): the server's answer for the build being planned, asked again when it changes.

import * as React from 'react'
import { postJson } from './api'
import type { BuildDraft } from './buildDraft'
import type { Input } from './lib/build/inputs'

export interface BuildCheck { base: string; files: (Input & { found: boolean })[]; missing: Record<string, string[]> }

export function useBuildCheck(draft: BuildDraft, base: string | null | undefined): { check: BuildCheck | null; error: string } {
  const [check, setCheck] = React.useState<BuildCheck | null>(null), [error, setError] = React.useState('')
  React.useEffect(() => {
    if (!base) return
    let alive = true
    const t = setTimeout(() => postJson<BuildCheck>('/api/build/check', { plan: draft.plan, systems: draft.systems }).then(c => { if (alive) { setCheck(c); setError('') } }, e => alive && setError((e as Error).message)), 300)
    return () => { alive = false; clearTimeout(t) }
  }, [draft.plan, draft.systems, base])
  return base ? { check, error } : { check: null, error: '' }
}
