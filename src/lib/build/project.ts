// Systems from a connected project (R8a): the methods are the rows' groups, the saccharides the column labels in lower
// case (the Matrix matches columns without case), the sequences the rows' sequences in lower case (the folder
// spelling). "Build what the project lacks" is every cell with no run: a row's group and sequence × a column.

import { cellKey, nameProblem, type Systems } from './plan'

/** What SymBuilder reads of a connected project, as `GET /api/vault/project` sends it. */
export interface ProjectLike {
  name: string
  columns: { k: string; label: string }[]
  rows: { name: string; seq: string; group: string; runs: Record<string, string[]> }[]
  settings: { pattern: string; pathPattern: string }
}

export interface FromProject {
  /** Every group, column and sequence of the project. */
  systems: Systems
  /** Only the cells with no run. */
  lacking: Systems & { only: string[] }
  /** Cells of the project: (group, sequence) pairs × columns. */
  cells: number
  /** What can't be a system, in words. */
  skipped: string[]
}

const once = (xs: string[]) => [...new Set(xs)]

export function systemsFromProject(p: ProjectLike): FromProject {
  const skipped: string[] = []
  const cols = p.columns.filter(c => {
    const why = nameProblem('saccharide', c.label.trim().toLowerCase())
    if (why) skipped.push('column ' + c.label + ': ' + why)
    return !why
  }).map(c => ({ k: c.k, name: c.label.trim().toLowerCase() }))
  // A cell is a group and a sequence: rows of both (named differently) are one cell, with a run if any of them has one.
  const pairs = new Map<string, { method: string; sequence: string; runs: Set<string> }>()
  for (const r of p.rows) {
    const method = r.group.trim(), sequence = r.seq.trim().toLowerCase()
    const why = !sequence ? 'no sequence' : !method ? 'no group, so no method' : nameProblem('sequence', sequence) ?? nameProblem('method', method)
    if (why) { skipped.push('row ' + r.name + ': ' + why); continue }
    const key = cellKey(method, '', sequence), pair = pairs.get(key) ?? { method, sequence, runs: new Set<string>() }
    for (const [k, runs] of Object.entries(r.runs)) if (runs.length) pair.runs.add(k)
    pairs.set(key, pair)
  }
  const list = [...pairs.values()], lacking: { method: string; saccharide: string; sequence: string }[] = []
  for (const q of list) for (const c of cols) if (!q.runs.has(c.k)) lacking.push({ method: q.method, saccharide: c.name, sequence: q.sequence })
  const systems = { methods: once(list.map(q => q.method)), saccharides: once(cols.map(c => c.name)), sequences: once(list.map(q => q.sequence)), repeats: 0 }
  // The lacking lists keep the project's order, so the systems come in the same order as a full build's.
  const used = (k: 'method' | 'saccharide' | 'sequence', xs: string[]) => xs.filter(x => lacking.some(c => c[k] === x))
  return {
    systems,
    lacking: {
      methods: used('method', systems.methods), saccharides: used('saccharide', systems.saccharides), sequences: used('sequence', systems.sequences), repeats: 0,
      only: lacking.map(c => cellKey(c.method, c.saccharide, c.sequence)),
    },
    cells: list.length * cols.length,
    skipped,
  }
}
