// What differs between two runs (R13), as a table: only the differences, section by section, each with both values and
// a note (an option's default, the atoms added and removed); the equal fields counted, and listed on asking. Two jobs'
// records come from the server; a record on disk through compare's own read, the record alone.

import * as React from 'react'
import { getJson } from '../api'
import type { Job } from '../jobs'
import { diffRecords, type DiffRecord, type DiffSection } from '../lib/runDiff'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Section } from '../ui/separator'
import { Status } from '../ui/status'

const SECTIONS: [DiffSection, string][] = [['command', 'Command'], ['options', 'Options'], ['frames', 'Frames'], ['inputs', 'Inputs'], ['groups', 'Groups'], ['gmx', 'gmx and gmx-cypher'], ['environment', 'Environment']]

export function RunDiff({ a, b, aName, bName }: { a: DiffRecord; b: DiffRecord; aName: string; bName: string }) {
  const d = React.useMemo(() => diffRecords(a, b), [a, b]), [all, setAll] = React.useState(false)
  const rows = all ? d.all : d.rows
  // One set of columns for every section: the field, each record's value, the note.
  const cols = <colgroup><col className="w-[22%]" /><col className="w-[26%]" /><col className="w-[26%]" /><col /></colgroup>
  return (
    <div className="flex flex-col gap-3" aria-label={'differences between ' + aName + ' and ' + bName}>
      <table className="w-full table-fixed text-control" aria-hidden>{cols}
        <thead><tr className="text-left text-label uppercase text-muted-foreground"><th className="font-normal" /><th className="truncate pr-3 font-normal" title={aName}>{aName}</th><th className="truncate pr-3 font-normal" title={bName}>{bName}</th><th className="font-normal" /></tr></thead>
      </table>
      <p className="m-0 text-control">
        {d.rows.length ? d.rows.length + (d.rows.length === 1 ? ' difference' : ' differences') : 'no difference'}
        <span className="text-muted-foreground"> · </span>
        <button type="button" aria-pressed={all} className="text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setAll(x => !x)}>
          {d.equal} {d.equal === 1 ? 'field' : 'fields'} equal{d.unrecorded.length ? ', ' + d.unrecorded.length + ' recorded in one only' : ''}{all ? ' · hide them' : ' · show them'}
        </button>
      </p>
      {SECTIONS.map(([key, label]) => {
        const here = rows.filter(r => r.section === key)
        if (!here.length) return null
        return (
          <div key={key} className="flex flex-col gap-1">
            <Section label={label} />
            <table className="w-full table-fixed text-control" aria-label={label}>{cols}
              <thead className="sr-only"><tr><th>field</th><th>{aName}</th><th>{bName}</th><th>note</th></tr></thead>
              <tbody>
                {here.map((r, i) => {
                  const differs = d.rows.includes(r)
                  return (
                    <tr key={i} className={differs ? '' : 'text-muted-foreground'}>
                      <td className="truncate py-0.5 pr-3 align-top" title={r.field}>{r.field}</td>
                      <td className={'break-words py-0.5 pr-3 align-top' + (differs ? ' font-bold' : '')}>{r.a}</td>
                      <td className={'break-words py-0.5 pr-3 align-top' + (differs ? ' font-bold' : '')}>{r.b}</td>
                      <td className="break-words py-0.5 align-top text-caption text-muted-foreground">{r.note}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

/** A record to diff: one of this runner's jobs, or a .run.json on disk. */
export type DiffSource = { kind: 'job'; id: string; name: string } | { kind: 'path'; path: string; name: string }
const sourceKey = (s: DiffSource) => (s.kind === 'job' ? 'job:' + s.id : 'path:' + s.path)
const readSource = (s: DiffSource) => (s.kind === 'job' ? getJson<DiffRecord>('/api/jobs/' + s.id + '/record') : getJson<{ record: DiffRecord }>('/api/decypher/run?only=record&path=' + encodeURIComponent(s.path)).then(r => r.record))

/** Two records read, then their differences; the reason in words when one can't be read. */
export function DiffPane({ a, b }: { a: DiffSource; b: DiffSource }) {
  const key = sourceKey(a) + '\0' + sourceKey(b)
  const [r, setR] = React.useState<{ key: string; recs?: [DiffRecord, DiffRecord]; error?: string } | null>(null)
  React.useEffect(() => {
    let alive = true
    Promise.all([readSource(a), readSource(b)]).then(recs => alive && setR({ key, recs }), e => alive && setR({ key, error: (e as Error).message }))
    return () => { alive = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps -- the sources are what their key says
  if (!r || r.key !== key) return <p className="m-0 text-caption text-muted-foreground" aria-live="polite">reading both records…</p>
  if (r.error) return <Status level="error" className="text-control">{r.error}</Status>
  return <RunDiff a={r.recs![0]} b={r.recs![1]} aName={a.name} bName={b.name} />
}

/** With two jobs selected in the results list (R13): their run diff, in place of compare. */
export function JobsDiff({ ids, jobs, onCompare }: { ids: string[]; jobs: Job[]; onCompare: () => void }) {
  const [a, b] = ids.map(id => jobs.find(j => j.id === id))
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="m-0 text-title font-bold">What differs</h2>
        <Button variant="outline" size="sm" onClick={onCompare}>compare their results</Button>
      </div>
      {ids.length !== 2 ? <p className="m-0 text-control text-muted-foreground">select two jobs: the diff is between two records</p>
        : !a || !b ? <p className="m-0 text-control text-muted-foreground">{ids.filter(id => !jobs.some(j => j.id === id)).length === 2 ? 'neither job is' : 'one of the jobs is not'} in the list: archived, or not among this gmx-cypher's jobs</p>
          : <DiffPane a={{ kind: 'job', id: a.id, name: a.name ?? a.title }} b={{ kind: 'job', id: b.id, name: b.name ?? b.title }} />}
      <p className="m-0 text-caption text-muted-foreground">from the two jobs' records · inputs moved but the same (by SHA-256, else size and time) are equal</p>
    </div>
  )
}

/** On a result (R13): pick another job, or a record on disk, and see what differs from this one. */
export function CompareWith({ job, jobs, onClose }: { job: Job; jobs: Job[]; onClose: () => void }) {
  const others = jobs.filter(j => j.id !== job.id && j.ended && j.status !== 'interrupted' && j.meta?.record)
  const [other, setOther] = React.useState<DiffSource | null>(null), [path, setPath] = React.useState('')
  const name = job.name ?? job.title
  const readPath = () => { const p = path.trim(); if (p) setOther({ kind: 'path', path: p, name: p.split('/').pop()!.replace(/\.run\.json$/, '') }) }
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3" aria-label="compare with">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={other?.kind === 'job' ? other.id : ''} onValueChange={id => { const j = others.find(x => x.id === id); if (j) setOther({ kind: 'job', id, name: j.name ?? j.title }) }}>
          <SelectTrigger size="sm" className="w-64" aria-label="another job"><SelectValue placeholder={others.length ? 'another job' : 'no other job has ended'} /></SelectTrigger>
          <SelectContent>{others.map(j => <SelectItem key={j.id} value={j.id}>{j.name ?? j.title}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-caption text-muted-foreground">or a record on disk</span>
        <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); readPath() }}>
          <Input className="h-8 w-80" value={path} placeholder="/path/to/run.run.json" aria-label="a record on disk" onChange={e => setPath(e.target.value)} />
          <Button type="submit" variant="outline" size="sm" disabled={!path.trim()}>read</Button>
        </form>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onClose}>close</Button>
      </div>
      {other ? <DiffPane a={{ kind: 'job', id: job.id, name }} b={other} /> : <p className="m-0 text-caption text-muted-foreground">only what differs is listed; the fields that are equal are counted</p>}
    </div>
  )
}
