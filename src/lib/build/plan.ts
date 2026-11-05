// SymBuilder's model (R3a): a build plan (its stages, their tiles and the science values, T203) and the systems it
// builds (methods × saccharides × sequences, with repeats). Pure: the planners, the server and the views read it.
// Every default is the notebook's (solution_builder_seq_5_4.ipynb, its variables cell), so a plan changed by nobody
// builds what the notebook builds.

export const PLAN_FORMAT = 'gmx-cypher build plan'
export const PLAN_VERSION = 1

/** The notebook's processes (T202: stages), in order. */
export type StageId = 'sb' | 'min' | 'nvt' | 'npt' | 'awh' | 'pull' | 'walkers'
export const STAGES: { id: StageId; name: string }[] = [
  { id: 'sb', name: 'solution builder' }, { id: 'min', name: 'minimisation' }, { id: 'nvt', name: 'nvt' }, { id: 'npt', name: 'npt' },
  { id: 'awh', name: 'awh' }, { id: 'pull', name: 'pull' }, { id: 'walkers', name: 'multiwalker' },
]

/** One tile's kind of work (T202: a step). */
export type TileType =
  | 'sequence' | 'saccharide' | 'trjconv' | 'editconf' | 'pdb2gmx' | 'termini' | 'merge' | 'topology' | 'solvate' | 'genion' | 'hmr' | 'glucose'
  | 'md' | 'charge' | 'awh' | 'pull' | 'walkers'
export type Molecule = 'peptide' | 'saccharide'
export interface Tile { type: TileType; on: boolean; mol?: Molecule }
export interface Stage { id: StageId; on: boolean; tiles: Tile[] }

/** Everything that changes a number or a command, kept with the plan (T203). */
export interface Science {
  /** The force field's folder in ff/, without `.ff`. */
  forcefield: string
  /** pdb2gmx's menu answers (force field, water, N- and C-terminus), and per sequence where they differ (T211). */
  answers: string
  answersBySequence: Record<string, string>
  ionCharge: number
  salt: number
  waterMolarity: number
  positive: string
  negative: string
  /** The saccharide's shift (editconf -translate), nm. */
  shift: [number, number, number]
  /** The merged box's edge, nm. */
  box: number
  /** The walkers' target distances, nm. */
  walkers: number[]
  maxwarn: number
  /** A non-zero exit stops the system (on), or only GROMACS's own fatal text does (off, as the notebook). */
  strict: boolean
  /** gromologist's defines for the hydrogen-mass topology. */
  restraints: Record<string, number>
  /** inputs/ mdp file per stage; awh's for methods with hmr apart (T212). */
  mdp: { min: string; nvt: string; npt: string; awh: string; awhHmr: string; pull: string; walkers: string }
  glucose: { file: string; conc: number; tries: number }
}

export interface BuildPlan { format: typeof PLAN_FORMAT; version: number; name: string; science: Science; stages: Stage[] }

const t = (type: TileType, mol?: Molecule, on = true): Tile => (mol ? { type, on, mol } : { type, on })
export const SCIENCE: Science = {
  forcefield: 'charmm36s-jul2022-prosECCo75', answers: '1 8 0 0', answersBySequence: {},
  ionCharge: 0.75, salt: 0.15, waterMolarity: 55.5, positive: 'NA_s', negative: 'CL_2s',
  shift: [0, 1.5, 0], box: 7.0, walkers: [0.4, 0.6, 0.8, 1.0, 1.5, 2.0, 2.5, 3.0], maxwarn: 6, strict: false,
  restraints: { POSRES_FC_BB: 400, POSRES_FC_SC: 40, DIHRES_FC: 4.0 },
  mdp: { min: 'minim.mdp', nvt: 'eq_nvt.mdp', npt: 'eq_npt.mdp', awh: 'awh.mdp', awhHmr: 'awh_hmr.mdp', pull: 'pull.mdp', walkers: 'hmr_multi.mdp' },
  glucose: { file: 'aglc.gro', conc: 1.0, tries: 1000 },
}
/** The notebook's stack, tile for tile (sol_creation, then one tile per process). */
export const DEFAULT_PLAN: BuildPlan = {
  format: PLAN_FORMAT, version: PLAN_VERSION, name: 'peptide × saccharide · awh and pull', science: SCIENCE,
  stages: [
    { id: 'sb', on: true, tiles: [t('sequence'), t('trjconv', 'peptide'), t('saccharide'), t('trjconv', 'saccharide'), t('editconf', 'saccharide'), t('pdb2gmx'), t('termini'), t('editconf', 'peptide'), t('merge'), t('topology'), t('solvate'), t('genion'), t('hmr'), t('glucose', undefined, false)] },
    { id: 'min', on: true, tiles: [t('md')] },
    { id: 'nvt', on: true, tiles: [t('md')] },
    { id: 'npt', on: true, tiles: [t('md'), t('charge')] },
    { id: 'awh', on: true, tiles: [t('awh')] },
    { id: 'pull', on: true, tiles: [t('pull')] },
    // The notebook runs the walkers by hand, once the pull's pullx.xvg exists.
    { id: 'walkers', on: false, tiles: [t('walkers')] },
  ],
}

/** What a method's name switches on (as the notebook reads it): gromologist's hydrogen masses, TIP3PF water. */
export const switches = (method: string) => ({ hmr: method.includes('hmr'), fast: method.includes('fast') })

/** The method of a repeat (R3a): `r` after the name, then `r1`, `r2` … (hmr+fast+6 → hmr+fast+6r → hmr+fast+6r1). */
export const repeatName = (method: string, n: number) => (n <= 0 ? method : method + 'r' + (n === 1 ? '' : n - 1))

/** The folders and files every system has, by the notebook's names, so folders built by it are recognised. */
export const NAMES = {
  conf: '01.conf.gro', solvated: '2.solvated.gro', preSalted: '3.pre_salted.tpr', salted: '3.salted.gro', pre: 'pre.gro',
  min: '4.minim', nvt: '5.eqnvt', npt: '6.eqnpt', awh: '7.awh', pull: '8.pull', walkers: '9.multiwalker', visualization: 'visualization',
} as const
/** The base folder's layout, as the notebook's (its BASE_DIR). */
export const BASE = { solutions: 'solutions', ff: 'ff', inputs: 'inputs', saccharides: 'molecules/saccharides', molecules: 'molecules', scripts: 'scripts', logs: 'logs' } as const

export interface Systems {
  methods: string[]; saccharides: string[]; sequences: string[]; repeats: number
  /** Only these cells (`cellKey`, by the method as listed: a cell's repeats are built with it), when set: the cells a project lacks (R8a). */
  only?: string[]
}
/** One cell of a build, as `Systems.only` lists it. */
export const cellKey = (method: string, saccharide: string, sequence: string) => method + '/' + saccharide + '/' + sequence
export interface System { method: string; saccharide: string; sequence: string; /** for PyMOL */ SEQUENCE: string; repeat: number; /** relative to the base folder */ dir: string }

const NAME = { method: /^[A-Za-z0-9][A-Za-z0-9+._-]{0,63}$/, saccharide: /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/, sequence: /^[A-Za-z]{1,64}$/ }
/** Why a name can't be a folder or an argument, or null: names come from the page and land in paths and argv. */
export function nameProblem(kind: keyof typeof NAME, name: string): string | null {
  if (NAME[kind].test(name)) return null
  return kind === 'sequence' ? 'a sequence is one-letter amino-acid codes: ' + JSON.stringify(name)
    : 'a ' + kind + ' is letters, digits and ' + (kind === 'method' ? '+ . _ -' : '_ -') + ', starting with a letter or digit: ' + JSON.stringify(name)
}

/**
 * Every system of a build, each repeat its own (methods × saccharides × sequences × (1 + repeats)), in that order;
 * with `only`, those cells. A folder comes once: a repeat named like another method listed is that method's system.
 */
export function systemsOf(s: Systems): System[] {
  const out: System[] = [], only = Array.isArray(s.only) ? new Set(s.only) : null, seen = new Set<string>()
  for (const m of s.methods) for (let r = 0; r <= s.repeats; r++) for (const c of s.saccharides) for (const q of s.sequences) {
    const method = repeatName(m, r)
    if (only && !only.has(cellKey(m, c, q))) continue
    if (seen.has(cellKey(method, c, q))) continue
    seen.add(cellKey(method, c, q))
    out.push({ method, saccharide: c, sequence: q, SEQUENCE: q.toUpperCase(), repeat: r, dir: [BASE.solutions, method, c, q].join('/') })
  }
  return out
}

/** Repeats named like another method listed (the notebook lists `hmr+fast+6` and `hmr+fast+6r`), in words. */
export function repeatClashes(s: Pick<Systems, 'methods' | 'repeats'>): string[] {
  const out: string[] = []
  for (const m of s.methods) for (let r = 1; r <= s.repeats; r++) {
    const name = repeatName(m, r)
    if (s.methods.includes(name)) out.push(name + ' is a method and ' + m + '\'s repeat ' + r + ': its systems are built once')
  }
  return out
}

/** Why an object is not a build plan this gmx-cypher can read, in words; empty when it is one. */
export function planProblems(p: unknown): string[] {
  if (!p || typeof p !== 'object') return ['not a build plan: no JSON object']
  const o = p as Partial<BuildPlan>
  if (o.format !== PLAN_FORMAT) return ['not a build plan: its format is ' + JSON.stringify(o.format ?? null)]
  if (typeof o.version !== 'number' || o.version < 1) return ['a build plan without a version']
  if (o.version > PLAN_VERSION) return ['this build plan was made by a newer gmx-cypher (version ' + o.version + '); this one reads version ' + PLAN_VERSION]
  const out: string[] = []
  if (typeof o.name !== 'string' || !o.name.trim()) out.push('a build plan needs a name')
  if (!Array.isArray(o.stages) || o.stages.map(s => s?.id).join() !== STAGES.map(s => s.id).join()) out.push('its stages are not ' + STAGES.map(s => s.name).join(', '))
  else for (const s of o.stages) if (!Array.isArray(s.tiles) || s.tiles.some(x => !x || typeof x.type !== 'string' || typeof x.on !== 'boolean')) out.push('stage ' + s.id + ' has a tile without a type')
  const sc = o.science as Partial<Science> | undefined
  if (!sc || typeof sc !== 'object') out.push('a build plan needs its science values')
  else out.push(...scienceProblems(sc))
  return out
}

/** A file or folder name, never a path: no slash, no leading dot (review finding 1). */
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/
const MENU = /^\s*\d+(\s+\d+)*\s*$/
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
/**
 * Each science value checked: they become paths (`inputs/<mdp>`, `ff/<forcefield>.ff`, `molecules/<glucose>`) and
 * arguments, so a name is a name in its folder and every number is a number (review findings 1 and 4).
 */
function scienceProblems(sc: Partial<Science>): string[] {
  const out: string[] = [], q = JSON.stringify
  for (const k of Object.keys(SCIENCE) as (keyof Science)[]) {
    const v = sc[k], want = SCIENCE[k]
    if (v == null || typeof v !== typeof want || Array.isArray(v) !== Array.isArray(want)) { out.push('science value ' + k + ' is missing or of another kind'); continue }
    if (typeof want === 'number' && !finite(v)) out.push('science value ' + k + ' is not a number')
  }
  if (out.length) return out
  const s = sc as Science
  if (!FILE_NAME.test(s.forcefield)) out.push('science value forcefield is not a folder name in ff/: ' + q(s.forcefield))
  if (!MENU.test(s.answers)) out.push('science value answers is not menu numbers: ' + q(s.answers))
  for (const [seq, a] of Object.entries(s.answersBySequence)) if (typeof a !== 'string' || !MENU.test(a)) out.push('science value answersBySequence.' + seq + ' is not menu numbers: ' + q(a))
  for (const k of ['positive', 'negative'] as const) if (!/^[A-Za-z0-9_+-]{1,16}$/.test(s[k])) out.push('science value ' + k + ' is not an ion name: ' + q(s[k]))
  if (s.shift.length !== 3 || !s.shift.every(finite)) out.push('science value shift is not three numbers')
  if (!s.walkers.length || s.walkers.length > 64 || !s.walkers.every(w => finite(w) && w > 0)) out.push('science value walkers is not a list of distances in nm')
  if (!Number.isInteger(s.maxwarn) || s.maxwarn < 0) out.push('science value maxwarn is not a whole number')
  for (const [k, v] of Object.entries(s.restraints)) if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(k) || !finite(v)) out.push('science value restraints has ' + q(k) + ', not a define with a number')
  if (!isObject(s.mdp)) out.push('science value mdp is missing or of another kind')
  else for (const k of Object.keys(SCIENCE.mdp) as (keyof Science['mdp'])[]) {
    const f = s.mdp[k]
    if (typeof f !== 'string' || !FILE_NAME.test(f) || !f.endsWith('.mdp')) out.push('science value mdp.' + k + ' is not an mdp file name in inputs/: ' + q(f ?? null))
  }
  if (!isObject(s.glucose)) out.push('science value glucose is missing or of another kind')
  else {
    if (typeof s.glucose.file !== 'string' || !FILE_NAME.test(s.glucose.file)) out.push('science value glucose.file is not a file name in molecules/: ' + q(s.glucose.file ?? null))
    if (!finite(s.glucose.conc) || !Number.isInteger(s.glucose.tries) || s.glucose.tries < 0) out.push('science value glucose has a concentration or tries that is not a number')
  }
  return out
}

/** Why systems from the page can't be built, in words; empty when they can (review finding 8). */
export function systemsProblems(s: unknown): string[] {
  if (!isObject(s)) return ['no systems']
  const out: string[] = []
  for (const kind of ['method', 'saccharide', 'sequence'] as const) {
    const list = s[kind + 's']
    if (!Array.isArray(list)) { out.push('no ' + kind + ' list'); continue }
    for (const n of list) {
      if (typeof n !== 'string') { out.push('a ' + kind + ' is a name: ' + JSON.stringify(n)); continue }
      const p = nameProblem(kind, n)
      if (p) out.push(p)
    }
  }
  if (!Number.isInteger(s.repeats) || (s.repeats as number) < 0 || (s.repeats as number) > 9) out.push('repeats is a whole number from 0 to 9')
  if (s.only !== undefined && (!Array.isArray(s.only) || s.only.some(c => typeof c !== 'string'))) out.push('only is a list of cells')
  return out
}
