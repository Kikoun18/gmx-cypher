// SymBuilder's reports (R9), as the notebook prints them, text for text: the build summary (build_summary), the pull
// report (pull_report), the walker report (walker_report) and the termini check (check_termini, termini,
// _mol_sections). Pure: the server reads the files and hands their values in.

export type SummaryStatus = 'OK' | 'FAILED' | 'SKIPPED' | 'RETRIED'
export interface SummaryRow {
  name: string; charge: number | null; ions: [number, number] | null; min: number | null
  /** Seconds. */
  elapsed: number; status: SummaryStatus
  /** WARNING and NOTE lines per stage, in the order they came: [['SB', 7], ['MIN', 4], …]. */
  warn: [string, number][]
  note: string
}

/** Python's f"{x:+.Nf}": the sign always, as Python prints it (a negative zero keeps its minus). */
export const signed = (x: number, n: number) => (x < 0 || Object.is(x, -0) ? '' : '+') + x.toFixed(n)
/** Python's str(timedelta(seconds=s)): 0:02:03, 1 day, 0:00:00. */
export function timedelta(s: number): string {
  const d = Math.floor(s / 86400), r = s % 86400, t = Math.floor(r / 3600) + ':' + String(Math.floor(r / 60) % 60).padStart(2, '0') + ':' + String(r % 60).padStart(2, '0')
  return d ? d + (d === 1 ? ' day, ' : ' days, ') + t : t
}

/** The build summary (build_summary), as the notebook writes it to logs/: plain text, no colours. */
export function summaryText(rows: SummaryRow[], stamp: string, gmx: string, width = 78): string {
  const count = (s: SummaryStatus) => rows.filter(r => r.status === s).length
  const w = Math.max(30, ...rows.map(r => r.name.length))
  const bar = '═'.repeat(width), dash = '─'.repeat(width)
  const out = [bar, ' AWH BUILD SUMMARY   ' + stamp + '   GROMACS ' + gmx,
    ' ' + rows.length + ' systems    ● ' + count('OK') + ' ok    ● ' + count('FAILED') + ' failed    ● ' + count('SKIPPED') + ' skipped    ● ' + count('RETRIED') + ' retried',
    bar, 'SYSTEM'.padEnd(w) + '  ' + 'CHARGE'.padStart(6) + '  ' + 'IONS'.padStart(7) + '  ' + 'MIN'.padStart(5) + '  ' + 'TIME'.padStart(8) + '  ' + 'STATUS'.padEnd(7) + '  STEPS', dash]
  for (const r of rows) {
    const ch = r.charge == null ? '' : signed(r.charge, 1), mn = r.min == null ? '' : r.min.toFixed(2), ions = r.ions ? r.ions[0] + '/' + r.ions[1] : ''
    out.push(r.name.padEnd(w) + '  ' + ch.padStart(6) + '  ' + ions.padStart(7) + '  ' + mn.padStart(5) + '  ' + timedelta(r.elapsed).padStart(8) + '  ' + r.status.padEnd(7) + '  ' + r.warn.map(([k, v]) => k + ' ' + v).join(' '))
    if (r.note) out.push(''.padEnd(w) + '  ! ' + r.note)
  }
  out.push(bar)
  return out.join('\n') + '\n'
}

/** The pull report (pull_report): the charge after npt, the pull's shortest and longest distance. */
export function pullReport(rows: { name: string; charge: number | null; min: number | null; max: number | null }[]): string {
  const f = (v: number | null, sign = false) => (v == null ? '-' : sign ? signed(v, 2) : v.toFixed(2))
  return ['SYSTEM'.padEnd(34) + '  ' + 'CHARGE'.padStart(7) + '  ' + 'MIN'.padStart(6) + '  ' + 'MAX'.padStart(6),
    ...rows.map(r => r.name.padEnd(34) + '  ' + f(r.charge, true).padStart(7) + '  ' + f(r.min).padStart(6) + '  ' + f(r.max).padStart(6))].join('\n') + '\n'
}

export type WalkerMark = 'x' | 'o' | '-'
/** A walker's state (walker_report): x it has output (.xvg), o its run input is ready, - neither. */
export const walkerMark = (hasXvg: boolean, hasTpr: boolean): WalkerMark => (hasXvg ? 'x' : hasTpr ? 'o' : '-')
/** The walker report (walker_report): each system's marks, and its walkers with no run input (all, a list, or -). */
export function walkerReport(rows: { name: string; marks: WalkerMark[] }[], n: number): string {
  const tag = (m: WalkerMark[]) => { const miss = m.flatMap((x, i) => (x === '-' ? [i + 1] : [])); return miss.length === n ? 'all' : miss.length ? miss.join(',') : '-' }
  return ['SYSTEM'.padEnd(34) + '  ' + ('1-' + n).padEnd(n) + '  MISSING', ...rows.map(r => r.name.padEnd(34).slice(0, 34) + '  ' + r.marks.join('') + '  ' + tag(r.marks))].join('\n') + '\n'
}

export interface Atom { nr: number; res: number; resname: string; atom: string; q: number }
/**
 * The [ atoms ] and [ bonds ] of one moleculetype (_mol_sections), following #include lines through `include`
 * (a file's text, or null); the first file that has the molecule wins, as in the notebook.
 */
export function molSections(text: string, include: (name: string) => string | null, want = 'Protein', skip: string[] = ['forcefield', 'tip3p', 'TIP3P', 'ions', 'ADDff']): { atoms: Atom[]; bonds: [number, number][] } {
  let atoms: Atom[] = [], bonds: [number, number][] = [], sec: string | null = null, name: string | null = null
  for (const raw of text.split('\n')) {
    const line = raw.split(';')[0].trim()
    if (!line) continue
    if (line.startsWith('#include') && line.includes('"')) {
      const inc = line.split('"')[1]
      if (atoms.length || skip.some(s => inc.includes(s))) continue
      const t = include(inc)
      if (t == null) continue
      const sub = molSections(t, include, want, skip)
      if (sub.atoms.length) { atoms = sub.atoms; bonds = sub.bonds }
      continue
    }
    if (line.startsWith('#') || line.startsWith('*')) continue
    if (line.startsWith('[')) { sec = line.replace(/[[\]\s]/g, '').toLowerCase(); continue }
    const f = line.split(/\s+/)
    if (sec === 'moleculetype') name = f[0]
    else if (sec === 'atoms' && name === want && f.length >= 7) atoms.push({ nr: Number(f[0]), res: Number(f[2]), resname: f[3], atom: f[4], q: Number(f[6]) })
    else if (sec === 'bonds' && name === want && f.length >= 2) bonds.push([Number(f[0]), Number(f[1])])
  }
  return { atoms, bonds }
}

/** The termini as built (termini): N- and C-terminus by the hydrogens on N and the oxygens on C, and the end residues' charges. */
export function termini(atoms: Atom[], bonds: [number, number][]): { n: string; c: string; q1: number; qN: number } {
  const nbr = new Map<number, number[]>()
  for (const [i, j] of bonds) { nbr.set(i, [...(nbr.get(i) ?? []), j]); nbr.set(j, [...(nbr.get(j) ?? []), i]) }
  const by = new Map(atoms.map(a => [a.nr, a])), r1 = atoms.filter(a => a.res === atoms[0].res), rN = atoms.filter(a => a.res === atoms[atoms.length - 1].res)
  const N = r1.find(a => a.atom === 'N'), nH = N ? (nbr.get(N.nr) ?? []).filter(k => by.get(k)?.atom.startsWith('H')).length : -1
  const pro = r1[0].resname === 'PRO'
  let n = ({ 3: 'NH3+', 2: pro ? 'PRO-NH2+' : 'NH2', 1: '1H' } as Record<number, string>)[nH] ?? nH + 'H'
  if (pro && nH === 3) n = 'NH3+ BROKEN'
  const C = rN.find(a => a.atom === 'C'), Os = C ? (nbr.get(C.nr) ?? []).filter(k => by.get(k)?.atom.startsWith('O')) : []
  const OH = Os.some(o => (nbr.get(o) ?? []).some(k => by.get(k)?.atom.startsWith('H')))
  const c = Os.length === 2 && OH ? 'COOH' : Os.length === 2 ? 'COO-' : Os.length + 'O'
  const sum = (xs: Atom[]) => xs.reduce((s, a) => s + a.q, 0)
  return { n, c, q1: sum(r1), qN: sum(rN) }
}

/** One line of the termini check (check_termini), and whether it is odd: not the expected termini, or a charge off the ions' 0.75 e. */
export function terminiLine(name: string, atoms: Atom[], ionCharge = 0.75, expect: [string, string] = ['NH3+', 'COO-']): { line: string; odd: boolean } {
  const t = termini(atoms, []), q = atoms.reduce((s, a) => s + a.q, 0)
  return terminiRow(name, atoms[0].resname, atoms[atoms.length - 1].resname, t, q, ionCharge, expect)
}
export function terminiRow(name: string, first: string, last: string, t: { n: string; c: string; q1: number; qN: number }, qtot: number, ionCharge = 0.75, expect: [string, string] = ['NH3+', 'COO-']) {
  const odd = t.n !== expect[0] || t.c !== expect[1] || Math.abs(qtot / ionCharge - Math.round(qtot / ionCharge)) > 1e-3
  return { line: name.padEnd(34) + '  ' + first.slice(0, 4).padEnd(4) + ' ' + t.n.padEnd(12) + ' ' + last.slice(0, 4).padEnd(4) + ' ' + t.c.padEnd(6) + ' ' + signed(t.q1, 2).padStart(6) + ' ' + signed(t.qN, 2).padStart(6) + ' ' + signed(qtot, 3).padStart(8), odd }
}
export const TERMINI_HEAD = 'SYSTEM'.padEnd(34) + '  ' + '1st'.padEnd(4) + ' ' + 'N-TERM'.padEnd(12) + ' ' + 'last'.padEnd(4) + ' ' + 'C-TERM'.padEnd(6) + ' ' + 'q1'.padStart(6) + ' ' + 'qN'.padStart(6) + ' ' + 'qTOT'.padStart(8)
/** The termini check's last line: all match, or how many and which do not. */
export const terminiFooter = (odd: string[], expect: [string, string] = ['NH3+', 'COO-']) => 'expected ' + expect.join('/') + ': ' + (odd.length ? odd.length + ' mismatched: ' + odd.join(', ') : 'all match')
