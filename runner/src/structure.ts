// The structure and index files of the draft, read once per path and shared by the groups and RDF views.

import * as React from 'react'
import { structFormat } from '../../matrix/src/lib/structFile'
import { atomTable, type Atom } from './lib/atoms'
import { parseNdx, type NdxGroup } from './lib/ndx'

export type Structure = { path: string; text: string; format: 'gro' | 'pdb'; atoms: Atom[] } | { path: string; error: string }

/** The structure file's text and its atom table, read once per path. */
export function useStructure(path: string | undefined): Structure | null {
  const [s, setS] = React.useState<Structure | null>(null)
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

/** The index file's groups, read once per path (an unreadable one is reported by the input checks). */
export function useIndex(path: string | undefined): NdxGroup[] {
  const [s, setS] = React.useState<{ path: string; groups: NdxGroup[] } | null>(null)
  React.useEffect(() => {
    if (!path) return
    let alive = true
    fetch('/api/file?path=' + encodeURIComponent(path)).then(r => (r.ok ? r.text() : '')).then(t => alive && setS({ path, groups: parseNdx(t) }), () => {})
    return () => { alive = false }
  }, [path])
  return path && s?.path === path ? s.groups : []
}
