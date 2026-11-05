// SymBuilder's tiles (R3c): the palette's categories and kinds, each with its tone and icon (the mock-up's, T218),
// the values a tile shows, and a step as the line the inspector prints.

import { ArrowLeftRight, Box, Columns3, Droplet, Equal, File, Frame, Layers, Link, List, Merge, Plus, Scale, ShieldCheck, SlidersHorizontal, Tag, TrendingDown, Zap, type LucideIcon } from 'lucide-react'
import type { BuildDraft } from '../../buildDraft'
import type { Tone } from '../tones'
import { systemsOf, type BuildPlan, type Science, type StageId, type System, type Tile, type TileType } from './plan'
import { planSystem, type Step } from './steps'

/** The palette's categories (the mock-up's), each a tone (T218). */
export const CATS: { id: string; name: string; tone: Tone }[] = [
  { id: 'structure', name: 'structure', tone: 'stone' }, { id: 'topology', name: 'topology', tone: 'sky' }, { id: 'box', name: 'place · box', tone: 'lilac' },
  { id: 'solvent', name: 'water, salt, solutes', tone: 'aqua' }, { id: 'md', name: 'min · eq', tone: 'coral' }, { id: 'sampling', name: 'pull · awh · walkers', tone: 'butter' }, { id: 'check', name: 'checks', tone: 'mint' },
]
interface Kind { cat: string; label: string; what: string; icon: LucideIcon; tile: Tile; stage: StageId }
const k = (cat: string, label: string, what: string, icon: LucideIcon, stage: StageId, type: TileType, mol?: Tile['mol']): Kind => ({ cat, label, what, icon, stage, tile: mol ? { type, on: true, mol } : { type, on: true } })
/** Every kind of tile, by its key (type, and molecule or stage where one type does two jobs). */
export const KINDS: Record<string, Kind> = {
  sequence: k('structure', 'build sequence', 'PyMOL · the peptide from its one-letter code', Link, 'sb', 'sequence'),
  saccharide: k('structure', 'saccharide', 'its .gro, copied into the system', File, 'sb', 'saccharide'),
  'trjconv:peptide': k('box', 'trjconv', 'centre the peptide in a 1 nm box', Frame, 'sb', 'trjconv', 'peptide'),
  'trjconv:saccharide': k('box', 'trjconv', 'centre the saccharide in a 1 nm box', Frame, 'sb', 'trjconv', 'saccharide'),
  'editconf:saccharide': k('box', 'editconf', 'shift and align the saccharide', Box, 'sb', 'editconf', 'saccharide'),
  'editconf:peptide': k('box', 'editconf', 'align the peptide', Box, 'sb', 'editconf', 'peptide'),
  pdb2gmx: k('topology', 'pdb2gmx', 'the peptide\'s topology, inside ff/', Layers, 'sb', 'pdb2gmx'),
  termini: k('check', 'termini check', 'N- and C-terminus, the peptide\'s charge', Tag, 'sb', 'termini'),
  merge: k('box', 'merge', 'the saccharide first, then the peptide', Merge, 'sb', 'merge'),
  topology: k('topology', 'write topology', '#include list and [ molecules ]', List, 'sb', 'topology'),
  solvate: k('solvent', 'add water', 'gmx solvate', Droplet, 'sb', 'solvate'),
  genion: k('solvent', 'add salt', 'prosECCo75 ions, counted', Zap, 'sb', 'genion'),
  hmr: k('topology', 'hydrogen masses', 'gromologist, for methods with hmr', Scale, 'sb', 'hmr'),
  glucose: k('solvent', 'add glucose', 'gmx insert-molecules', Plus, 'sb', 'glucose'),
  'md:min': k('md', 'minimise', 'grompp and mdrun, here', TrendingDown, 'min', 'md'),
  'md:nvt': k('md', 'equilibrate nvt', 'grompp and mdrun, here', Equal, 'nvt', 'md'),
  'md:npt': k('md', 'equilibrate npt', 'grompp and mdrun, here', Equal, 'npt', 'md'),
  charge: k('check', 'charge check', 'the net charge, by grompp', ShieldCheck, 'npt', 'charge'),
  awh: k('sampling', 'awh input', 'index with [ CARB ], grompp', SlidersHorizontal, 'awh', 'awh'),
  pull: k('sampling', 'pull input', 'index with [ CARB ], grompp', ArrowLeftRight, 'pull', 'pull'),
  walkers: k('sampling', 'walker windows', 'a start frame and grompp per walker', Columns3, 'walkers', 'walkers'),
}
export const keyOf = (stage: StageId, t: Tile) => (t.type === 'md' ? 'md:' + stage : t.mol ? t.type + ':' + t.mol : t.type)
export const toneOf = (key: string) => CATS.find(c => c.id === KINDS[key]?.cat)?.tone ?? 'stone'

/** The values a tile shows on its row. */
export function pills(key: string, sc: Science): string[] {
  const p: Record<string, string[]> = {
    sequence: ['{SEQUENCE}', 'C-term OXT', 'h_add', 'picture'], saccharide: ['molecules/saccharides/{saccharide}.gro'],
    'trjconv:peptide': ['-center', '-box 1 1 1', 'groups 0 0'], 'trjconv:saccharide': ['-center', '-box 1 1 1', 'groups 0 0'],
    'editconf:saccharide': ['-translate ' + sc.shift.join(' '), '-princ'], 'editconf:peptide': ['-princ'],
    pdb2gmx: ['answers ' + sc.answers, '-ignh -ter', sc.forcefield + '.ff'], termini: ['NH3+ / COO-', 'charge × ' + sc.ionCharge + ' e'],
    merge: ['box ' + sc.box.toFixed(1) + ' nm', 'renumbered'], topology: ['CARB 1', 'Protein 1'], solvate: ['-cs', 'fast: SOL → TIP3F'],
    genion: [sc.salt + ' mol/l', sc.positive + ' / ' + sc.negative, '±' + sc.ionCharge + ' e'], hmr: Object.entries(sc.restraints).map(([n, v]) => n + ' ' + v),
    glucose: [sc.glucose.file, '-conc ' + sc.glucose.conc.toFixed(2), '-try ' + sc.glucose.tries],
    'md:min': [sc.mdp.min, 'potential → xvg'], 'md:nvt': [sc.mdp.nvt], 'md:npt': [sc.mdp.npt], charge: ['grompp on 6.eqnpt.gro'],
    awh: [sc.mdp.awh + ' · ' + sc.mdp.awhHmr + ' for hmr'], pull: [sc.mdp.pull, 'pullx.xvg'], walkers: [sc.walkers.length + ' walkers', ...sc.walkers.map(d => d.toFixed(1))],
  }
  return p[key] ?? []
}
export const where = (stage: StageId) => (stage === 'awh' || stage === 'pull' || stage === 'walkers' ? 'cluster · qq script' : stage === 'sb' ? 'here' : 'here · waits')

/** The first system of the build, or the tokens where none is set yet. */
export function firstSystem(d: BuildDraft): System {
  return systemsOf(d.systems)[0] ?? { method: d.systems.methods[0] ?? '{method}', saccharide: d.systems.saccharides[0] ?? '{saccharide}', sequence: d.systems.sequences[0] ?? '{sequence}', SEQUENCE: (d.systems.sequences[0] ?? '{SEQUENCE}').toUpperCase(), repeat: 0, dir: 'solutions/' + [d.systems.methods[0] ?? '{method}', d.systems.saccharides[0] ?? '{saccharide}', d.systems.sequences[0] ?? '{sequence}'].join('/') }
}
/** One tile's steps, alone. */
export const tileSteps = (plan: BuildPlan, si: number, ti: number, sys: System) =>
  planSystem({ ...plan, stages: plan.stages.map((s, i) => ({ ...s, on: i === si, tiles: s.tiles.map((t, j) => ({ ...t, on: i === si && j === ti })) })) }, sys, { base: '{base}' })

/** What a step does, as a line: the command for gmx, what it runs for python, a sentence for the rest. */
export function stepLine(s: Step, gmx: string): string {
  switch (s.program) {
    case 'gmx': return gmx + ' ' + s.argv.join(' ')
    case 'python': return 'python ' + s.argv.join(' ')
    case 'copy': return 'copies ' + s.argv[0] + ' to ' + s.argv[1]
    case 'rename': return 'renames ' + s.argv[0] + ' to ' + s.argv[1]
    case 'write': return 'writes ' + s.argv[0]
    case 'read': return 'reads ' + s.argv[0]
    case 'wait': return 'waits for ' + s.argv[0] + ': every 10 s, up to 10 min'
  }
}

