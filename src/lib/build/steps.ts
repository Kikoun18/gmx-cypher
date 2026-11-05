// The planners (R3b): every step of a system, before anything runs, with its program, arguments, stdin answers, the
// folder it runs in, and the files it reads, writes and replaces (relative to the base folder). The commands are the
// notebook's, argument for argument (the golden test), but for the differences decided in T205, T211 and T213:
// nothing is written in ff/ (pdb2gmx reads the system's .gro where it is; the peptide's moleculetype and the HMR
// split stay in the system folder), the charge check's files go to a temporary folder, and the scripts' names.

import { BASE, NAMES, switches, type BuildPlan, type StageId, type System, type TileType } from './plan'
import { PROFILES, qqScript, type Profile } from './qq'

/** gmx and python are started (fixed lists, T205); the rest are file operations the server does itself. */
export type Program = 'gmx' | 'python' | 'copy' | 'rename' | 'write' | 'read' | 'wait'
export interface Step {
  stage: StageId; tile: TileType; label: string; program: Program
  /** gmx: the tool and its options; python: a shipped script and its arguments; copy and rename: from, to; write and read: the file. */
  argv: string[]
  stdin?: string
  /** Where it runs, relative to the base folder. */
  cwd: string
  reads: string[]; writes: string[]; replaces: string[]
  where: 'here' | 'cluster'
  /** Values only the run knows (ion counts, a walker's frame), shown as {tokens} in argv. */
  resolves?: string[]
}

/** Joined and normalised: `a/7.awh/../6.eqnpt` is `a/6.eqnpt`. */
const join = (...p: string[]) => p.filter(Boolean).join('/').split('/').reduce<string[]>((out, x) => (x === '..' && out.length && out[out.length - 1] !== '..' ? out.slice(0, -1) : x === '.' ? out : [...out, x]), []).join('/')

/** Every step of one system under a plan, in order; a stage or tile that is off has none. */
export function planSystem(plan: BuildPlan, sys: System, o: { base: string; profile?: Profile } = { base: '' }): Step[] {
  const sc = plan.science, { hmr, fast } = switches(sys.method), d = sys.dir, q = sys.sequence, c = sys.saccharide
  const inputs = (f: string) => (o.base ? o.base + '/' : '') + join(BASE.inputs, f), steps: Step[] = []
  const profile = o.profile ?? PROFILES[0]
  const add = (s: Omit<Step, 'reads' | 'writes' | 'replaces' | 'where'> & Partial<Pick<Step, 'reads' | 'writes' | 'replaces' | 'where'>>) =>
    steps.push({ reads: [], writes: [], replaces: [], where: 'here', ...s })
  const gromppMd = (stage: StageId, dir: string, mdp: string, from: string, quietFirst: boolean) => {
    add({ stage, tile: 'md', label: 'grompp ' + dir, program: 'gmx', cwd: join(d, dir), argv: ['grompp', '-f', inputs(mdp), '-p', '../' + q + '.top', '-c', from, '-r', from, '-o', dir + '.tpr', '-po', (dir === NAMES.min ? '4.min' : dir) + '_mdout.mdp', ...(quietFirst ? ['-quiet', '-maxwarn', String(sc.maxwarn)] : ['-maxwarn', String(sc.maxwarn), '-quiet'])],
      reads: [join(d, q + '.top'), join(d, dir, from)], writes: [join(d, dir, dir + '.tpr'), join(d, dir, (dir === NAMES.min ? '4.min' : dir) + '_mdout.mdp')] })
    add({ stage, tile: 'md', label: 'mdrun ' + dir, program: 'gmx', cwd: join(d, dir), argv: ['mdrun', '-deffnm', dir, '-v', '-quiet'], reads: [join(d, dir, dir + '.tpr')], writes: ['.gro', '.edr', '.log', '.trr', '.cpt'].map(x => join(d, dir, dir + x)) })
    add({ stage, tile: 'md', label: 'wait for ' + dir + '.gro', program: 'wait', cwd: join(d, dir), argv: [dir + '.gro'], reads: [join(d, dir, dir + '.gro')] })
  }
  const index = (stage: StageId, cwd: string, ndx: string, gro: string) => {
    add({ stage, tile: stage === 'awh' ? 'awh' : 'pull', label: 'make_ndx', program: 'gmx', cwd, argv: ['make_ndx', '-f', gro, '-o', ndx, '-quiet'], stdin: 'q\n', reads: [join(cwd, gro)], writes: [join(cwd, ndx)] })
    add({ stage, tile: stage === 'awh' ? 'awh' : 'pull', label: '[ CARB ] appended', program: 'write', cwd, argv: [ndx], reads: [join(d, c + '.gro')], replaces: [join(cwd, ndx)] })
  }
  const script = (stage: StageId, cwd: string) => {
    const s = qqScript(stage, sys, profile, sc.walkers.length)
    if (s) add({ stage, tile: stage === 'awh' ? 'awh' : stage === 'pull' ? 'pull' : stage === 'walkers' ? 'walkers' : 'md', label: 'qq script', program: 'copy', cwd, argv: [s.file, s.file.split('/').pop()!], writes: [s.file, join(cwd, s.file.split('/').pop()!)], where: 'cluster' })
  }
  const on = (id: StageId) => plan.stages.find(s => s.id === id)
  const tileOn = (id: StageId, type: TileType, mol?: string) => !!on(id)?.on && !!on(id)!.tiles.find(t => t.type === type && (!mol || t.mol === mol))?.on

  if (on('sb')?.on) {
    if (tileOn('sb', 'sequence')) add({ stage: 'sb', tile: 'sequence', label: 'build the peptide (PyMOL)', program: 'python', cwd: d, argv: ['build_peptide.py', sys.SEQUENCE, q + '.pdb', join(NAMES.visualization, q + '.png')], writes: [join(d, q + '.pdb'), join(d, NAMES.visualization, q + '.png')] })
    if (tileOn('sb', 'trjconv', 'peptide')) add({ stage: 'sb', tile: 'trjconv', label: 'centre the peptide', program: 'gmx', cwd: d, argv: ['trjconv', '-f', './' + q + '.pdb', '-s', './' + q + '.pdb', '-o', q + '.gro', '-center', '-box', '1', '1', '1'], stdin: '0 0\n', reads: [join(d, q + '.pdb')], writes: [join(d, q + '.gro')] })
    if (tileOn('sb', 'saccharide')) add({ stage: 'sb', tile: 'saccharide', label: 'copy the saccharide', program: 'copy', cwd: d, argv: [join(BASE.saccharides, c + '.gro'), c + '.gro'], reads: [join(BASE.saccharides, c + '.gro')], writes: [join(d, c + '.gro')] })
    if (tileOn('sb', 'trjconv', 'saccharide')) add({ stage: 'sb', tile: 'trjconv', label: 'centre the saccharide', program: 'gmx', cwd: d, argv: ['trjconv', '-f', './' + c + '.gro', '-s', './' + c + '.gro', '-o', c + '.gro', '-center', '-box', '1', '1', '1'], stdin: '0 0\n', reads: [join(d, c + '.gro')], replaces: [join(d, c + '.gro')] })
    if (tileOn('sb', 'editconf', 'saccharide')) {
      add({ stage: 'sb', tile: 'editconf', label: 'shift and align the saccharide', program: 'gmx', cwd: d, argv: ['editconf', '-f', c + '.gro', '-o', c + '_princ.gro', '-translate', ...sc.shift.map(String), '-princ'], stdin: '0\n', reads: [join(d, c + '.gro')], writes: [join(d, c + '_princ.gro')] })
      add({ stage: 'sb', tile: 'editconf', label: c + '_princ.gro → ' + c + '.gro', program: 'rename', cwd: d, argv: [c + '_princ.gro', c + '.gro'], replaces: [join(d, c + '.gro')] })
    }
    if (tileOn('sb', 'pdb2gmx')) {
      const up = '../' + d + '/', answers = (sc.answersBySequence[q] ?? sc.answers).trim().split(/\s+/).join('\n') + '\n'
      add({ stage: 'sb', tile: 'pdb2gmx', label: 'pdb2gmx, inside ff/', program: 'gmx', cwd: BASE.ff, argv: ['pdb2gmx', '-f', up + q + '.gro', '-v', '-ignh', '-i', up + q + '_restraints.itp', '-p', up + q + '.top', '-o', up + 'pre.gro', '-ter'], stdin: answers,
        reads: [join(d, q + '.gro'), join(BASE.ff, sc.forcefield + '.ff')], writes: [join(d, q + '_restraints.itp'), join(d, q + '.top'), join(d, NAMES.pre)] })
      add({ stage: 'sb', tile: 'pdb2gmx', label: 'the peptide\'s [ moleculetype ] → ' + q + '.itp', program: 'write', cwd: d, argv: [q + '.itp'], reads: [join(d, q + '.top')], writes: [join(d, q + '.itp')] })
    }
    if (tileOn('sb', 'termini')) add({ stage: 'sb', tile: 'termini', label: 'check the termini', program: 'read', cwd: d, argv: [q + '.itp'], reads: [join(d, q + '.itp')] })
    if (tileOn('sb', 'editconf', 'peptide')) {
      add({ stage: 'sb', tile: 'editconf', label: 'align the peptide', program: 'gmx', cwd: d, argv: ['editconf', '-f', NAMES.pre, '-o', 'pre_princ.gro', '-princ'], stdin: '0\n', reads: [join(d, NAMES.pre)], writes: [join(d, 'pre_princ.gro')] })
      add({ stage: 'sb', tile: 'editconf', label: 'pre_princ.gro → pre.gro', program: 'rename', cwd: d, argv: ['pre_princ.gro', NAMES.pre], replaces: [join(d, NAMES.pre)] })
    }
    if (tileOn('sb', 'merge')) add({ stage: 'sb', tile: 'merge', label: 'merge into a ' + sc.box.toFixed(1) + ' nm box', program: 'write', cwd: d, argv: [NAMES.conf], reads: [join(d, NAMES.pre), join(d, c + '.gro')], writes: [join(d, NAMES.conf)] })
    if (tileOn('sb', 'topology')) add({ stage: 'sb', tile: 'topology', label: 'write the topology', program: 'write', cwd: d, argv: [q + '.top'], replaces: [join(d, q + '.top')] })
    const water = (to: 'TIP3F' | 'SOL') => fast && add({ stage: 'sb', tile: 'solvate', label: 'water named ' + to, program: 'write', cwd: d, argv: [q + '.top'], replaces: [join(d, q + '.top')] })
    if (tileOn('sb', 'solvate')) {
      add({ stage: 'sb', tile: 'solvate', label: 'add water', program: 'gmx', cwd: d, argv: ['solvate', '-cp', NAMES.conf, '-cs', '-o', NAMES.solvated, '-p', q + '.top', '-quiet'], reads: [join(d, NAMES.conf)], writes: [join(d, NAMES.solvated)], replaces: [join(d, q + '.top')] })
      water('TIP3F')
    }
    if (tileOn('sb', 'genion')) {
      add({ stage: 'sb', tile: 'genion', label: 'grompp before the salt', program: 'gmx', cwd: d, argv: ['grompp', '-f', inputs(sc.mdp.min), '-p', q + '.top', '-c', NAMES.solvated, '-r', NAMES.solvated, '-o', NAMES.preSalted, '-po', '3.pre_salted_mdout.mdp', '-quiet', '-maxwarn', String(sc.maxwarn)],
        reads: [join(d, q + '.top'), join(d, NAMES.solvated)], writes: [join(d, NAMES.preSalted), join(d, '3.pre_salted_mdout.mdp')] })
      water('SOL')
      add({ stage: 'sb', tile: 'genion', label: 'add salt', program: 'gmx', cwd: d, argv: ['genion', '-s', NAMES.preSalted, '-p', q + '.top', '-o', NAMES.salted, '-pname', sc.positive, '-nname', sc.negative, '-np', '{np}', '-nn', '{nn}', '-quiet'], stdin: 'SOL\n',
        reads: [join(d, NAMES.preSalted)], writes: [join(d, NAMES.salted)], replaces: [join(d, q + '.top')], resolves: ['np', 'nn'] })
      water('TIP3F')
    }
    if (hmr && tileOn('sb', 'hmr')) {
      add({ stage: 'sb', tile: 'hmr', label: 'hydrogen masses (gromologist)', program: 'python', cwd: d, argv: ['hmr.py', q + '.top', q + '_hmr.top', ...Object.entries(sc.restraints).map(([k, v]) => k + '=' + v)], reads: [join(d, q + '.top')], writes: [join(d, q + '_hmr.top'), join(d, 'Protein.itp'), join(d, 'CARB.itp')] })
      add({ stage: 'sb', tile: 'hmr', label: 'the topology on Protein.itp and CARB.itp', program: 'write', cwd: d, argv: [q + '.top'], replaces: [join(d, q + '.top')] })
    }
  }
  if (on('min')?.on) { script('min', join(d, NAMES.min)); gromppMd('min', NAMES.min, sc.mdp.min, '../' + NAMES.salted, true)
    add({ stage: 'min', tile: 'md', label: 'potential energy', program: 'gmx', cwd: d, argv: ['energy', '-f', './' + NAMES.min + '/' + NAMES.min + '.edr', '-o', NAMES.visualization + '/4.potE_minim.xvg', '-quiet'], stdin: 'Potential\n', reads: [join(d, NAMES.min, NAMES.min + '.edr')], writes: [join(d, NAMES.visualization, '4.potE_minim.xvg')] }) }
  if (on('nvt')?.on) { script('nvt', join(d, NAMES.nvt)); gromppMd('nvt', NAMES.nvt, sc.mdp.nvt, '../' + NAMES.min + '/' + NAMES.min + '.gro', true) }
  if (on('npt')?.on) {
    script('npt', join(d, NAMES.npt)); gromppMd('npt', NAMES.npt, sc.mdp.npt, '../' + NAMES.nvt + '/' + NAMES.nvt + '.gro', false)
    if (tileOn('npt', 'charge')) add({ stage: 'npt', tile: 'charge', label: 'charge check (in a temporary folder)', program: 'gmx', cwd: d, argv: ['grompp', '-f', inputs(sc.mdp.min), '-p', q + '.top', '-c', NAMES.npt + '/' + NAMES.npt + '.gro', '-r', NAMES.npt + '/' + NAMES.npt + '.gro', '-o', '{tmp}/_charge_check.tpr', '-po', '{tmp}/_charge_check_mdout.mdp', '-maxwarn', String(sc.maxwarn), '-quiet'],
      reads: [join(d, q + '.top'), join(d, NAMES.npt, NAMES.npt + '.gro')], resolves: ['tmp'] })
  }
  const npt = '../' + NAMES.npt + '/' + NAMES.npt + '.gro'
  if (on('awh')?.on) {
    const cwd = join(d, NAMES.awh); script('awh', cwd); index('awh', cwd, 'index.ndx', npt)
    add({ stage: 'awh', tile: 'awh', label: 'grompp 7.awh', program: 'gmx', cwd, argv: ['grompp', '-f', inputs(hmr ? sc.mdp.awhHmr : sc.mdp.awh), '-p', '../' + q + '.top', '-n', 'index.ndx', '-c', npt, '-r', npt, '-o', NAMES.awh + '.tpr', '-po', NAMES.awh + '_mdout.mdp', '-maxwarn', String(sc.maxwarn), '-quiet'],
      reads: [join(d, q + '.top'), join(cwd, 'index.ndx')], writes: [join(cwd, NAMES.awh + '.tpr'), join(cwd, NAMES.awh + '_mdout.mdp')] })
  }
  if (on('pull')?.on) {
    const cwd = join(d, NAMES.pull); index('pull', d, NAMES.pull + '/index.ndx', NAMES.npt + '/' + NAMES.npt + '.gro')
    add({ stage: 'pull', tile: 'pull', label: 'grompp 8.pull', program: 'gmx', cwd, argv: ['grompp', '-f', inputs(sc.mdp.pull), '-p', '../' + q + '.top', '-n', 'index.ndx', '-c', npt, '-r', npt, '-o', NAMES.pull + '.tpr', '-po', NAMES.pull + '_mdout.mdp', '-maxwarn', String(sc.maxwarn), '-quiet'],
      reads: [join(d, q + '.top'), join(cwd, 'index.ndx')], writes: [join(cwd, NAMES.pull + '.tpr'), join(cwd, NAMES.pull + '_mdout.mdp')] })
    script('pull', cwd)
  }
  if (on('walkers')?.on) {
    const pullDir = '../../' + NAMES.pull + '/'
    sc.walkers.forEach((_, i) => {
      const cwd = join(d, NAMES.walkers, String(i + 1))
      add({ stage: 'walkers', tile: 'walkers', label: 'walker ' + (i + 1) + ': its start frame', program: 'gmx', cwd, argv: ['trjconv', '-f', pullDir + NAMES.pull + '.xtc', '-s', pullDir + NAMES.pull + '.tpr', '-o', 'start.gro', '-dump', '{t' + (i + 1) + '}', '-pbc', 'whole', '-n', pullDir + 'index.ndx', '-quiet'], stdin: 'System\n',
        reads: [join(d, NAMES.pull, NAMES.pull + '.xtc'), join(d, NAMES.pull, 'pullx.xvg')], writes: [join(cwd, 'start.gro')], resolves: ['t' + (i + 1)] })
      add({ stage: 'walkers', tile: 'walkers', label: 'walker ' + (i + 1) + ': grompp', program: 'gmx', cwd, argv: ['grompp', '-f', inputs(sc.mdp.walkers), '-p', '../../' + q + '.top', '-n', pullDir + 'index.ndx', '-c', 'start.gro', '-r', 'start.gro', '-o', NAMES.walkers + '.tpr', '-po', NAMES.walkers + '_mdout.mdp', '-maxwarn', String(sc.maxwarn), '-quiet'],
        reads: [join(cwd, 'start.gro')], writes: [join(cwd, NAMES.walkers + '.tpr'), join(cwd, NAMES.walkers + '_mdout.mdp')] })
    })
    script('walkers', join(d, NAMES.walkers))
  }
  return steps
}
