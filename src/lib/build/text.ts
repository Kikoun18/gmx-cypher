// The texts a build computes or rewrites (R3b), each a port of the notebook's function of the same job, kept pure so
// the golden tests compare them with the notebook's own output.

import { switches, type Science, type System } from './plan'

/**
 * Ions for prosECCo75's scaled charges (neutralizing_counts): salt pairs from the water count, then enough ions of
 * ±ionCharge to cancel the net charge; genion -neutral would assume ±1. `residual` is what is left.
 */
export function ionCounts(net: number, waters: number, sc: Pick<Science, 'ionCharge' | 'salt' | 'waterMolarity'>) {
  const salt = waters ? Math.round(sc.salt * waters / sc.waterMolarity) : 0
  const d = sc.ionCharge ? Math.round(net / sc.ionCharge) : 0
  const negative = salt + Math.max(0, d), positive = salt + Math.max(0, -d)
  return { positive, negative, salt, residual: net + sc.ionCharge * (positive - negative) }
}

/** grompp's "System has non-zero total charge: X" (parse_net_charge); 0 when it says nothing. */
export function netCharge(log: string): number {
  const m = /non-zero total charge:\s*([-\d.]+)/.exec(log)
  return m ? Number(m[1]) : 0
}

/** Water molecules in a topology's [ molecules ] (count_water): SOL and TIP3F lines. */
export function waters(top: string): number {
  const lines = top.split('\n'), start = lines.findIndex(l => l.trim().toLowerCase().startsWith('[ molecules'))
  if (start < 0) return 0
  let n = 0
  for (const l of lines.slice(start + 1)) { const p = l.split(';')[0].trim().split(/\s+/); if (p.length >= 2 && (p[0] === 'SOL' || p[0] === 'TIP3F') && /^\d+$/.test(p[1])) n += Number(p[1]) }
  return n
}

/** The fast methods' water renamed around grompp and genion, line by line as the notebook's sed does. */
export const renameWater = (top: string, to: 'TIP3F' | 'SOL') => (to === 'TIP3F' ? top.replace(/^SOL\s/gm, 'TIP3F ') : top.replace(/^TIP3F\s/gm, 'SOL   '))

/**
 * The [ moleculetype ] part of pdb2gmx's topology (extract_moleculetypes): up to [ system ], before the water include.
 * pdb2gmx runs in ff/ and writes its includes as it was given them, from there (`-i ../solutions/…/{q}_restraints.itp`).
 * GROMACS reads an include from the folder of the file it is in, and this .itp is in the system's folder `dir`, not
 * in ff/ as the notebook's is, so an include of a file in that folder becomes `./{file}` (T233).
 */
export function moleculetype(top: string, dir?: string): string {
  const out: string[] = []
  for (const line of top.split('\n')) {
    if (!out.length && !line.includes('[ moleculetype ]')) continue
    out.push(line)
    if (line.includes('[ system ]')) break
  }
  out.pop()
  const w = out.findIndex(l => l.includes('; Include water topology'))
  if (w >= 0) out.splice(w)
  return out.length ? (dir ? ownIncludes(out.join('\n'), dir) : out.join('\n')) + '\n' : ''
}

/**
 * An include written from ff/ of a file in the system's folder `dir` (`../{dir}/{file}`), as `./{file}`: read from a
 * file in that folder, as GROMACS reads includes (T233). Every other line as it is.
 */
export function ownIncludes(text: string, dir: string): string {
  const from = '../' + dir.replace(/\/+$/, '') + '/'
  return text.split('\n').map(l => {
    const m = /^(\s*#include\s+")([^"]+)(".*)$/.exec(l)
    return m && m[2].startsWith(from) && !m[2].slice(from.length).includes('/') ? m[1] + './' + m[2].slice(from.length) + m[3] : l
  }).join('\n')
}

const pad5 = (n: number) => String(n).padStart(5)
/**
 * The saccharide and the peptide in one box (merge_gro_files): the saccharide's atoms first, so [ CARB ] is atoms
 * 1…n; atoms renumbered from 1; a residue keeps its number below 1000, after that it counts on.
 */
export function mergeGro(peptide: string, saccharide: string, box: number): string {
  const atoms = (text: string) => { const l = text.split('\n'); const n = Number(l[1].trim()); return l.slice(2, 2 + n) }
  const carb = atoms(saccharide), prot = atoms(peptide)
  let last = -1, residue = 1
  const lines = [...carb, ...prot].map((line, i) => {
    const num = Number(line.slice(0, 5).trim())
    if (num !== last) { residue = num < 1000 ? num : residue + 1; last = num }
    return pad5(residue) + line.slice(5, 10) + line.slice(10, 15) + pad5(i + 1) + line.slice(20)
  })
  const b = box.toFixed(5)
  return 'Combined structure - Carbohydrate + Protein\n' + (carb.length + prot.length) + '\n' + lines.join('\n') + '\n' + b + '   ' + b + '   ' + b + '\n'
}

/** The [ CARB ] group appended to make_ndx's index (build_index): atoms 1…n, fifteen to a line. */
export function carbGroup(n: number): string {
  const rows: string[] = []
  for (let i = 1; i <= n; i += 15) rows.push(Array.from({ length: Math.min(15, n - i + 1) }, (_, k) => i + k).join(' '))
  return '\n[ CARB ]\n' + rows.join('\n') + '\n'
}

/**
 * The system's topology (write_topology). The peptide's moleculetype is the system's own `{sequence}.itp` (T205),
 * where the notebook includes a shared `ff/{sequence}.itp`.
 */
export function topologyText(sys: System, sc: Pick<Science, 'forcefield'>): string {
  const water = switches(sys.method).fast ? 'TIP3PF/TIP3PF_orig.itp' : sc.forcefield + '.ff/tip3p.itp'
  return [
    '; Include topology for ions',
    '#include "../../../../ff/' + sc.forcefield + '.ff/forcefield.itp"',
    '#include "../../../../ff/ADDff.itp"                                       ;ADD',
    '#include "../../../../ff/ions/iontypes.itp"                               ;prosECCo75 ions',
    '#include "../../../../ff/ions/ions.itp"',
    '#include "../../../../ff/' + water + '"                                ; fast and slow water',
    '#include "../../../../ff/' + sys.saccharide + '-ADD.itp"',
    '#include "' + sys.sequence + '.itp"',
    '',
    '[ system ]',
    '; Name',
    sys.saccharide + ' with ' + sys.sequence + ' system',
    '',
    '[ molecules ]',
    '; Compound        #mols',
    'CARB               1',
    'Protein\t\t       1',
    '',
  ].join('\n')
}

/**
 * The topology after gromologist's hydrogen-mass split (run_gromologist): the peptide and the saccharide from the
 * system's own Protein.itp and CARB.itp (T205), and the fast methods' water from TIP3PF_HMR.
 */
export function hmrTopology(top: string, sys: System): string {
  let t = top.replace('#include "' + sys.sequence + '.itp"', '#include "Protein.itp"').replace('#include "../../../../ff/' + sys.saccharide + '-ADD.itp"', '#include "CARB.itp"')
  if (switches(sys.method).fast) t = t.replace('#include "../../../../ff/TIP3PF/TIP3PF_orig.itp"', '#include "../../../../ff/TIP3PF/TIP3PF_HMR.itp"')
  return t
}

/** A pull's pullx.xvg (parse_pullx): time (ps) and the COM distance (nm), the first two columns. */
export function pullx(text: string): { times: number[]; dists: number[] } {
  const times: number[] = [], dists: number[] = []
  for (const raw of text.split('\n')) {
    const l = raw.trim()
    if (!l || l[0] === '#' || l[0] === '@') continue
    const p = l.split(/\s+/)
    if (p.length < 2) continue
    const t = Number(p[0]), d = Number(p[1])
    if (Number.isFinite(t) && Number.isFinite(d)) { times.push(t); dists.push(d) }
  }
  return { times, dists }
}

/**
 * Each walker's start (multiwalker): the pull's frame nearest its target distance, the first of equals. `off` is how
 * far that frame is from the target; above 0.10 nm the notebook warns, and so does the build.
 */
export function walkerFrames(pull: { times: number[]; dists: number[] }, targets: number[]) {
  return targets.map((target, k) => {
    let j = 0
    for (let i = 1; i < pull.dists.length; i++) if (Math.abs(pull.dists[i] - target) < Math.abs(pull.dists[j] - target)) j = i
    const off = Math.abs(pull.dists[j] - target)
    return { walker: k + 1, target, time: pull.times[j], distance: pull.dists[j], off, far: off > 0.10 }
  })
}

/** The working walker nearest a failed one by target distance (retry_failed_walkers), or null when none worked. */
export function nearestWalker(failed: number, working: number[], targets: number[]): number | null {
  if (!working.length) return null
  return working.reduce((best, k) => (Math.abs(targets[k - 1] - targets[failed - 1]) < Math.abs(targets[best - 1] - targets[failed - 1]) ? k : best))
}
