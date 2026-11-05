// pdb2gmx's menus, read from the force field (T211, question 22): its answers are menu numbers, and the termini menus
// depend on the residue. GROMACS builds them with filter_ter (src/gromacs/gmxpreprocess/ter_db.cpp): the .n.tdb and
// .c.tdb blocks of every file in the force field folder, files in name order; first the blocks a residue matches by
// its first three letters (in any |-separated field), then the generic ones (no hyphen, or only a charge mark at the
// end) unless a block already listed contains the name, then None last. For MET, the ethers' methyl caps MET1 and MET2
// match by name and come first, so the answers that pick NH3+ and COO- are 1 8 1 1 there (your notebook's comment).

/** The keywords inside a terminus block; any other [ header ] starts a block (read_ter_db_file). */
const KEYWORDS = new Set(['bonds', 'angles', 'dihedrals', 'impropers', 'exclusions', 'cmap', 'replace', 'add', 'delete'])

/** The block names of one .tdb file, in its order. */
export function tdbNames(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*\[\s*([^\]]*?)\s*\]/.exec(raw.replace(/;.*$/, ''))
    if (m && m[1] && !KEYWORDS.has(m[1].toLowerCase())) out.push(m[1])
  }
  return out
}

/** The water models watermodels.dat lists (-water's name, the menu's label, its description); pdb2gmx adds None. */
export function waterModels(text: string): { name: string; label: string; what: string }[] {
  return text.split(/\r?\n/).map(l => l.replace(/[;#].*$/, '').trim()).filter(Boolean).map(l => { const [name, label = name, ...what] = l.split(/\s+/); return { name, label, what: what.join(' ') } })
}

const same3 = (a: string, b: string) => a.slice(0, 3).toLowerCase() === b.slice(0, 3).toLowerCase()

/** filter_ter: the terminus menu pdb2gmx shows for a residue, from every block of one end (files in name order). */
export function terMenu(blocks: string[], resname: string): string[] {
  const list: string[] = []
  let none: string | null = null
  for (const name of blocks) if (name.split('|').some((_, i, all) => same3(resname, all.slice(i).join('|')))) list.push(name)
  for (const name of blocks) {
    if (name.toLowerCase() === 'none') { none = name; continue }
    const h = name.indexOf('-'), generic = h < 0 || h === name.length - 1
    if (generic && !list.some(b => b.includes(name))) list.push(name)
  }
  return none ? [...list, none] : list
}

/** One-letter codes as PyMOL's fab names the residues. */
export const RESIDUE: Record<string, string> = {
  A: 'ALA', R: 'ARG', N: 'ASN', D: 'ASP', C: 'CYS', Q: 'GLN', E: 'GLU', G: 'GLY', H: 'HIS', I: 'ILE',
  L: 'LEU', K: 'LYS', M: 'MET', F: 'PHE', P: 'PRO', S: 'SER', T: 'THR', W: 'TRP', Y: 'TYR', V: 'VAL',
}

const charge = (name: string) => (/[+-]$/.test(name) ? name.slice(-1) : '')
/** A block of the residue's own, `GLY-NH3+`: a conjunction hyphen after the name it matched by. */
const ownBlock = (name: string, resname: string) => { const h = name.indexOf('-'); return h > 0 && h < name.length - 1 && name.slice(0, h).split('|').some(f => same3(resname, f)) }

/**
 * The terminus of a residue that stands for `want`, the one the answers pick on a residue with no blocks of its own:
 * the residue's own version of it with the same charge (GLY-NH3+ for NH3+, as pdb2gmx itself drops NH3+ for it),
 * else the residue's own charged terminus for a charged one (PRO-NH2+ for NH3+), else `want` itself; null when its
 * menu has none of them (PRO has no neutral NH2: pdb2gmx drops NH2 for PRO-NH2+).
 */
export function standsFor(menu: string[], resname: string, want: string): string | null {
  if (want.toLowerCase() === 'none') return menu.find(n => n.toLowerCase() === 'none') ?? null
  const own = menu.filter(n => ownBlock(n, resname)), q = charge(want)
  return own.find(n => n.includes(want) && charge(n) === q) ?? (q ? own.find(n => charge(n) === q) : undefined) ?? (menu.includes(want) ? want : null)
}

export interface ForceFieldMenus {
  /** The .ff folders in ff/, in name order: pdb2gmx lists them first, before GROMACS's own. */
  local: string[]
  /** Every block of the .n.tdb files, then of the .c.tdb files, files in name order. */
  n: string[]; c: string[]
  waters: { name: string; label: string; what: string }[]
}

export interface SequenceAnswers {
  sequence: string
  /** The answers this sequence is built with, and the ones that pick what the plan's answers stand for. */
  answers: string; want: string | null
  /** Its answers are its own (answersBySequence): what they pick is yours, said but not a problem. */
  own: boolean
  first: { resname: string; menu: string[]; picks: string | null; standsFor: string | null }
  last: { resname: string; menu: string[]; picks: string | null; standsFor: string | null }
  problems: string[]
}

/**
 * Each sequence's pdb2gmx answers against the force field's menus: what they pick, what the plan's answers stand for
 * (their pick on a residue with no blocks of its own), and the answers that pick that, or why there are none.
 */
export interface AnswersCheck {
  /** What is wrong with the plan's answers themselves (the force field, the water model, a terminus past its menu). */
  general: string[]
  /** The water model the second answer picks, or null when it picks none. */
  water: string | null
  sequences: SequenceAnswers[]
}
export function checkAnswers(ff: ForceFieldMenus, forcefield: string, answers: string, bySequence: Record<string, string>, sequences: string[]): AnswersCheck {
  const general: string[] = [], base = answers.trim().split(/\s+/).map(Number)
  const at = ff.local.indexOf(forcefield + '.ff')
  if (at < 0) general.push('ff/ has no ' + forcefield + '.ff: pdb2gmx would not find it')
  else if (base[0] !== at + 1) general.push('the first answer, ' + base[0] + ', picks ' + (base[0] >= 1 && base[0] <= ff.local.length ? ff.local[base[0] - 1] : 'one of GROMACS\'s own force fields') + ', not ' + forcefield + ' (' + (at + 1) + ')')
  const waterAt = base[1], water = waterAt >= 1 && waterAt <= ff.waters.length ? ff.waters[waterAt - 1].name : waterAt === ff.waters.length + 1 ? 'None' : null
  // With no watermodels.dat, pdb2gmx's water menu is not known here: not checked.
  if (!water && ff.waters.length) general.push('the second answer, ' + waterAt + ', is no water model: the menu has ' + ff.waters.length + ' and None (' + (ff.waters.length + 1) + ')')
  const genericN = terMenu(ff.n, '---'), genericC = terMenu(ff.c, '---')
  const wantN = genericN[base[2]] ?? null, wantC = genericC[base[3]] ?? null
  if (!wantN) general.push('the N-terminus answer, ' + base[2] + ', is past the menu (' + genericN.join(', ') + ')')
  if (!wantC) general.push('the C-terminus answer, ' + base[3] + ', is past the menu (' + genericC.join(', ') + ')')
  return {
    general, water,
    sequences: sequences.map(q => {
      const own = Object.hasOwn(bySequence, q), used = (own ? bySequence[q] : answers).trim().split(/\s+/).map(Number), up = q.toUpperCase()
      const end = (letter: string, blocks: string[], want: string | null, k: number) => {
        const resname = RESIDUE[letter] ?? letter, menu = terMenu(blocks, resname)
        return { resname, menu, picks: menu[k] ?? null, standsFor: want ? standsFor(menu, resname, want) : null }
      }
      const first = end(up[0], ff.n, wantN, used[2]), last = end(up[up.length - 1], ff.c, wantC, used[3]), problems: string[] = []
      for (const [e, side, want] of [[first, 'N', wantN], [last, 'C', wantC]] as const) {
        const k = used[side === 'N' ? 2 : 3]
        if (!e.picks) problems.push('the ' + side + '-terminus answer, ' + k + ', is past ' + e.resname + '\'s menu (' + e.menu.join(', ') + ')')
        else if (own || !want) continue
        else if (!e.standsFor) problems.push(e.resname + ' has no ' + want + ' (' + side + '-terminus menu: ' + e.menu.join(', ') + ')')
        else if (e.picks !== e.standsFor) problems.push('the ' + side + '-terminus answer, ' + k + ', picks ' + e.picks + ' for ' + e.resname + ', not ' + e.standsFor + ' (' + e.menu.join(', ') + ')')
      }
      const fix = first.standsFor && last.standsFor ? [base[0], base[1], first.menu.indexOf(first.standsFor), last.menu.indexOf(last.standsFor)].join(' ') : null
      return { sequence: q, answers: used.join(' '), want: fix, own, first, last, problems }
    }),
  }
}
