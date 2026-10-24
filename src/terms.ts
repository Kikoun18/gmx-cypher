// What an energy file holds, read by gmx through the server for the files picked in the inputs: the terms of
// gmx energy (R4), and the AWH frames of gmx awh (R5).
import * as React from 'react'
import { getJson } from './api'
import type { AwhFrame } from './lib/awh'
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

export interface AwhScanResult { frames: AwhFrame[]; targetError: { kT: number; kJ: number } | null }

/** The AWH frames of an energy file and its run input (GET /api/awh/frames, R5): what each frame choice would write. */
export function useAwhScan(edr: string | undefined, tpr: string | undefined) {
  const key = edr && tpr ? edr + '\0' + tpr : ''
  const [t, setT] = React.useState<{ key: string; scan?: AwhScanResult; error?: string } | null>(null)
  React.useEffect(() => {
    if (!key) return
    let alive = true
    getJson<AwhScanResult>('/api/awh/frames?edr=' + encodeURIComponent(edr!) + '&tpr=' + encodeURIComponent(tpr!))
      .then(scan => alive && setT({ key, scan }), e => alive && setT({ key, error: (e as Error).message }))
    return () => { alive = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- key is edr and tpr
  return key && t?.key === key ? t : null
}
