// Any command's result as compare shows it (R10): which file is a result's main chart, which group each of its
// curves measures, and which results one graph may draw together: like quantities only.

const base = (p: string) => p.split(/[\\/]/).pop() ?? p

/** The main chart's file among a record's outputs: `<stem>.xvg`; for AWH the last frame written, for WHAM the profile. */
export function mainXvg<O extends { kind: string; path: string }>(outputs: O[], stem: string): string | null {
  const xvgs = outputs.filter(o => /\.xvg$/i.test(o.path)), named = (n: string) => xvgs.find(o => base(o.path) === n)?.path
  const time = (p: string) => Number(/_t(-?\d+(?:\.\d+)?)\.xvg$/.exec(p)?.[1] ?? NaN), frames = xvgs.filter(o => Number.isFinite(time(o.path)))
  return named(stem + '.xvg') ?? named(stem + '_profile.xvg') ?? (frames.length ? frames.reduce((a, b) => (time(b.path) > time(a.path) ? b : a)).path : null)
}

/**
 * The group the i-th curve of a command's main file measures, in the file's column order; null for none (an energy
 * term, gyrate's parts about x, y and z). RDF, distance, mindist and hbond measure the selections against the reference;
 * gmx rms measures its fit group first, then each further group; rmsf and gyrate their one group.
 */
export function curveGroup<G extends { role?: string }>(command: string, groups: G[], i: number): G | null {
  const sels = groups.filter(g => g.role === 'selection')
  if (command === 'rdf' || command === 'distance' || command === 'mindist') return sels[i] ?? null
  if (command === 'hbond' || command === 'hbond-legacy') return i === 0 ? sels[0] ?? null : null
  if (command === 'rms') return groups[i] ?? null
  if (command === 'rmsf' || command === 'gyrate' || command === 'gyrate-legacy') return i === 0 ? groups[0] ?? null : null
  return null
}

/** A label's quantity and unit, as gmx writes them: "RMSD (nm)" → rmsd in nm; "(kJ/mol)" a unit alone; "g(r)" a name alone. */
export function quantityOf(label: string): { name: string; unit: string } {
  const t = label.trim(), m = /^(.*?)(?:^|\s)\(([^()]*)\)$/.exec(t)
  return m ? { name: m[1].trim().toLowerCase(), unit: m[2].trim() } : { name: t.toLowerCase(), unit: '' }
}

/**
 * Why `b` can't join `a` on one graph, in words; null when it can: the same x (quantity and unit), and the same y unit
 * (or, where neither has a unit, the same y).
 */
export function unlike(a: { label: string; xlabel: string; ylabel: string }, b: { label: string; xlabel: string; ylabel: string }): string | null {
  const ax = quantityOf(a.xlabel), bx = quantityOf(b.xlabel), ay = quantityOf(a.ylabel), by = quantityOf(b.ylabel), tail = ': one graph draws only like quantities'
  if (ax.name !== bx.name || ax.unit !== bx.unit) return b.label + "'s x is " + b.xlabel + ', ' + a.label + "'s " + a.xlabel + tail
  if (ay.unit || by.unit ? ay.unit !== by.unit : ay.name !== by.name)
    return ay.unit && by.unit ? b.label + "'s y is in " + by.unit + ', ' + a.label + "'s in " + ay.unit + tail : b.label + "'s y is " + b.ylabel + ', ' + a.label + "'s " + a.ylabel + tail
  return null
}
