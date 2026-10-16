// Loading what (de)Cypher shows. A job through the runner's own routes: its record, its g(r), and the structure
// it ran with. A vault RDF through the read-only vault routes, with its row's structure when that has the atoms
// the groups reach, else the structure of the run that wrote it. Files from disk through fromFiles.

import * as React from 'react'
import { getJson } from '../api'
import type { Job } from '../jobs'
import type { Analysis, Struct } from './kit'
import { basename, fromFiles, fromRecord, fromVault, maxAtom, parseStruct, recordGroups, shortLabels, type FileRow, type LoadedFile, type RecordLike } from './parse'
import { refKey, type SourceRef } from './state'
import type { VaultRdfs } from './vaultTypes'

export interface Item { key: string; kind: 'job' | 'record' | 'vault' | 'file'; name: string; status: 'loading' | 'waiting' | 'ready' | 'error'; analysis?: Analysis; error?: string }
type Result = { analysis: Analysis; structs: Record<string, Struct> }

/** A file's text, or the server's reason in words. */
async function text(path: string): Promise<string> {
  const r = await fetch(path), t = await r.text()
  if (!r.ok) { let m = t; try { m = JSON.parse(t).error } catch { /* plain text */ } throw new Error(m || r.statusText) }
  return t
}
const enc = encodeURIComponent

// Structures are read once per page: several jobs of one system share theirs.
const structs = new Map<string, Promise<Struct>>()
function structAt(key: string, url: string, name: string): Promise<Struct> {
  if (!structs.has(key)) structs.set(key, text(url).then(t => parseStruct(name, t)))
  const p = structs.get(key)!
  p.catch(() => structs.delete(key))
  return p
}

const enough = (s: Struct, need: number) => s.n >= need
const atomsNote = (name: string, s: Struct, need: number) => name + ' has ' + s.n + ' atoms; the groups reach atom ' + need

/** A run's own structure (the one its groups were picked on), if the allowed folders still hold it. */
async function runStructure(rec: RecordLike): Promise<{ key: string | null; note: string; structs: Record<string, Struct> }> {
  const sp = rec.inputs?.structure?.path, out: Record<string, Struct> = {}
  const g = recordGroups(rec), need = maxAtom([g.ref, ...g.sels])
  let key: string | null = null, note = 'the run named no structure'
  if (sp) {
    try {
      const s = await structAt('path:' + sp, '/api/file?path=' + enc(sp), sp)
      key = 'path:' + sp; out[key] = s
      note = enough(s, need) ? basename(sp) + ' · the structure it ran with' : atomsNote(basename(sp), s, need)
    } catch (e) { note = basename(sp) + ': ' + (e as Error).message }
  }
  return { key, note, structs: out }
}

async function loadJob(job: Job): Promise<Result> {
  const rec = await getJson<RecordLike>('/api/jobs/' + job.id + '/record'), xvg = await text('/api/jobs/' + job.id + '/output?kind=xvg')
  const s = await runStructure(rec), stem = String(job.meta?.stem ?? job.title)
  return { analysis: fromRecord({ id: 'job:' + job.id, kind: 'job', title: job.title, label: stem, source: 'job', record: rec, xvg, struct: s.key, structNote: s.note }), structs: s.structs }
}

async function loadRecord(path: string): Promise<Result> {
  const { record, xvg } = await getJson<{ record: RecordLike; xvg: string }>('/api/decypher/run?path=' + enc(path))
  const s = await runStructure(record), stem = basename(path).replace(/\.run\.json$/, ''), g = recordGroups(record)
  const title = stem + (g.ref ? ' · ' + g.ref.name + ' → ' + (g.sels.length === 1 ? g.sels[0].name : g.sels.length + ' groups') : '')
  return { analysis: fromRecord({ id: 'record:' + path, kind: 'record', title, label: stem, source: 'run on disk', record, xvg, struct: s.key, structNote: s.note }), structs: s.structs }
}

async function loadVault(ref: Extract<SourceRef, { kind: 'vault' }>, list: VaultRdfs): Promise<Result> {
  const p = list.projects.find(x => x.id === ref.project), row = p?.rows.find(r => r.id === ref.row), rdf = row?.rdfs.find(a => a.id === ref.rdf)
  if (!p || !row || !rdf) throw new Error('no longer in the vault')
  const texts = new Map<string, string>()
  await Promise.all([...new Set(rdf.curves.map(c => c.file))].map(async f => texts.set(f, await text('/api/decypher/vault/file?path=' + enc(f)))))
  const run = rdf.run
  const record: RecordLike | null = run ? { groups: run.groups, frames: run.frames, options: run.bin != null ? [{ flag: 'bin', value: run.bin }] : [], inputs: run.structure ? { structure: { path: run.structure } } : {} } : null
  const g = record ? recordGroups(record) : null, need = g ? maxAtom([g.ref, ...g.sels]) : 0
  const out: Record<string, Struct> = {}, tried: string[] = []
  let key: string | null = null, note = ''
  // The row's own structure first: the GRO that the Matrix keeps with the sequence.
  for (const s of row.structures) {
    try {
      const st = await structAt('vault:' + s.file, '/api/decypher/vault/file?path=' + enc(s.file), s.name)
      if (enough(st, need)) { key = 'vault:' + s.file; out[key] = st; note = s.name + ' · ' + row.name + '\'s structure in the Matrix'; break }
      tried.push(atomsNote(s.name, st, need))
    } catch (e) { tried.push(s.name + ': ' + (e as Error).message) }
  }
  if (!key && run?.structure) {
    try {
      const st = await structAt('path:' + run.structure, '/api/file?path=' + enc(run.structure), run.structure)
      key = 'path:' + run.structure; out[key] = st
      note = basename(run.structure) + ' · the structure its run used' + (tried.length ? ' (' + tried.join('; ') + ')' : '')
    } catch (e) { tried.push(basename(run.structure) + ': ' + (e as Error).message) }
  }
  if (!key) note = tried.length ? 'no structure fits: ' + tried.join(' · ') : 'the row has no structure, and no run of this gmx-cypher wrote this file'
  const analysis = fromVault({
    id: 'vault:' + ref.project + '/' + ref.row + '/' + ref.rdf, title: row.name + ' × ' + rdf.column, label: row.name + ' × ' + rdf.column + ' · ' + rdf.slot,
    source: 'vault · ' + p.name + ' · run ' + rdf.slot, curves: rdf.curves.map(c => ({ label: c.label, text: texts.get(c.file)!, xCol: c.xCol, yCol: c.yCol, xScale: c.xScale })),
    record, struct: key, structNote: note,
  })
  return { analysis, structs: out }
}

/**
 * The analyses of the picked jobs and vault RDFs, then those of the files, each loaded once; a running job
 * waits and opens when it ends. Labels are shortened together, as the design does.
 */
export function useAnalyses(refs: SourceRef[], allJobs: Job[], jobsLoaded: boolean, vault: VaultRdfs | null, files: LoadedFile[]) {
  const [done, setDone] = React.useState<Record<string, Result | { error: string }>>({})
  // Only the picked jobs, and only what decides their loading: a running job's progress (an event per frame) changes nothing here.
  const picked = new Set(refs.flatMap(r => (r.kind === 'job' ? [r.id] : [])))
  const jobsKey = allJobs.filter(j => picked.has(j.id)).map(j => j.id + ':' + j.kind + ':' + j.status + ':' + j.title).join('|')
  const jobs = React.useMemo(() => allJobs.filter(j => picked.has(j.id)), [jobsKey]) // eslint-disable-line react-hooks/exhaustive-deps -- the picked jobs are what their key says
  const started = React.useRef(new Set<string>())
  React.useEffect(() => {
    for (const r of refs) {
      const key = refKey(r)
      if (started.current.has(key)) continue
      let p: Promise<Result> | null = null
      if (r.kind === 'job') { const j = jobs.find(x => x.id === r.id); if (j && j.kind === 'rdf' && j.status === 'done') p = loadJob(j) }
      else if (r.kind === 'record') p = loadRecord(r.path)
      else if (vault) p = loadVault(r, vault)
      if (!p) continue
      started.current.add(key)
      p.then(res => setDone(d => ({ ...d, [key]: res })), e => setDone(d => ({ ...d, [key]: { error: (e as Error).message } })))
    }
  }, [refs, jobs, vault])
  const fileSet = React.useMemo(() => (files.length ? fromFiles(files) : { analyses: [], structs: {}, files: [] as FileRow[] }), [files])

  return React.useMemo(() => {
    const items: Item[] = refs.map(r => {
      const key = refKey(r), d = done[key]
      if (r.kind === 'job') {
        const j = jobs.find(x => x.id === r.id), name = j?.title ?? r.id
        if (d) return 'error' in d ? { key, kind: 'job', name, status: 'error', error: d.error } : { key, kind: 'job', name, status: 'ready', analysis: d.analysis }
        if (!j) return { key, kind: 'job', name, status: jobsLoaded ? 'error' : 'loading', error: jobsLoaded ? 'not among this gmx-cypher\'s jobs' : undefined }
        if (j.kind !== 'rdf') return { key, kind: 'job', name, status: 'error', error: 'not an RDF run' }
        if (j.status === 'running') return { key, kind: 'job', name, status: 'waiting', error: 'running… it opens here when it ends' }
        if (j.status !== 'done') return { key, kind: 'job', name, status: 'error', error: j.status + ': no g(r) to show' }
        return { key, kind: 'job', name, status: 'loading' }
      }
      if (r.kind === 'record') {
        const name = basename(r.path).replace(/\.run\.json$/, '')
        if (d) return 'error' in d ? { key, kind: 'record', name, status: 'error', error: d.error } : { key, kind: 'record', name, status: 'ready', analysis: d.analysis }
        return { key, kind: 'record', name, status: 'loading' }
      }
      const name = vault?.projects.find(p => p.id === r.project)?.rows.find(x => x.id === r.row)?.name ?? 'vault RDF'
      if (d) return 'error' in d ? { key, kind: 'vault', name, status: 'error', error: d.error } : { key, kind: 'vault', name, status: 'ready', analysis: d.analysis }
      return { key, kind: 'vault', name, status: 'loading' }
    })
    for (const a of fileSet.analyses) items.push({ key: a.id, kind: 'file', name: a.title, status: 'ready', analysis: a })
    const ready = items.filter(i => i.analysis), labels = shortLabels(ready.map(i => i.analysis!.label))
    ready.forEach((i, k) => { i.analysis = { ...i.analysis!, label: labels[k] } })
    const all: Record<string, Struct> = { ...fileSet.structs }
    for (const d of Object.values(done)) if ('structs' in d) Object.assign(all, d.structs)
    return { items, structs: all, fileRows: fileSet.files }
  }, [refs, done, jobs, jobsLoaded, vault, fileSet])
}
