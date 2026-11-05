// Values read from an mdp file, as grompp reads them: `key = value`, a `;` starts a comment, and `-` and `_` in a key
// are the same (ref-t is ref_t). Used to check what a stage's mdp sets before anything runs (T231).

import { BASE, STAGES, switches, type BuildPlan, type StageId } from './plan'

/** An mdp key's value as written (the last setting wins, as in grompp), or null when the file doesn't set it. */
export function mdpValue(text: string, key: string): string | null {
  const want = key.toLowerCase().replaceAll('-', '_')
  let out: string | null = null
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*([\w-]+)\s*=\s*(.*)$/.exec(raw.replace(/;.*$/, ''))
    if (m && m[1].toLowerCase().replaceAll('-', '_') === want) out = m[2].trim()
  }
  return out
}

/** The mdp file a stage of a method grompps (as the planner picks it: awh's apart for methods with hmr, T212). */
export function stageMdp(plan: BuildPlan, stage: StageId, method: string): string | null {
  const m = plan.science.mdp, hmr = switches(method).hmr
  return ({ nvt: m.nvt, npt: m.npt, awh: hmr ? m.awhHmr : m.awh, pull: m.pull, walkers: m.walkers } as Partial<Record<StageId, string>>)[stage] ?? null
}

/** The longest time step without hydrogen masses repartitioned, ps: 2 fs with h-bonds constrained. */
export const DT_WITHOUT_HMR = 0.002

/**
 * A method without hmr whose stage grompps an mdp with a longer time step than 2 fs (your pull.mdp and awh_multi.mdp
 * set 4 fs, which the hydrogens hold only with their masses repartitioned): each said, with the file and its dt.
 * `dt` gives an mdp file's dt (by its path under the base folder), or null when it sets none or can't be read.
 */
export function timestepProblems(plan: BuildPlan, methods: string[], dt: (path: string) => number | null): string[] {
  const out: string[] = []
  for (const method of methods) {
    if (switches(method).hmr) continue
    for (const st of plan.stages) {
      const f = st.on ? stageMdp(plan, st.id, method) : null, v = f ? dt(BASE.inputs + '/' + f) : null
      if (f && v != null && v > DT_WITHOUT_HMR)
        out.push(method + '\'s ' + STAGES.find(s => s.id === st.id)!.name + ' grompps inputs/' + f + ' with dt = ' + v + ' ps: without hmr, ' + DT_WITHOUT_HMR + ' ps at most'
          + (st.id === 'awh' ? ' · awh\'s mdp for methods without hmr is set apart in the build plan' : ' · the plan has one ' + STAGES.find(s => s.id === st.id)!.name + ' mdp for every method'))
    }
  }
  return out
}
