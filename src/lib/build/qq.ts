// The qq scripts of the heavy stages (R7a's text, planned in R3b): render_qq_script's layout, the notebook's three
// profiles, and its mdrun lines, with the differences decided in T213: min, nvt and npt get their own -deffnm (the
// notebook wrote 7.awh's line into all three), the pull is resubmitted like awh, and LUMI asks for the cores its
// -ntomp uses.

import type { StageId, System } from './plan'

export interface Profile {
  id: 'mc2025' | 'mc2022' | 'lumi'; name: string; gmx: 'gmx_mpi' | 'gmx'; modules: string
  /**
   * mdrun's flags before -deffnm (after -multidir in the walkers' script); `multidir`: the notebook wrote this profile
   * for the walkers (LUMI), though every profile runs them with -multidir, which needs an MPI gmx.
   */
  flags: string; dlb: boolean; multidir: boolean
  /** Cores and GPUs per walker in the walkers' script, per job otherwise. */
  ncpus: number; ngpus: number; mem: string; walltime: string; loopEnd: number; maxh: number; props?: string
}
export const PROFILES: Profile[] = [
  { id: 'mc2025', name: 'MetaCentrum · GROMACS 2025.4 cuda', gmx: 'gmx_mpi', modules: 'export OMP_NUM_THREADS=8\n\nmetamodule add gromacs/2025.4-cuda', flags: '-ntomp 8 -update gpu -nb gpu -pme gpu -bonded gpu', dlb: true, multidir: false, ncpus: 8, ngpus: 1, mem: '30gb', walltime: '23h', loopEnd: 10, maxh: 22, props: 'cl_zero' },
  { id: 'mc2022', name: 'MetaCentrum · GROMACS 2022.3 plumed', gmx: 'gmx', modules: 'module add gromacs:2022.3-plumed', flags: '', dlb: false, multidir: false, ncpus: 8, ngpus: 1, mem: '30gb', walltime: '23h', loopEnd: 10, maxh: 22, props: 'cl_zero' },
  { id: 'lumi', name: 'LUMI · multidir', gmx: 'gmx_mpi', modules: 'export OMP_NUM_THREADS=8\n\nmodule load LUMI/24.03 partition/G\nmodule load GROMACS', flags: '-ntomp 7 -update gpu -nb gpu -bonded gpu', dlb: true, multidir: true, ncpus: 7, ngpus: 1, mem: '60gb', walltime: '23h', loopEnd: 10, maxh: 22 },
]

export type ProfileId = Profile['id']
export type ScriptedStage = 'min' | 'nvt' | 'npt' | 'awh' | 'pull' | 'walkers'
export const SCRIPTED_STAGES: ScriptedStage[] = ['min', 'nvt', 'npt', 'awh', 'pull', 'walkers']
/** Each stage's profile as the notebook writes it (R7a): MetaCentrum's GROMACS 2025.4, the walkers on LUMI. */
export const DEFAULT_PROFILES: Record<ScriptedStage, ProfileId> = { min: 'mc2025', nvt: 'mc2025', npt: 'mc2025', awh: 'mc2025', pull: 'mc2025', walkers: 'lumi' }
export const profileOf = (id: string) => PROFILES.find(p => p.id === id)
/** Why a profile can't write a stage's script, in words; null when it can. The walkers share one bias with -multidir, which needs an MPI gmx. */
export function profileProblem(stage: ScriptedStage, id: string): string | null {
  const p = profileOf(id)
  if (!p) return 'no qq profile ' + JSON.stringify(id) + ': ' + PROFILES.map(x => x.id).join(', ')
  if (stage === 'walkers' && p.gmx !== 'gmx_mpi') return 'the walkers run together with mdrun -multidir, which needs an MPI gmx (gmx_mpi): ' + p.name + ' has ' + p.gmx
  return null
}

/** The stages that get a qq script, their folder in scripts/ (the notebook's names) and their mdrun -deffnm. */
export const SCRIPTED: Partial<Record<StageId, { folder: string; deffnm: string; px?: [string, string] }>> = {
  min: { folder: 'minim', deffnm: '4.minim' }, nvt: { folder: 'nvt', deffnm: '5.eqnvt' }, npt: { folder: 'npt', deffnm: '6.eqnpt' },
  awh: { folder: 'awh', deffnm: '7.awh', px: ['7.awh_pullx.xvg', '7.awh_pullf.xvg'] },
  pull: { folder: 'pull', deffnm: '8.pull', px: ['pullx.xvg', 'pullf.xvg'] },
  walkers: { folder: 'awh_multi', deffnm: '9.multiwalker', px: ['9.multiwalker_pullx.xvg', '9.multiwalker_pullf.xvg'] },
}

/** render_qq_script: the header, the modules, the mdrun line and the resubmit block, as the notebook lays them out. */
export function renderQq(o: { jobType?: string; props?: string; ncpus: number; ngpus: number; mem: string; walltime: string; loopEnd: number; modules: string; mdrun: string; resubmit: string }): string {
  const head = ['#!/usr/bin/env -S qq run', '']
  if (o.jobType) head.push('# qq job-type ' + o.jobType, '')
  if (o.props) head.push('# qq props ' + o.props, '')
  head.push('# qq ncpus ' + o.ncpus, '# qq ngpus ' + o.ngpus, '# qq mem ' + o.mem, '', '# qq walltime ' + o.walltime, '# qq loop-end ' + o.loopEnd)
  return head.join('\n') + '\n\n\n' + o.modules + '\n\n' + o.mdrun + '\n\n\n' + o.resubmit + '\n'
}

const until = (files: string[]) => 'if ' + files.map(f => '[ -f "' + f + '" ]').join(' && ') + '; then\n    exit "${QQ_NO_RESUBMIT}"\nfi\n\nexit 0'

/** A stage's qq script: its file in scripts/, the text, and the line that submits it from the step folder. */
export function qqScript(stage: StageId, sys: System, p: Profile, walkers = 8): { file: string; text: string; submit: string } | null {
  const s = SCRIPTED[stage]
  if (!s) return null
  const dirs = Array.from({ length: walkers }, (_, i) => String(i + 1))
  // The walkers share one bias, so they always run together with -multidir (review finding 6); an MPI gmx is needed.
  const multi = stage === 'walkers'
  const mdrun = [p.gmx, 'mdrun', ...(multi ? ['-multidir', ...dirs] : []), ...(p.flags ? [p.flags] : []), '-deffnm', s.deffnm, '-cpi', s.deffnm + '.cpt', ...(p.dlb ? ['-dlb', 'yes'] : []),
    ...(s.px ? ['-px', s.px[0], '-pf', s.px[1]] : []), '-v', '-quiet', '-maxh', String(p.maxh)].join(' ')
  const gro = stage === 'walkers' ? dirs.map(d => d + '/' + s.deffnm + '.gro') : [s.deffnm + '.gro']
  const n = multi ? walkers : 1
  const text = renderQq({ jobType: 'continuous', props: p.props, ncpus: p.ncpus * n, ngpus: p.ngpus * n, mem: p.mem, walltime: p.walltime, loopEnd: p.loopEnd, modules: p.modules, mdrun, resubmit: until(gro) })
  const file = 'scripts/' + s.folder + '/' + sys.method + '_' + s.folder + '_' + sys.sequence + '.sh'
  return { file, text, submit: 'qq submit -q gpu ' + sys.dir + '/' + STEP_FOLDER[stage] + '/' + file.split('/').pop() }
}

/** The folder each stage's step runs in, in a system's folder. */
export const STEP_FOLDER: Record<StageId, string> = { sb: '', min: '4.minim', nvt: '5.eqnvt', npt: '6.eqnpt', awh: '7.awh', pull: '8.pull', walkers: '9.multiwalker' }
