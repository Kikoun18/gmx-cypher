import * as React from 'react'
import { Section } from '../ui/separator'
import type { Draft } from '../draft'
import { atomTable, type Atom } from '../lib/atoms'
import { structFormat } from '../../../app/src/lib/structFile'
import { Viewer, type PickHow } from './Viewer'

/** The structure file's text and its atom table, read once per path. */
function useStructure(path: string | undefined) {
  const [s, setS] = React.useState<{ path: string; text: string; format: 'gro' | 'pdb'; atoms: Atom[] } | { path: string; error: string } | null>(null)
  React.useEffect(() => {
    if (!path) return
    let alive = true
    fetch('/api/file?path=' + encodeURIComponent(path)).then(async r => {
      const text = await r.text()
      if (!alive) return
      if (!r.ok) { setS({ path, error: JSON.parse(text).error }); return }
      const format = structFormat(path, text)
      setS(format ? { path, text, format, atoms: atomTable(text, format) } : { path, error: path + ' is not a .gro or .pdb' })
    }, e => alive && setS({ path, error: String(e) }))
    return () => { alive = false }
  }, [path])
  return s && s.path === path ? s : null
}

export function Groups({ draft }: { draft: Draft }) {
  const structure = useStructure(draft.inputs.structure?.path)
  const [picked, setPicked] = React.useState<{ nr: number; how: PickHow } | null>(null)
  const colour = React.useMemo(() => new Map(), [])
  if (!draft.inputs.structure) return <p className="m-0 text-control text-muted-foreground">pick a structure in inputs first</p>
  if (!structure) return <p className="m-0 text-control text-muted-foreground" aria-live="polite">reading the structure…</p>
  if ('error' in structure) return <p className="m-0 text-control text-destructive">✗ {structure.error}</p>
  const a = picked && structure.atoms[picked.nr - 1]
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-5">
      <Viewer text={structure.text} format={structure.format} atoms={structure.atoms} colour={colour} onPick={(nr, how) => setPicked({ nr, how })} describe={() => ''} />
      <div className="flex flex-col gap-3">
        <Section label="Picked" />
        <p className="m-0 text-control" aria-live="polite">{a ? 'atom ' + a.nr + ' · ' + a.name + ' · ' + a.resn + ' ' + a.resi + ' · ' + a.elem + ' (' + picked!.how + ')' : 'click an atom'}</p>
      </div>
    </div>
  )
}
