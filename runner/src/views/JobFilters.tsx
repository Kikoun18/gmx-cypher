// The jobs list's search and filters (R12b): a search box over names, groups and folders, and filters by command,
// status, batch, folder and day, each offering the values the jobs have with their counts. All of it is in the address.

import * as React from 'react'
import type { Job } from '../jobs'
import { filterOptions, type JobFilter } from '../lib/jobFilter'
import { shortPath } from '../lib/paths'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

const ANY = '*'

function Pick({ label, value, options, onChange }: { label: string; value: string | undefined; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <Select value={value ?? ANY} onValueChange={v => onChange(v === ANY ? '' : v)}>
      <SelectTrigger size="sm" className="w-full" aria-label={label}><span className="text-muted-foreground">{label}</span><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>any</SelectItem>
        {options.map(([v, text]) => <SelectItem key={v} value={v}>{text}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export function JobFilters({ jobs, filter, onFilter, shown, allow }: {
  jobs: Job[]; filter: JobFilter; shown: number; allow: string[]
  /** A new filter; `typing` while the search is typed (the address is replaced, not stepped). */
  onFilter: (f: JobFilter, typing?: boolean) => void
}) {
  const set = (k: keyof JobFilter, v: string, typing = false) => { const { [k]: _, ...rest } = filter; onFilter(v ? { ...rest, [k]: v } : rest, typing) }
  const others = Object.keys(filter).filter(k => k !== 'q').length
  const [open, setOpen] = React.useState(others > 0)
  const o = React.useMemo(() => filterOptions(jobs), [jobs])
  const n = (c: number) => ' · ' + c
  return (
    <div className="flex flex-col gap-1.5">
      <Input type="search" className="h-8" value={filter.q ?? ''} placeholder="search names, groups, folders" aria-label="search jobs" onChange={e => set('q', e.target.value, true)} />
      <div className="flex items-center gap-2 text-caption text-muted-foreground">
        <button type="button" aria-expanded={open} className="underline underline-offset-2 hover:text-foreground" onClick={() => setOpen(x => !x)}>filters{others ? ' · ' + others : ''}</button>
        <span className="flex-1" />
        {Object.keys(filter).length > 0 && <><span>{shown} of {jobs.length}</span><button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => onFilter({})}>clear</button></>}
      </div>
      {open && (
        <div role="group" aria-label="filters" className="flex flex-col gap-1.5">
          <Pick label="command" value={filter.command} options={o.commands.map(([v, c]) => [v, 'gmx ' + v + n(c)])} onChange={v => set('command', v)} />
          <Pick label="status" value={filter.status} options={o.statuses.map(([v, c]) => [v, v + n(c)])} onChange={v => set('status', v)} />
          {o.batches.length > 0 && <Pick label="batch" value={filter.batch} options={o.batches.map(([v, name, c]) => [v, name + n(c)])} onChange={v => set('batch', v)} />}
          <Pick label="folder" value={filter.folder} options={o.folders.map(([v, c]) => [v, shortPath(v, allow) + n(c)])} onChange={v => set('folder', v)} />
          <div className="grid grid-cols-2 gap-1.5">
            <Input type="date" className="h-8 text-caption" value={filter.from ?? ''} aria-label="made on or after" title="made on or after" onChange={e => set('from', e.target.value)} />
            <Input type="date" className="h-8 text-caption" value={filter.to ?? ''} aria-label="made on or before" title="made on or before" onChange={e => set('to', e.target.value)} />
          </div>
        </div>
      )}
    </div>
  )
}
