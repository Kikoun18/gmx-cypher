// Where a built system's PMF would land in the connected project (R8b), checked with the Matrix's own code before
// anything is built. The PMF is the multiwalker one (question 12): the walkers share one bias (awh-share-multisim), so
// `gmx awh` on walker 1's energy file gives it, run in walker 1's folder as set-up runs it (7.awh is prepared, not
// run). That folder is turned into the file a send would make: a gmx awh file whose `# Working dir:` header is the
// folder, named by the project's name pattern from the system's own fields. The Matrix's planBatch (through `landing`,
// as Vault → Untracked files → attach runs it) says the row, column and run; parsePath says what the folder pattern
// reads from the folder. Anything that lands elsewhere than the system's cell is a problem, in words.

import { getCols, matchCol, mergeSettings, parseName, parsePath, patternFields, seqKey, SLOTS } from '../../../../matrix/src/lib/seq'
import { safeFileName } from '../../../../matrix/src/lib/storage/path'
import type { Store } from '../../../../matrix/src/lib/types'
import { landing } from '../landing'
import { NAMES, type BuildPlan, type System } from './plan'

export interface PmfLanding {
  /** The folder `gmx awh` runs in, walker 1's, relative to the base folder. */
  folder: string
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
    '# Created by:', '#                       :-) GROMACS - gmx awh, 2025.4 (-:', '# ', '# Working dir:  ' + workdir, '# Command line:', '#   gmx awh -f ' + NAMES.walkers + '.edr -s ' + NAMES.walkers + '.tpr',
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

/** The folder a system's PMF comes from: walker 1's, where set-up runs `gmx awh` on its energy file. */
export const pmfFolder = (dir: string) => dir + '/' + NAMES.walkers + '/1'

/**
 * Where the Matrix would put a system's PMF, or null when the build has neither the pull nor the walkers (no PMF
 * follows from it; the walkers come from the pull, prepared in this build or by go on).
 */
export function systemLanding(store: Store, plan: BuildPlan, sys: System, base: string | null | undefined): PmfLanding | null {
  if (!plan.stages.some(s => (s.id === 'pull' || s.id === 'walkers') && s.on)) return null
  const folder = pmfFolder(sys.dir), workdir = (base ? base.replace(/\/+$/, '') : '') + '/' + folder
  const st = mergeSettings({}, store.settings)
  const fields = new Set([...patternFields(st.pattern), ...(st.pathPattern ? patternFields(st.pathPattern) : [])])
  // The system's row: the one named by its sequence, which a name without {name} lands in, or else the first row of
  // its group and sequence (review finding 7).
  const rows = store.seqs.filter(q => same(q.group, sys.method) && q.seq.trim().toUpperCase() === sys.SEQUENCE)
  const row = rows.find(q => same(q.name, sys.SEQUENCE)) ?? rows[0], col = matchCol(getCols(store), sys.saccharide)
  const have = row && col ? row.runs.filter(r => r.sacch === col.k).map(r => SLOTS.indexOf(r.run) + 1) : []
  const free = SLOTS.findIndex((_, i) => !have.includes(i + 1)) + 1
  // A folder pattern with {run} reads walker 1's folder as run 1; otherwise the PMF takes the cell's next free run.
  const byPath = st.pathPattern ? parsePath(workdir, st.pathPattern) : null
  const read = byPath?.fields.run ? SLOTS.indexOf(byPath.fields.run as (typeof SLOTS)[number]) + 1 : 0
  const run = read || free || 1
  const name = sendName(st.pattern, { group: sys.method, col: col?.label ?? sys.saccharide, name: row?.name ?? sys.SEQUENCE, seq: sys.SEQUENCE, run, temp: String(st.temp) })
  const l = landing(store, name, awhXvg(workdir))
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
    // A run is expected only where a pattern carries one, and only in the system's cell.
    if (!problems.length && fields.has('run') && l.run !== run) problems.push('run ' + l.run + ', not ' + run)
  }
  if (!free && !read) problems.push('the cell has ' + SLOTS.length + ' runs already: a send replaces run ' + l.run)
  problems.push(...l.problems.filter(p => !problems.includes(p)))
  return { folder, name, row: l.row, rowNew: l.rowNew, group: l.group, col: l.col.label, colNew: l.col.isNew, run: l.run, replaces: l.replaces, problems }
}
