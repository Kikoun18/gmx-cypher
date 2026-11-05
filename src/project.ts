// The connected project (R2, R8a): read once when a view opens, or again when the vault or the project changes.
// A convenience for home and SymBuilder; a project that can't be read is shown as none.

import * as React from 'react'
import { getJson } from './api'

export function useProject<T>(vault: string | null | undefined, id: string | null | undefined): T | null {
  const [read, setRead] = React.useState<{ key: string; project: T } | null>(null)
  const key = vault && id ? vault + '\n' + id : ''
  React.useEffect(() => {
    if (!key) return
    let alive = true
    getJson<T>('/api/vault/project?id=' + encodeURIComponent(id!)).then(p => alive && setRead({ key, project: p }), () => {})
    return () => { alive = false }
  }, [key, id])
  return read && read.key === key ? read.project : null
}
