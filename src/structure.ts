// The structure and index files of the draft, read once per path and shared by the groups and RDF views.

import * as React from 'react'
import { structFormat } from '../../matrix/src/lib/structFile'
import { parseStructure, type Struct } from './core/index'
import { atomsOf, type Atom } from './lib/atoms'
import { parseNdx, type NdxGroup } from './lib/ndx'

export type Structure = { path: string; text: string; format: 'gro' | 'pdb'; model: Struct; atoms: Atom[] } | { path: string; error: string }

/** The structure file's text, its model (the core's one parser, R5b) and its atom table, read once per path. */
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
      if (!format) { setS({ path, error: path + ' is not a .gro or .pdb' }); return }
      try { const model = parseStructure(text, format); setS({ path, text, format, model, atoms: atomsOf(model) }) } catch (e) { setS({ path, error: path + ': ' + (e as Error).message }) }
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
