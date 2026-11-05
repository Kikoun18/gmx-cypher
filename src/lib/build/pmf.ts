// A built system's PMF (R8c, R8d, question 12): the multiwalker one. Its walkers share one bias, so `gmx awh` on walker
// 1's energy file gives it; set-up runs it in walker 1's folder and writes its frames to `9.multiwalker/1/awh/`. Its
// numbers are the Matrix's own: the file read by parseTable, the PMF transform (+2kT ln r, the tail at zero) by
// transformXY at the run's own temperature, then runStats and wellArea, as a cell of the Matrix computes them.

import { runStats, wellArea } from '../../../../matrix/src/lib/pmf'
import { DEFAULT_TEMP, ENTROPY, parseTable, transformXY } from '../../../../matrix/src/lib/seq'
import { awhFrames, type AwhFrame } from '../awh'
import type { RunRecord } from '../record'
import { mdpValue } from './mdp'
import { NAMES } from './plan'

/** Walker 1's folder, relative to the system's, and its files set-up takes. */
export const PMF_FROM = { folder: NAMES.walkers + '/1', edr: NAMES.walkers + '.edr', tpr: NAMES.walkers + '.tpr', mdout: NAMES.walkers + '_mdout.mdp', out: 'awh' }

/** The temperature an mdp file sets: `ref_t` (or `ref-t`) of its first group, in K; null when it sets none. */
export function refT(mdp: string): number | null {
  const v = mdpValue(mdp, 'ref_t'), t = v ? Number(v.split(/\s+/)[0]) : NaN
  return Number.isFinite(t) && t > 0 ? t : null
}

export interface PmfNumbers {
  /** The well's depth after the transform, kJ/mol, and where it is, nm. */
  min: number; at: number
  /** The area below zero, kJ/mol·nm. */
  area: number
  points: number
}

/** A gmx awh PMF's numbers, as the Matrix computes them for a run at `temp` K; a reason when the file has no curve. */
export function pmfNumbers(xvg: string, temp: number): PmfNumbers | { error: string } {
  const t = parseTable(xvg), x = t.cols[0] ?? [], y = t.cols[1] ?? []
  if (x.length < 4) return { error: 'fewer than four points' }
  const c = transformXY(ENTROPY, x, y, temp || DEFAULT_TEMP).y as number[], s = runStats(c)
  return { min: s.min, at: x[s.at], area: wellArea(x, c), points: x.length }
}

/**
 * The PMF file of a set-up job's record: its last frame (the one a send takes), the first bias at that time. Null
 * when the record is not a finished AWH job of gmx-cypher's with frames.
 */
export function lastFrame(r: Partial<RunRecord>): { name: string; frame: AwhFrame; sha256: string } | null {
  if (r.format !== 'gmx-cypher run' || r.analysis !== 'awh' || r.status !== 'done' || r.complete === false || !r.record || !Array.isArray(r.outputs)) return null
  const stem = r.record.replace(/\.run\.json$/, ''), byName = new Map(r.outputs.filter(o => o.kind === 'xvg').map(o => [o.path.split('/').pop()!, o.sha256]))
  const frames = awhFrames(stem, [...byName.keys()])
  if (!frames.length) return null
  const last = frames[frames.length - 1].time, frame = frames.find(f => f.time === last)!
  return { name: stem + frame.suffix, frame, sha256: byName.get(stem + frame.suffix)! }
}
