// Failures, retries, repeats and resume (R6), the parts that decide: the notebook's hint for the pull's box errors,
// on the real text (its own pattern misses the AWH one, "0.49 times the box size"); the name a failed folder is moved
// to (quarantine, its stamp); where a build resumes in a folder an earlier gmx-cypher build made; a repeat's name.

import { repeatName } from './plan'
import type { Step } from './steps'

/** The hint for a pull group farther apart, or wider, than the box allows; null for any other error. */
export function hint(text: string): string | null {
  if (/larger than 0\.49 times\s+the box size/.test(text)) return 'the pull groups are farther apart than 0.49 times the box: set pull-pbc-ref-prev-step-com = yes (or a pull group\'s pbcatom) in the mdp, or grow the box'
  if (/0\.5 times half the box size[\s\S]*?pbcatom/.test(text)) return 'a pull group is wider than half the box: choose a central atom as its pbcatom (pull-group1-pbcatom), or set pull-pbc-ref-prev-step-com = yes, in the mdp, or grow the box'
  return null
}

const two = (n: number) => String(n).padStart(2, '0')
/** The notebook's stamp, local time: 20260925_221403. */
export const stamp = (d: Date) => d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '_' + two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds())
/** A failed folder's new name in failed/: the system's sequence, or a walker's number, and the stamp. */
export const quarantineName = (name: string, d: Date) => name + '_' + stamp(d)

/**
 * Where a build resumes in a folder an earlier build made (continue): the first step the record does not have as done,
 * or one of whose outputs is gone (`gone`: a file the record has, no longer there; a file a later step renamed is
 * not in the record). All done: steps.length.
 */
export function resumeAt(steps: Step[], done: { i: number; label: string; status: string }[], gone: (path: string) => boolean): number {
  const ok = new Set(done.filter(s => s.status === 'done').map(s => s.i + ' ' + s.label))
  const i = steps.findIndex((s, k) => !ok.has(k + ' ' + s.label) || s.writes.some(p => !p.startsWith('scripts/') && gone(p)))
  return i < 0 ? steps.length : i
}

/** The first repeat of a method whose folder is free (repeat): hmr+fast+6r, then hmr+fast+6r1, … */
export function freeRepeat(method: string, taken: (method: string) => boolean): string {
  for (let k = 1; ; k++) { const m = repeatName(method, k); if (!taken(m)) return m }
}
