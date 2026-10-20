// Whether the set-up's inputs can run together, as gmx reads them (R2b, R9a): checked by the server for the files
// picked, and for gmx energy and gmx awh, what their energy file holds.

import * as React from 'react'
import { postJson } from './api'
import type { Draft } from './draft'
import { COMMANDS, commandOf } from './lib/commands'
import type { Slot } from './lib/inputs'
import { useAwhScan, useTerms } from './terms'

export interface InputCheck {
  ok: boolean; problems: string[]
  counts: { structure: number | null; runInput: number | null; trajectory: number | null }
  index?: { groups: number; maxAtom: number }; estimate?: { frames: number; start: number; end: number } | null
}

/** Re-checked whenever an input changes: counts as gmx reads them, and every problem in words (R2b). */
export function useInputCheck(inputs: Draft['inputs']) {
  const key = JSON.stringify(Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v!.path])))
  const complete = !!(inputs.trajectory && inputs.runInput && inputs.structure)
  const [result, setResult] = React.useState<{ key: string; check: InputCheck } | null>(null)
  React.useEffect(() => {
    if (!complete) return
    let alive = true
    const fail = (e: Error) => ({ ok: false, problems: [e.message], counts: { structure: null, runInput: null, trajectory: null } })
    postJson<InputCheck>('/api/check', { inputs: JSON.parse(key) }).then(c => alive && setResult({ key, check: c }), e => alive && setResult({ key, check: fail(e) }))
    return () => { alive = false }
  }, [key, complete])
  // The result shown is only ever the one for the current inputs.
  return { check: complete && result?.key === key ? result.check : null, busy: complete && result?.key !== key }
}

/** Whether the inputs the command takes are ready, as gmx reads them: the set-up's first step and its state (R9a). */
export function useInputsCheck(draft: Draft) {
  const command = commandOf(draft.analysis ?? 'rdf') ?? COMMANDS[0]
  // Only the slots shown are checked: a file another command uses can't hold this one up (review finding 7).
  const checked = useInputCheck(command.groups ? Object.fromEntries(Object.entries(draft.inputs).filter(([k]) => command.inputs.includes(k as Slot))) : {})
  const energy = useTerms(command.tool === 'energy' ? draft.inputs.edr?.path : undefined)
  const awh = useAwhScan(command.tool === 'awh' ? draft.inputs.edr?.path : undefined, command.tool === 'awh' ? draft.inputs.runInput?.path : undefined)
  const frames = awh?.scan?.frames
  // gmx wham takes no input slots: its windows are found in the command step (R6).
  const ready = command.tool === 'energy' ? !!energy?.terms : command.tool === 'awh' ? !!frames?.length : command.tool === 'wham' ? true : !!checked.check?.ok
  const failed = command.tool === 'energy' ? !!energy?.error : command.tool === 'awh' ? !!awh?.error || frames?.length === 0 : !!checked.check && !checked.check.ok
  const busy = command.tool === 'energy' ? !!draft.inputs.edr && !energy : command.tool === 'awh' ? !!draft.inputs.edr && !!draft.inputs.runInput && !awh : checked.busy
  return { command, checked, energy, awh, frames, ready, failed, busy }
}
