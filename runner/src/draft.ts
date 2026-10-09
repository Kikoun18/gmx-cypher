// The run being set up (inputs, groups, options), kept in this browser between visits: a convenience,
// never data. Jobs and outputs live on the server.

import * as React from 'react'
import type { Group } from './lib/groups'
import type { Slot } from './lib/inputs'

export interface Picked { path: string; why: string }
export interface Draft {
  inputs: Partial<Record<Slot, Picked>>
  /** The reference first, then the selections. */
  groups: Group[]
  /** gmx rdf options set so far, by flag without its dash (R4a). */
  options: Record<string, string | boolean>
  /** The command the analysis tab runs (its tool name); RDF when it is left out (R3b). */
  analysis?: string
  /** The output name template and another output folder than <trajectory folder>/rdf, if any (R5). */
  template?: string
  outDir?: string | null
}

const KEY = 'gmx-cypher-draft'
export const NEW_GROUPS: Group[] = [
  { role: 'reference', name: 'reference', tone: 'coral', steps: [] },
  { role: 'selection', name: 'selection', tone: 'sky', steps: [] },
]
const EMPTY: Draft = { inputs: {}, groups: NEW_GROUPS, options: {} }

function read(): Draft {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return EMPTY }
}

export function useDraft(): [Draft, React.Dispatch<React.SetStateAction<Draft>>] {
  const [draft, setDraft] = React.useState<Draft>(read)
  React.useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(draft)) } catch { /* a convenience only */ } }, [draft])
  return [draft, setDraft]
}
