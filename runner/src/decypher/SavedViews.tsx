// Saved compare views (R14b, question 24): what compare shows, how it shows it, and the groups' labels, saved by name
// in the connected project's part of the vault's gmx-cypher space; the working state stays in this browser. A view is
// written once (a name taken is refused, never replaced); opening one replaces what compare shows.

import * as React from 'react'
import { getJson, postJson } from '../api'
import type { Labels } from '../lib/labels'
import type { SavedView } from '../lib/space'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Status } from '../ui/status'
import { refKey, type SourceRef, type View } from './state'

interface Listed { name: string; saved: string; sources: number }

export function SavedViews({ refs, view, labels, onOpen, onClose }: {
  refs: SourceRef[]; view: View; labels: Labels
  onOpen: (v: SavedView, missing: string[]) => void; onClose: () => void
}) {
  const [list, setList] = React.useState<{ views?: Listed[]; error?: string } | null>(null), [name, setName] = React.useState(''), [said, setSaid] = React.useState<{ ok: boolean; text: string } | null>(null)
  const read = React.useCallback(() => { getJson<{ views: Listed[] }>('/api/space/views').then(r => setList({ views: r.views }), e => setList({ error: (e as Error).message })) }, [])
  React.useEffect(read, [read])
  const save = async () => {
    const n = name.trim()
    if (!n) return
    // The labels of what compare shows, by each source's id (files dropped are not kept, so neither are theirs).
    const keys = new Set(refs.map(refKey)), mine = Object.fromEntries(Object.entries(labels).filter(([k]) => keys.has(k)))
    try { await postJson('/api/space/views', { name: n, sources: refs, view, labels: mine }); setSaid({ ok: true, text: 'saved: ' + n }); setName(''); read() }
    catch (e) { setSaid({ ok: false, text: (e as Error).message }) }
  }
  const open = (n: string) => getJson<{ view: SavedView; missing: string[] }>('/api/space/views/' + encodeURIComponent(n)).then(r => { onOpen(r.view, r.missing); setSaid({ ok: true, text: 'opened: ' + n + (r.missing.length ? ' · not found under the allowed folders: ' + r.missing.join(', ') : '') }) }, e => setSaid({ ok: false, text: (e as Error).message }))
  return (
    <div className="flex flex-col gap-3 border-b border-border px-5 py-3" aria-label="saved views">
      {list?.error ? <p className="m-0 text-caption text-muted-foreground">{list.error}</p> : (
        <>
          <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); void save() }}>
            <Input className="h-8 w-72" value={name} placeholder="a name for this view" aria-label="view name" onChange={e => setName(e.target.value)} />
            <Button type="submit" variant="outline" size="sm" disabled={!name.trim() || !refs.length} title={refs.length ? 'its sources, how compare shows them, and their labels' : 'nothing to save: pick results first'}>save view</Button>
            <span className="text-caption text-muted-foreground">in the vault, with the connected project · a name is used once: nothing is replaced</span>
            <span className="flex-1" />
            <Button variant="ghost" size="sm" onClick={onClose}>close</Button>
          </form>
          {said && (said.ok ? <p className="m-0 text-caption text-muted-foreground" aria-live="polite">{said.text}</p> : <Status level="error" className="text-control">{said.text}</Status>)}
          {list?.views && (list.views.length ? (
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {list.views.map(v => (
                <li key={v.name} className="flex items-center gap-3 text-control">
                  <span className="min-w-0 truncate font-bold">{v.name}</span>
                  <span className="text-caption text-muted-foreground">{v.sources} {v.sources === 1 ? 'source' : 'sources'} · {new Date(v.saved).toLocaleString()}</span>
                  <Button variant="ghost" size="sm" onClick={() => void open(v.name)} title="replaces what compare shows now">open</Button>
                </li>
              ))}
            </ul>
          ) : <p className="m-0 text-caption text-muted-foreground">no saved views in this project yet</p>)}
        </>
      )}
      {!list && <p className="m-0 text-caption text-muted-foreground" aria-live="polite">reading the saved views…</p>}
    </div>
  )
}
