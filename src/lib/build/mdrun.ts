// mdrun's own progress with -v (sample 6, T232), as your notebook's run_live reads it: the output split at \r as well
// as \n (mdrun rewrites its progress line in place), the total from "125000 steps,  125.0 ps." or a minimisation's
// "Number of steps = 5000", each step from "step 45600, remaining wall clock time: 17 s" (or the lone "step 0") or a
// minimisation's "Step=  42, Dmax= …, Epot= …, Fmax= …, atom= …". GROMACS prints "step N, will finish <date>" instead
// when 300 s or more remain; its step is read, its date said as printed. "step 19900: timed with pme grid …" is PME
// tuning, not progress.

export interface MdrunHead { kind: 'md' | 'em'; total: number; tolerance?: number }
export interface MdrunProgress extends MdrunHead {
  step: number
  /** Seconds left, or the time mdrun says it will finish, as it prints them. */
  left?: number; finish?: string
  /** A minimisation's largest force at its last step, kJ/mol/nm. */
  fmax?: number
  /** The step it ended at: converged, stopped, or every step done. */
  done?: { steps: number; how: string }
}

const segments = (text: string) => text.split(/\r\n|\r|\n/)

/** What mdrun says first: its number of steps (and a minimisation's tolerance); null before it is printed. */
export function mdrunHead(text: string): MdrunHead | null {
  let tolerance: number | undefined
  for (const l of segments(text)) {
    const t = /^\s*Tolerance \(Fmax\)\s*=\s*(\S+)/.exec(l)
    if (t) tolerance = Number(t[1])
    const em = /^\s*Number of steps\s*=\s*(\d+)/.exec(l)
    if (em) return { kind: 'em', total: Number(em[1]), ...(tolerance != null ? { tolerance } : {}) }
    const md = /^\s*(\d+)\s+steps,/.exec(l)
    if (md) return { kind: 'md', total: Number(md[1]) }
  }
  return null
}

/**
 * mdrun's progress from its output (any tail of it), with its head when the tail no longer holds it; null until a step
 * is printed and the total is known.
 */
export function mdrunProgress(text: string, known: MdrunHead | null = null): MdrunProgress | null {
  const head = mdrunHead(text) ?? known
  if (!head) return null
  let out: MdrunProgress | null = null
  for (const l of segments(text)) {
    const em = /^Step=\s*(\d+),.*\bFmax=\s*(\S+?),/.exec(l)
    if (em) { out = { ...head, step: Number(em[1]), fmax: Number(em[2]) }; continue }
    const md = /(?:^|\s)step (\d+)(?:, remaining wall clock time:\s*(\d+) s|, will finish (.+?)|)\s*$/.exec(l)
    if (md) { out = { ...head, step: Number(md[1]), ...(md[2] != null ? { left: Number(md[2]) } : {}), ...(md[3] ? { finish: md[3] } : {}) }; continue }
    const conv = /^(Steepest Descents|Polak-Ribiere Conjugate Gradients|Low-Memory BFGS Minimizer) (converged to (?:Fmax < \S+|machine precision)|did not converge to Fmax < \S+) in (\d+) steps/.exec(l)
    if (conv && out) out = { ...out, done: { steps: Number(conv[3]), how: conv[2] } }
    if (/^Writing final coordinates\./.test(l) && out) out = { ...out, step: head.total, done: { steps: head.total, how: 'every step done' } }
  }
  return out
}

/** Output as a terminal shows it: each line as its last \r rewrite left it. */
export function screenText(text: string): string {
  return text.split('\n').map(l => { const parts = l.split('\r').filter(p => p.trim()); return parts.length ? parts[parts.length - 1] : '' }).join('\n')
}
