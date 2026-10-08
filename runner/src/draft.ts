// The run being set up (inputs, groups, options), kept in this browser between visits: a convenience,
// never data. Jobs and outputs live on the server.

import * as React from 'react'
import type { Slot } from './lib/inputs'

export interface Picked { path: string; why: string }
export interface Draft { inputs: Partial<Record<Slot, Picked>> }

const KEY = 'gmx-cypher-draft'
const EMPTY: Draft = { inputs: {} }

function read(): Draft {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return EMPTY }
}

export function useDraft(): [Draft, React.Dispatch<React.SetStateAction<Draft>>] {
  const [draft, setDraft] = React.useState<Draft>(read)
  React.useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(draft)) } catch { /* a convenience only */ } }, [draft])
  return [draft, setDraft]
}
