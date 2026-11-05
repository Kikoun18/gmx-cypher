// The planners (R3b): every step of a system, before anything runs, with its program, arguments, stdin answers, the
// folder it runs in, and the files it reads, writes and replaces (relative to the base folder). The commands are the
// notebook's, argument for argument (the golden test), but for the differences decided in T205, T211 and T213:
// nothing is written in ff/ (pdb2gmx reads the system's .gro where it is; the peptide's moleculetype and the HMR
// split stay in the system folder), the charge check's files go to a temporary folder, and the scripts' names.

import { BASE, NAMES, switches, type BuildPlan, type StageId, type System, type Tile, type TileType } from './plan'
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
  /** What a write step writes (R5b): the text it computes, from `text.ts`. */
  make?: Make
}
export type Make = 'moleculetype' | 'merge' | 'topology' | 'water-tip3f' | 'water-sol' | 'carb' | 'hmr'

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
    add({ stage, tile: stage === 'awh' ? 'awh' : 'pull', label: '[ CARB ] appended', program: 'write', make: 'carb', cwd, argv: [ndx], reads: [join(d, c + '.gro')], replaces: [join(cwd, ndx)] })
  }
  const script = (stage: StageId, cwd: string) => {
    const s = qqScript(stage, sys, profile, sc.walkers.length)
    if (s) add({ stage, tile: stage === 'awh' ? 'awh' : stage === 'pull' ? 'pull' : stage === 'walkers' ? 'walkers' : 'md', label: 'qq script', program: 'copy', cwd, argv: [s.file, s.file.split('/').pop()!], writes: [s.file, join(cwd, s.file.split('/').pop()!)], where: 'cluster' })
  }
  const water = (to: 'TIP3F' | 'SOL') => fast && add({ stage: 'sb', tile: 'solvate', label: 'water named ' + to, program: 'write', make: to === 'TIP3F' ? 'water-tip3f' : 'water-sol', cwd: d, argv: [q + '.top'], reads: [join(d, q + '.top')], replaces: [join(d, q + '.top')] })
  const npt = '../' + NAMES.npt + '/' + NAMES.npt + '.gro'
  /** One tile's steps (its type, and for trjconv and editconf its molecule). */
  const emit = (stage: StageId, tile: Tile) => {
    switch (tile.type) {
      case 'sequence': return add({ stage, tile: 'sequence', label: 'build the peptide (PyMOL)', program: 'python', cwd: d, argv: ['build_peptide.py', sys.SEQUENCE, q + '.pdb', join(NAMES.visualization, q + '.png')], writes: [join(d, q + '.pdb'), join(d, NAMES.visualization, q + '.png')] })
      case 'saccharide': return add({ stage, tile: 'saccharide', label: 'copy the saccharide', program: 'copy', cwd: d, argv: [join(BASE.saccharides, c + '.gro'), c + '.gro'], reads: [join(BASE.saccharides, c + '.gro')], writes: [join(d, c + '.gro')] })
      case 'trjconv': return tile.mol === 'saccharide'
        ? add({ stage, tile: 'trjconv', label: 'centre the saccharide', program: 'gmx', cwd: d, argv: ['trjconv', '-f', './' + c + '.gro', '-s', './' + c + '.gro', '-o', c + '.gro', '-center', '-box', '1', '1', '1'], stdin: '0 0\n', reads: [join(d, c + '.gro')], replaces: [join(d, c + '.gro')] })
        : add({ stage, tile: 'trjconv', label: 'centre the peptide', program: 'gmx', cwd: d, argv: ['trjconv', '-f', './' + q + '.pdb', '-s', './' + q + '.pdb', '-o', q + '.gro', '-center', '-box', '1', '1', '1'], stdin: '0 0\n', reads: [join(d, q + '.pdb')], writes: [join(d, q + '.gro')] })
      case 'editconf':
        if (tile.mol === 'saccharide') {
          add({ stage, tile: 'editconf', label: 'shift and align the saccharide', program: 'gmx', cwd: d, argv: ['editconf', '-f', c + '.gro', '-o', c + '_princ.gro', '-translate', ...sc.shift.map(String), '-princ'], stdin: '0\n', reads: [join(d, c + '.gro')], writes: [join(d, c + '_princ.gro')] })
          return add({ stage, tile: 'editconf', label: c + '_princ.gro → ' + c + '.gro', program: 'rename', cwd: d, argv: [c + '_princ.gro', c + '.gro'], reads: [join(d, c + '_princ.gro')], replaces: [join(d, c + '.gro')] })
        }
        add({ stage, tile: 'editconf', label: 'align the peptide', program: 'gmx', cwd: d, argv: ['editconf', '-f', NAMES.pre, '-o', 'pre_princ.gro', '-princ'], stdin: '0\n', reads: [join(d, NAMES.pre)], writes: [join(d, 'pre_princ.gro')] })
        return add({ stage, tile: 'editconf', label: 'pre_princ.gro → pre.gro', program: 'rename', cwd: d, argv: ['pre_princ.gro', NAMES.pre], reads: [join(d, 'pre_princ.gro')], replaces: [join(d, NAMES.pre)] })
      case 'pdb2gmx': {
        const up = '../' + d + '/', answers = (sc.answersBySequence[q] ?? sc.answers).trim().split(/\s+/).join('\n') + '\n'
        add({ stage, tile: 'pdb2gmx', label: 'pdb2gmx, inside ff/', program: 'gmx', cwd: BASE.ff, argv: ['pdb2gmx', '-f', up + q + '.gro', '-v', '-ignh', '-i', up + q + '_restraints.itp', '-p', up + q + '.top', '-o', up + 'pre.gro', '-ter'], stdin: answers,
          reads: [join(d, q + '.gro'), join(BASE.ff, sc.forcefield + '.ff')], writes: [join(d, q + '_restraints.itp'), join(d, q + '.top'), join(d, NAMES.pre)] })
        return add({ stage, tile: 'pdb2gmx', label: 'the peptide\'s [ moleculetype ] → ' + q + '.itp', program: 'write', make: 'moleculetype', cwd: d, argv: [q + '.itp'], reads: [join(d, q + '.top')], writes: [join(d, q + '.itp')] })
      }
      case 'termini': return add({ stage, tile: 'termini', label: 'check the termini', program: 'read', cwd: d, argv: [q + '.itp'], reads: [join(d, q + '.itp')] })
      case 'merge': return add({ stage, tile: 'merge', label: 'merge into a ' + sc.box.toFixed(1) + ' nm box', program: 'write', make: 'merge', cwd: d, argv: [NAMES.conf], reads: [join(d, NAMES.pre), join(d, c + '.gro')], writes: [join(d, NAMES.conf)] })
      case 'topology': return add({ stage, tile: 'topology', label: 'write the topology', program: 'write', make: 'topology', cwd: d, argv: [q + '.top'], replaces: [join(d, q + '.top')] })
      case 'solvate':
        add({ stage, tile: 'solvate', label: 'add water', program: 'gmx', cwd: d, argv: ['solvate', '-cp', NAMES.conf, '-cs', '-o', NAMES.solvated, '-p', q + '.top', '-quiet'], reads: [join(d, NAMES.conf), join(d, q + '.top')], writes: [join(d, NAMES.solvated)], replaces: [join(d, q + '.top')] })
        return water('TIP3F')
      case 'genion':
        add({ stage, tile: 'genion', label: 'grompp before the salt', program: 'gmx', cwd: d, argv: ['grompp', '-f', inputs(sc.mdp.min), '-p', q + '.top', '-c', NAMES.solvated, '-r', NAMES.solvated, '-o', NAMES.preSalted, '-po', '3.pre_salted_mdout.mdp', '-quiet', '-maxwarn', String(sc.maxwarn)],
          reads: [join(d, q + '.top'), join(d, NAMES.solvated)], writes: [join(d, NAMES.preSalted), join(d, '3.pre_salted_mdout.mdp')] })
        water('SOL')
        add({ stage, tile: 'genion', label: 'add salt', program: 'gmx', cwd: d, argv: ['genion', '-s', NAMES.preSalted, '-p', q + '.top', '-o', NAMES.salted, '-pname', sc.positive, '-nname', sc.negative, '-np', '{np}', '-nn', '{nn}', '-quiet'], stdin: 'SOL\n',
          reads: [join(d, NAMES.preSalted), join(d, q + '.top')], writes: [join(d, NAMES.salted)], replaces: [join(d, q + '.top')], resolves: ['np', 'nn'] })
        return water('TIP3F')
      case 'hmr':
        if (!hmr) return
        add({ stage, tile: 'hmr', label: 'hydrogen masses (gromologist)', program: 'python', cwd: d, argv: ['hmr.py', q + '.top', q + '_hmr.top', ...Object.entries(sc.restraints).map(([k, v]) => k + '=' + v)], reads: [join(d, q + '.top')], writes: [join(d, q + '_hmr.top'), join(d, 'Protein.itp'), join(d, 'CARB.itp')] })
        return add({ stage, tile: 'hmr', label: 'the topology on Protein.itp and CARB.itp', program: 'write', make: 'hmr', cwd: d, argv: [q + '.top'], reads: [join(d, q + '.top'), join(d, q + '_hmr.top')], replaces: [join(d, q + '.top')] })
      case 'glucose': return // planned once insert-molecules' output is known (N11)
      case 'md': {
        const md = { min: [NAMES.min, sc.mdp.min, '../' + NAMES.salted, true], nvt: [NAMES.nvt, sc.mdp.nvt, '../' + NAMES.min + '/' + NAMES.min + '.gro', true], npt: [NAMES.npt, sc.mdp.npt, '../' + NAMES.nvt + '/' + NAMES.nvt + '.gro', false] } as const
        if (stage !== 'min' && stage !== 'nvt' && stage !== 'npt') return
        const [dir, mdp, from, quietFirst] = md[stage]
        script(stage, join(d, dir)); gromppMd(stage, dir, mdp, from, quietFirst)
        if (stage === 'min') add({ stage, tile: 'md', label: 'potential energy', program: 'gmx', cwd: d, argv: ['energy', '-f', './' + NAMES.min + '/' + NAMES.min + '.edr', '-o', NAMES.visualization + '/4.potE_minim.xvg', '-quiet'], stdin: 'Potential\n', reads: [join(d, NAMES.min, NAMES.min + '.edr')], writes: [join(d, NAMES.visualization, '4.potE_minim.xvg')] })
        return
      }
      case 'charge': return add({ stage, tile: 'charge', label: 'charge check (in a temporary folder)', program: 'gmx', cwd: d, argv: ['grompp', '-f', inputs(sc.mdp.min), '-p', q + '.top', '-c', NAMES.npt + '/' + NAMES.npt + '.gro', '-r', NAMES.npt + '/' + NAMES.npt + '.gro', '-o', '{tmp}/_charge_check.tpr', '-po', '{tmp}/_charge_check_mdout.mdp', '-maxwarn', String(sc.maxwarn), '-quiet'],
        reads: [join(d, q + '.top'), join(d, NAMES.npt, NAMES.npt + '.gro')], resolves: ['tmp'] })
      case 'awh': {
        const cwd = join(d, NAMES.awh); script('awh', cwd); index('awh', cwd, 'index.ndx', npt)
        return add({ stage, tile: 'awh', label: 'grompp 7.awh', program: 'gmx', cwd, argv: ['grompp', '-f', inputs(hmr ? sc.mdp.awhHmr : sc.mdp.awh), '-p', '../' + q + '.top', '-n', 'index.ndx', '-c', npt, '-r', npt, '-o', NAMES.awh + '.tpr', '-po', NAMES.awh + '_mdout.mdp', '-maxwarn', String(sc.maxwarn), '-quiet'],
          reads: [join(d, q + '.top'), join(cwd, 'index.ndx')], writes: [join(cwd, NAMES.awh + '.tpr'), join(cwd, NAMES.awh + '_mdout.mdp')] })
      }
      case 'pull': {
        const cwd = join(d, NAMES.pull); index('pull', d, NAMES.pull + '/index.ndx', NAMES.npt + '/' + NAMES.npt + '.gro')
        add({ stage, tile: 'pull', label: 'grompp 8.pull', program: 'gmx', cwd, argv: ['grompp', '-f', inputs(sc.mdp.pull), '-p', '../' + q + '.top', '-n', 'index.ndx', '-c', npt, '-r', npt, '-o', NAMES.pull + '.tpr', '-po', NAMES.pull + '_mdout.mdp', '-maxwarn', String(sc.maxwarn), '-quiet'],
          reads: [join(d, q + '.top'), join(cwd, 'index.ndx')], writes: [join(cwd, NAMES.pull + '.tpr'), join(cwd, NAMES.pull + '_mdout.mdp')] })
        return script('pull', cwd)
      }
      case 'walkers': {
        const pullDir = '../../' + NAMES.pull + '/'
        sc.walkers.forEach((_, i) => {
          const cwd = join(d, NAMES.walkers, String(i + 1))
          add({ stage, tile: 'walkers', label: 'walker ' + (i + 1) + ': its start frame', program: 'gmx', cwd, argv: ['trjconv', '-f', pullDir + NAMES.pull + '.xtc', '-s', pullDir + NAMES.pull + '.tpr', '-o', 'start.gro', '-dump', '{t' + (i + 1) + '}', '-pbc', 'whole', '-n', pullDir + 'index.ndx', '-quiet'], stdin: 'System\n',
            reads: [join(d, NAMES.pull, NAMES.pull + '.xtc'), join(d, NAMES.pull, 'pullx.xvg')], writes: [join(cwd, 'start.gro')], resolves: ['t' + (i + 1)] })
          add({ stage, tile: 'walkers', label: 'walker ' + (i + 1) + ': grompp', program: 'gmx', cwd, argv: ['grompp', '-f', inputs(sc.mdp.walkers), '-p', '../../' + q + '.top', '-n', pullDir + 'index.ndx', '-c', 'start.gro', '-r', 'start.gro', '-o', NAMES.walkers + '.tpr', '-po', NAMES.walkers + '_mdout.mdp', '-maxwarn', String(sc.maxwarn), '-quiet'],
            reads: [join(cwd, 'start.gro')], writes: [join(cwd, NAMES.walkers + '.tpr'), join(cwd, NAMES.walkers + '_mdout.mdp')] })
        })
        return script('walkers', join(d, NAMES.walkers))
      }
    }
  }
  for (const stage of plan.stages) if (stage.on) for (const tile of stage.tiles) if (tile.on) emit(stage.id, tile)
  return steps
}

/**
 * Why a stack's order can't work, in words: a step that reads or changes a file of this system before a later step
 * writes it, and a step that writes a file anew over a change nothing has read (review finding 5). A file nothing
 * in the plan writes is read from disk: a stage left out, or a system built before.
 */
export function orderProblems(steps: Step[]): string[] {
  const out: string[] = [], name = (f: string) => f.split('/').pop()
  steps.forEach((s, i) => {
    const before = steps.slice(0, i), made = (f: string) => before.some(e => e.writes.includes(f) || e.replaces.includes(f))
    for (const r of s.reads) {
      if (made(r)) continue
      const later = steps.slice(i + 1).find(e => e.writes.includes(r))
      if (later) out.push(s.label + ' reads ' + name(r) + ' before ' + later.label + ' writes it')
    }
    for (const f of s.replaces) {
      if (!made(f)) {
        const later = steps.slice(i + 1).find(e => e.writes.includes(f))
        if (later) out.push(s.label + ' changes ' + name(f) + ' before ' + later.label + ' writes it')
      } else if (!s.reads.includes(f)) {
        // Written anew: the last change to it must have been read by a step in between, or it is lost.
        const at = before.map(e => e.replaces.includes(f)).lastIndexOf(true)
        if (at >= 0 && !steps.slice(at + 1, i).some(e => e.reads.includes(f))) out.push(s.label + ' writes ' + name(f) + ' over what ' + steps[at].label + ' changed')
      }
    }
  })
  return [...new Set(out)]
}
