// The lines compare draws on a structure (R10d), measured at the structure file's positions: gmx distance's centres
// (of geometry: a structure file has no masses) or pairs, gmx mindist's closest two atoms. Each line hangs on the end
// that is drawn (solvent and ions are hidden), with the vector to its other end across the box edges.

import { kit, type Struct } from '../core/index'
import type { Line } from '../core/kit'

const mean = (y: number[]) => { const v = y.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
/** Pairs drawn at most, as H-bond pairs (question 23). */
const MAX_PAIRS = 200

/**
 * One line per group measured against the reference, in the file's column order; gmx's average beside it: the one gmx
 * printed (`averages`, gmx distance), else the mean of the group's curve (gmx mindist's minimum distance over time).
 */
export function measureLines(command: string, measure: string | null | undefined, ref: { atoms: number[] } | null, sels: { name: string; atoms: number[]; y: number[] }[], s: Struct, averages: (number | null | undefined)[] = []): Line[] {
  if (!ref?.atoms.length || (command !== 'distance' && command !== 'mindist')) return []
  const index = new Map(s.nr.map((nr, i) => [nr, i]))
  const mic = (d: number, k: number) => (s.box[k] > 0 ? d - s.box[k] * Math.round(d / s.box[k]) : d)
  const pos = (nr: number) => { const i = index.get(nr)!; return [s.xyz[3 * i], s.xyz[3 * i + 1], s.xyz[3 * i + 2]] }
  const vec = (a: number[], b: number[]) => [0, 1, 2].map(k => mic(b[k] - a[k], k)) as [number, number, number]
  /**
   * A centre of geometry as gmx distance takes it: molecules whole (its -rmpbc; a structure file from mdrun has them so),
   * then the plain mean, no atom moved across the box edges; only the distance between two centres crosses them.
   * Checked: gmx distance's own value at nvt.gro's frame, to its three decimals.
   */
  const centre = (nrs: number[]) => [0, 1, 2].map(k => nrs.reduce((t, nr) => t + pos(nr)[k], 0) / nrs.length)
  const hidden = (nrs: number[]) => nrs.every(nr => kit.SOLV.has(String(s.resn[index.get(nr)!]).toUpperCase()))
  const seg = (a: number[], b: number[], v: [number, number, number]) => (hidden(a) && !hidden(b) ? { at: b, v: v.map(x => -x) as [number, number, number] } : { at: a, v })
  const A = ref.atoms.filter(nr => index.has(nr))
  return sels.flatMap((g, i): Line[] => {
    const B = g.atoms.filter(nr => index.has(nr)), gmx = averages[i] ?? mean(g.y)
    if (!A.length || !B.length) return []
    if (command === 'mindist') {
      // Every pair, a coordinate at a time: most are dropped on their first axis once a short one is known.
      let best = Infinity, pa = 0, pb = 0
      const pa3 = A.map(pos), pb3 = B.map(pos)
      for (let x = 0; x < A.length; x++) for (let y = 0; y < B.length; y++) {
        const dx = mic(pb3[y][0] - pa3[x][0], 0); if (Math.abs(dx) >= best) continue
        const dy = mic(pb3[y][1] - pa3[x][1], 1); if (Math.abs(dy) >= best) continue
        const d = Math.hypot(dx, dy, mic(pb3[y][2] - pa3[x][2], 2))
        if (d < best) { best = d; pa = x; pb = y }
      }
      return [{ group: g.name, kind: 'closest', segs: [seg([A[pa]], [B[pb]], vec(pa3[pa], pb3[pb]))], here: best, gmx }]
    }
    if (measure === 'pairs') {
      const n = Math.min(A.length, B.length), vs = A.slice(0, n).map((a, k) => vec(pos(a), pos(B[k])))
      return [{ group: g.name, kind: 'pairs', segs: vs.slice(0, MAX_PAIRS).map((v, k) => seg([A[k]], [B[k]], v)), here: vs.reduce((t, v) => t + Math.hypot(...v), 0) / n, gmx, ...(n > MAX_PAIRS ? { total: n } : {}) }]
    }
    const v = vec(centre(A), centre(B))
    return [{ group: g.name, kind: measure === 'cog' ? 'cog' : 'com', segs: [seg(A, B, v)], here: Math.hypot(...v), gmx }]
  })
}
