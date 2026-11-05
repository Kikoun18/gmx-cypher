// What a build reads (R4): every file of the base folder a system needs before it is built (its saccharide's .gro and
// .itp, the force field and the includes of its topology, the mdp file of each stage it runs), relative to the base
// folder. The server only checks that each exists; nothing is read or changed.

import { BASE, switches, type BuildPlan, type System } from './plan'

export type InputKind = 'saccharide' | 'force field' | 'mdp' | 'molecule'
export interface Input { path: string; kind: InputKind; what: string }

const ff = (p: string) => BASE.ff + '/' + p
/** The files one system reads from the base folder, under a plan. */
export function inputsOf(plan: BuildPlan, sys: System): Input[] {
  const sc = plan.science, { hmr, fast } = switches(sys.method), on = (id: string) => !!plan.stages.find(s => s.id === id)?.on
  const tile = (type: string) => plan.stages.some(s => s.on && s.tiles.some(t => t.on && t.type === type))
  const out: Input[] = []
  const add = (path: string, kind: InputKind, what: string) => { if (!out.some(i => i.path === path)) out.push({ path, kind, what }) }
  if (tile('saccharide')) add(BASE.saccharides + '/' + sys.saccharide + '.gro', 'saccharide', 'the saccharide\'s coordinates')
  if (tile('topology')) {
    add(ff(sys.saccharide + '-ADD.itp'), 'saccharide', 'the saccharide\'s topology')
    add(ff(sc.forcefield + '.ff/forcefield.itp'), 'force field', 'the force field')
    add(ff('ADDff.itp'), 'force field', 'the saccharides\' atom types')
    add(ff('ions/iontypes.itp'), 'force field', 'prosECCo75 ion types')
    add(ff('ions/ions.itp'), 'force field', 'prosECCo75 ions')
    add(fast ? ff('TIP3PF/TIP3PF_orig.itp') : ff(sc.forcefield + '.ff/tip3p.itp'), 'force field', fast ? 'TIP3PF water' : 'TIP3P water')
    if (fast && hmr && tile('hmr')) add(ff('TIP3PF/TIP3PF_HMR.itp'), 'force field', 'TIP3PF water, hydrogen masses')
  }
  if (tile('pdb2gmx')) add(ff(sc.forcefield + '.ff/aminoacids.rtp'), 'force field', 'pdb2gmx\'s residues')
  const mdp = (f: string, what: string) => add(BASE.inputs + '/' + f, 'mdp', what)
  if (tile('genion') || on('min') || tile('charge')) mdp(sc.mdp.min, 'minimisation, the salt\'s grompp and the charge check')
  if (on('nvt')) mdp(sc.mdp.nvt, 'nvt')
  if (on('npt')) mdp(sc.mdp.npt, 'npt')
  if (on('awh')) mdp(hmr ? sc.mdp.awhHmr : sc.mdp.awh, 'awh' + (hmr ? ', for methods with hmr' : ''))
  if (on('pull')) mdp(sc.mdp.pull, 'the pull')
  if (on('walkers')) mdp(sc.mdp.walkers, 'the walkers')
  if (tile('glucose')) add(BASE.molecules + '/' + sc.glucose.file, 'molecule', 'glucose')
  return out
}
