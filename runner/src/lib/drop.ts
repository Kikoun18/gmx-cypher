// A drop, anywhere on the page, split by what each file is (R9a): a run's inputs go to set-up, results to compare.
// A structure or an index dropped with results goes with them, since compare reads them to draw the groups. Inputs
// inside a dropped folder are not uploaded: a simulation's folder can hold gigabytes, better picked where it is.

import { inputRole } from './inputs'

export interface Routed { inputs: string[]; compare: string[]; left: { name: string; why: string }[] }

const base = (p: string) => p.split(/[\\/]/).pop() ?? p

/** Where each dropped file goes, by its name; the names are kept as given (a dropped folder's paths). */
export function routeDrop(names: string[]): Routed {
  const out: Routed = { inputs: [], compare: [], left: [] }
  const result = (n: string) => /\.xvg$|\.run\.json$/i.test(base(n))
  const withResults = names.some(result)
  for (const n of names) {
    const b = base(n), role = b.startsWith('.') ? null : inputRole(b)
    if (result(n)) out.compare.push(n)
    else if (withResults && (role === 'structure' || role === 'index')) out.compare.push(n)
    else if (!role || role === 'output') out.left.push({ name: n, why: 'not a file gmx-cypher reads' })
    else if (/[\\/]/.test(n)) out.left.push({ name: n, why: 'in a dropped folder: pick it by its path in inputs' })
    else out.inputs.push(n)
  }
  return out
}

const list = (l: string[]) => (l.length > 3 ? l.slice(0, 3).join(', ') + ' and ' + (l.length - 3) + ' more' : l.join(', '))
const files = (n: number) => n + (n === 1 ? ' file' : ' files')

/** Where each file went, in words, for the page to say. */
export function dropSummary(r: Routed): string {
  const parts = [
    ...(r.inputs.length ? [files(r.inputs.length) + ' to inputs: ' + list(r.inputs.map(base))] : []),
    ...(r.compare.length ? [files(r.compare.length) + ' to compare: ' + list(r.compare.map(base))] : []),
    ...(r.left.length ? ['not read: ' + list(r.left.map(l => base(l.name))) + ' (' + [...new Set(r.left.map(l => l.why))].join('; ') + ')'] : []),
  ]
  return parts.join(' · ') || 'nothing to read in this drop'
}

/** A drop's files, each with its path inside the drop; a dropped folder is walked, its hidden files and folders left out. */
export async function dropEntries(dt: DataTransfer): Promise<{ path: string; file: File }[]> {
  const walk = (e: FileSystemEntry, prefix: string): Promise<{ path: string; file: File }[]> => new Promise(resolve => {
    if (prefix && e.name.startsWith('.')) return resolve([])
    if (e.isFile) { (e as FileSystemFileEntry).file(f => resolve([{ path: prefix + e.name, file: f }]), () => resolve([])); return }
    if (!e.isDirectory) return resolve([])
    const reader = (e as FileSystemDirectoryEntry).createReader(), kids: FileSystemEntry[] = []
    const next = () => reader.readEntries(ents => { if (ents.length) { kids.push(...ents); next(); return } Promise.all(kids.map(k => walk(k, prefix + e.name + '/'))).then(p => resolve(p.flat())) }, () => resolve([]))
    next()
  })
  // The entries are taken before anything is awaited: the drop's data is gone once its event ends.
  const ents = Array.from(dt.items || []).map(it => it.webkitGetAsEntry()).filter((e): e is FileSystemEntry => !!e)
  const files = Array.from(dt.files)
  return ents.length ? (await Promise.all(ents.map(e => walk(e, '')))).flat() : files.map(f => ({ path: f.name, file: f }))
}
