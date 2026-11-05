// Where a built system's PMFs would land in the connected project (R8b), checked with the Matrix's own code before
// anything is built. Each folder a PMF comes from (the AWH folder, and each walker's folder when the walkers are in
// the build) is turned into the file a send would make: a gmx awh file whose `# Working dir:` header is that folder,
// named by the project's name pattern from the system's own fields. The Matrix's planBatch (through `landing`, as
// Vault → Untracked files → attach runs it) says the row, column and run; parsePath says what the folder pattern
// reads from the folder. Anything that lands elsewhere than the system's cell is a problem, in words.

import { getCols, matchCol, mergeSettings, parseName, parsePath, patternFields, seqKey, SLOTS } from '../../../../matrix/src/lib/seq'
import { safeFileName } from '../../../../matrix/src/lib/storage/path'
import type { Store } from '../../../../matrix/src/lib/types'
import { landing } from '../landing'
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

/** Every folder of one system a PMF would come from, and where the Matrix would put it. */
export function systemLanding(store: Store, plan: BuildPlan, sys: System, base: string | null | undefined): FolderLanding[] {
  const on = (id: string) => !!plan.stages.find(s => s.id === id)?.on
  const folders: { folder: string; what: FolderLanding['what']; n?: number }[] = []
  if (on('awh')) folders.push({ folder: sys.dir + '/' + NAMES.awh, what: 'awh' })
  if (on('walkers')) plan.science.walkers.forEach((_, i) => folders.push({ folder: sys.dir + '/' + NAMES.walkers + '/' + (i + 1), what: 'walker', n: i + 1 }))
  if (!folders.length) return []
  const st = mergeSettings({}, store.settings), cols = getCols(store)
  const fields = new Set([...patternFields(st.pattern), ...(st.pathPattern ? patternFields(st.pathPattern) : [])])
  // The system's cell: the project's row of this group and sequence (the first, if rows of other names share them), its column.
  const row = store.seqs.find(q => same(q.group, sys.method) && q.seq.trim().toUpperCase() === sys.SEQUENCE)
  const col = matchCol(cols, sys.saccharide)
  const have = row && col ? row.runs.filter(r => r.sacch === col.k).map(r => SLOTS.indexOf(r.run) + 1) : []
  const free = SLOTS.findIndex((_, i) => !have.includes(i + 1)) + 1
  return folders.map(({ folder, what, n }) => {
    const workdir = (base ? base.replace(/\/+$/, '') : '') + '/' + folder
    const run = what === 'walker' ? n! : free || 1
    const name = sendName(st.pattern, { group: sys.method, col: col?.label ?? sys.saccharide, name: row?.name ?? sys.SEQUENCE, seq: sys.SEQUENCE, run, temp: String(st.temp) })
    const l = landing(store, name, awhXvg(workdir))
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
    if (what === 'awh' && !free) problems.push('the cell has ' + SLOTS.length + ' runs already: a send replaces run 1')
    problems.push(...l.problems.filter(p => !problems.includes(p)))
    return { folder, what, ...(n ? { n } : {}), name, row: l.row, rowNew: l.rowNew, group: l.group, col: l.col.label, colNew: l.col.isNew, run: l.run, replaces: l.replaces, problems }
  })
}
