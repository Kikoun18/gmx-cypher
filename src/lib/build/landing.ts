// Where a built system's PMFs would land in the connected project (R8b), checked with the Matrix's own code before
// anything is built. Each folder a PMF comes from (the AWH folder, and each walker's folder when the walkers are in
// the build) is turned into the file a send would make: a gmx awh file whose `# Working dir:` header is that folder,
// named by the project's name pattern from the system's own fields. The Matrix's planBatch (through `landing`, as
// Vault → Untracked files → attach runs it) says the row, column and run; parsePath says what the folder pattern
// reads from the folder. Anything that lands elsewhere than the system's cell is a problem, in words.

import { getCols, matchCol, mergeSettings, newColumn, parseName, parsePath, patternFields, seqKey, SLOTS } from '../../../../matrix/src/lib/seq'
import { safeFileName } from '../../../../matrix/src/lib/storage/path'
import type { Run, Seq, Store } from '../../../../matrix/src/lib/types'
import { landing, type Landing } from '../landing'
import { NAMES, type BuildPlan, type System } from './plan'

export interface FolderLanding {
  /** Relative to the base folder. */
  folder: string
  what: 'awh' | 'walker'
  /** The walker's number, from 1. */
  n?: number
  /** The name a send would give the file, from the project's name pattern; {time} is filled when it is sent. */
  name: string
  row: string; rowNew: boolean; group: string
  col: string; colNew: boolean
  run: number
  /** The run is one the project already has: a send would replace it. */
  replaces: boolean
  problems: string[]
}

/**
 * A gmx awh file as `gmx awh` writes it, with only what the Matrix reads: GROMACS's banner (the tool: a PMF), the
 * working folder, and four points (the fewest a PMF the Matrix reads may have).
 */
export function awhXvg(workdir: string): string {
  return [
    '# Created by:', '#                       :-) GROMACS - gmx awh, 2025.4 (-:', '# ', '# Working dir:  ' + workdir, '# Command line:', '#   gmx awh -f ' + NAMES.awh + '.edr -s ' + NAMES.awh + '.tpr',
    '@    title "AWH"', '@    xaxis  label "(nm, deg or lambda state)"', '@    yaxis  label "(kJ/mol)"', '@TYPE xy', '@ s0 legend "PMF"', '    0.3000  0', '    0.3044  0', '    0.3088  0', '    0.3132  0', '',
  ].join('\n')
}

export interface SendFields { group: string; col: string; name: string; seq: string; run: number; temp: string }
/** The project's name pattern filled with a system's fields; {analysis} and {*} are pmf, {time} stays until the send. */
export function sendName(pattern: string, f: SendFields): string {
  const value: Record<string, string> = { ana: 'pmf', group: f.group, col: f.col, name: f.name, seq: f.seq, run: f.run ? String(f.run) : '', temp: f.temp }
  const text = pattern.replace(/\{([^}]*)\}/g, (token, inner: string) => {
    if (inner.trim() === '*') return 'pmf'
    const [field] = patternFields(token)
    return (field && value[field]) || token
  })
  return safeFileName(/\.(xvg|dat|txt)$/i.test(text) ? text : text + '.xvg')
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * The store with one more run: a folder's PMF where `landing` put it, in a new row or column if it made one, so the
 * next folder of the same system is planned after it (review finding 2).
 */
function withRun(s: Store, l: Landing): Store {
  const key = seqKey(l.row, l.seq, l.group), slot = SLOTS[l.run - 1], run = { sacch: l.col.k, run: slot } as Run
  const cols = getCols(s).some(c => c.k === l.col.k) ? getCols(s) : [...getCols(s), { ...newColumn(getCols(s), l.col.label, ''), k: l.col.k }]
  const seqs = s.seqs.some(q => seqKey(q.name, q.seq, q.group) === key)
    ? s.seqs.map(q => (seqKey(q.name, q.seq, q.group) === key ? { ...q, runs: [...q.runs.filter(r => !(r.sacch === l.col.k && r.run === slot)), run] } : q))
    : [...s.seqs, { id: 'planned-' + s.seqs.length, group: l.group, name: l.row, seq: l.seq, desc: '', runs: [run], extras: [], structures: [] } as Seq]
  return { ...s, cols, seqs }
}

/**
 * Every folder of one system a PMF would come from, and where the Matrix would put it: each folder after the ones
 * before it, as if each send were attached before the next, so two PMFs of one system never share a run unsaid.
 */
export function systemLanding(store: Store, plan: BuildPlan, sys: System, base: string | null | undefined): FolderLanding[] {
  const on = (id: string) => !!plan.stages.find(s => s.id === id)?.on
  const folders: { folder: string; what: FolderLanding['what']; n?: number }[] = []
  if (on('awh')) folders.push({ folder: sys.dir + '/' + NAMES.awh, what: 'awh' })
  if (on('walkers')) plan.science.walkers.forEach((_, i) => folders.push({ folder: sys.dir + '/' + NAMES.walkers + '/' + (i + 1), what: 'walker', n: i + 1 }))
  if (!folders.length) return []
  const st = mergeSettings({}, store.settings)
  const fields = new Set([...patternFields(st.pattern), ...(st.pathPattern ? patternFields(st.pathPattern) : [])])
  const label = (f: { what: string; n?: number }) => (f.what === 'awh' ? NAMES.awh : 'walker ' + f.n)
  // The system's row: the one named by its sequence, which a name without {name} lands in, or else the first row of
  // its group and sequence (review finding 7).
  const rowOf = (s: Store) => {
    const rows = s.seqs.filter(q => same(q.group, sys.method) && q.seq.trim().toUpperCase() === sys.SEQUENCE)
    return rows.find(q => same(q.name, sys.SEQUENCE)) ?? rows[0]
  }
  let cur = store
  const taken = new Map<string, string>(), made = new Set<string>()
  return folders.map(f => {
    const { folder, what, n } = f, workdir = (base ? base.replace(/\/+$/, '') : '') + '/' + folder
    const row = rowOf(cur), col = matchCol(getCols(cur), sys.saccharide)
    const have = row && col ? row.runs.filter(r => r.sacch === col.k).map(r => SLOTS.indexOf(r.run) + 1) : []
    const free = SLOTS.findIndex((_, i) => !have.includes(i + 1)) + 1
    const run = what === 'walker' ? n! : free || 1
    const name = sendName(st.pattern, { group: sys.method, col: col?.label ?? sys.saccharide, name: row?.name ?? sys.SEQUENCE, seq: sys.SEQUENCE, run, temp: String(st.temp) })
    const l = landing(cur, name, awhXvg(workdir))
    const byPath = st.pathPattern ? parsePath(workdir, st.pathPattern) : null
    const problems: string[] = []
    if (byPath?.bad?.run) problems.push('the folder pattern reads ' + byPath.bad.run + ' as the {run}, not a run number 1–' + SLOTS.length)
    if (!parseName(name, st.pattern).matched && !byPath?.matched) {
      if (byPath) problems.push('the folder pattern ' + st.pathPattern + ' does not match ' + folder)
    } else {
      if (!same(l.group, sys.method)) problems.push('group ' + (l.group || '(none)') + ', not ' + sys.method)
      if (l.seq.toUpperCase() !== sys.SEQUENCE) problems.push('sequence ' + (l.seq || '(none)') + ', not ' + sys.SEQUENCE)
      else if (row && seqKey(l.row, l.seq, l.group) !== seqKey(row.name, row.seq, row.group))
        problems.push('a new row ' + l.row + ': the project\'s row for ' + sys.SEQUENCE + ' in ' + row.group + ' is ' + row.name + ' · add {name} to the name pattern beside {seq}, or rename the row to its sequence')
      if (col ? l.col.k !== col.k : !same(l.col.label, sys.saccharide)) problems.push('column ' + l.col.label + ', not ' + (col?.label ?? sys.saccharide))
      // A run is expected only where a pattern carries one, and only in the system's cell; past the tenth walker,
      // the Matrix's own conflict says it.
      if (!problems.length && fields.has('run') && run <= SLOTS.length && l.run !== run) problems.push('run ' + l.run + ', not ' + run)
    }
    if (!free && (what === 'awh' || !fields.has('run'))) problems.push('the cell has ' + SLOTS.length + ' runs already: a send replaces run ' + l.run)
    const cell = seqKey(l.row, l.seq, l.group) + '#' + l.col.k + '#' + l.run, mine = taken.get(cell)
    if (mine) problems.push('run ' + l.run + ' is also ' + mine + '\'s: one PMF would replace the other')
    problems.push(...l.problems.filter(p => !problems.includes(p)))
    const rowKey = seqKey(l.row, l.seq, l.group), rowNew = l.rowNew || made.has('row ' + rowKey), colNew = l.col.isNew || made.has('col ' + l.col.k)
    if (l.rowNew) made.add('row ' + rowKey)
    if (l.col.isNew) made.add('col ' + l.col.k)
    taken.set(cell, label(f))
    cur = withRun(cur, l)
    return { folder, what, ...(n ? { n } : {}), name, row: l.row, rowNew, group: l.group, col: l.col.label, colNew, run: l.run, replaces: l.replaces && !mine, problems }
  })
}
