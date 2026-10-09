// The terms of an energy file (R4): read by gmx energy through the server, for the file picked in the inputs.
import * as React from 'react'
import { getJson } from './api'
import type { EnergyTerm } from './lib/energy'

/** The terms of an energy file, as gmx energy lists them (GET /api/energy/menu), for the file that is picked (R4). */
export function useTerms(path: string | undefined) {
  const [t, setT] = React.useState<{ key: string; terms?: EnergyTerm[]; error?: string } | null>(null)
  React.useEffect(() => {
    if (!path) return
    let alive = true
    getJson<{ terms: EnergyTerm[] }>('/api/energy/menu?path=' + encodeURIComponent(path))
      .then(r => alive && setT({ key: path, terms: r.terms }), e => alive && setT({ key: path, error: (e as Error).message }))
    return () => { alive = false }
  }, [path])
  return path && t?.key === path ? t : null
}
