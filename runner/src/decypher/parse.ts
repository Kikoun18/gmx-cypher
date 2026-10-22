// (de)Cypher's sources as analyses: a gmx-cypher run (its record and its g(r)), an RDF of the Matrix
// vault, or files from disk (gro, pdb, ndx, xvg, run.json) linked as the RDF Explorer design links them. The
// x and y come from the Matrix's own parseTable; a curve's peak is its highest point (T152), not the first shell's (T27).

import { parseTable } from '../../../matrix/src/lib/seq'
import { parseNdx } from '../lib/ndx'
import { peaks } from '../lib/rdf'
import { fromRanges, readStructure, TONES } from '../core/index'
import type { Analysis, Group, Peak, Sel, Struct, Tone } from '../core/kit'
import { curveGroup } from '../core/cards'

const toneOf = (t: unknown, i: number): Tone => (TONES.includes(t as Tone) ? (t as Tone) : TONES[i % TONES.length])
export const basename = (s: string) => String(s || '').replace(/['"]/g, '').split(/[\\/]/).pop() || ''
export const stemOf = (n: string) => n.replace(/\.run\.json$/i, '').replace(/\.(xvg|ndx|gro|pdb|json)$/i, '')

// ---------- g(r) ----------
export interface Xvg { x: number[]; ys: number[][]; legends: string[]; xlabel: string; ylabel: string; ndxName: string | null; refIdx: number | null; selIdx: number[] | null }

/** An .xvg's columns and labels, and from its command line the index file and the groups gmx rdf read. */
export function parseXvg(text: string): Xvg {
  const t = parseTable(text), x = t.cols[0] || []
  if (t.cols.length < 2 || x.length < 2) throw new Error('no data rows')
  const ys = t.cols.slice(1).map(c => c.map(v => (Number.isFinite(v) ? v : 0)))
  const cmd = /#\s*Command line:\s*\n#\s*(.*)/.exec(text)?.[1] ?? ''
  let ndxName: string | null = null, refIdx: number | null = null, selIdx: number[] | null = null
  if (cmd) {
    let m = /\s-n\s+(\S+)/.exec(cmd)
    if (m) ndxName = basename(m[1])
    m = /-ref\s+'?group\s+(\d+)/.exec(cmd)
    if (m) refIdx = +m[1]
    m = /-sel\s+(.*)$/.exec(cmd)
    if (m) selIdx = [...m[1].split(/\s-[a-z]/)[0].matchAll(/group\s+(\d+)/g)].map(q => +q[1])
  }
  return { x, ys, legends: ys.map((_, i) => t.head.legends[i] || ''), xlabel: t.head.xLabel, ylabel: t.head.yLabel, ndxName, refIdx, selIdx }
}

/** The curve's first shell (T27's rule, R3d): none when g(r) never rises above 1. */
export function shellOf(x: number[], y: number[]): Peak | null {
  const s = peaks(x.flatMap((v, i) => (Number.isFinite(v) && Number.isFinite(y[i]) ? [[v, y[i]] as [number, number]] : []))).firstShell
  return s && { r: s.r, g: s.g }
}

/** The curve's highest point (the first of equal ones), wherever it is; null for a curve with no value above zero. */
export function peakOf(x: number[], y: number[]): Peak | null {
  let best = -1
  for (let i = 0; i < y.length; i++) if (Number.isFinite(y[i]) && Number.isFinite(x[i]) && (best < 0 || y[i] > y[best])) best = i
  return best >= 0 && y[best] > 0 ? { r: x[best], g: y[best] } : null
}

/** Groups with their curves: by legend when the legends are the groups' names, else in order. */
function withCurves(x: Xvg, groups: Group[]): Sel[] {
  return groups.map((g, i) => {
    let col = x.legends.indexOf(g.name)
    if (col < 0) col = i
    const y = x.ys[col] || []
    return { ...g, y, peak: y.length ? peakOf(x.x, y) : null, shell: y.length ? shellOf(x.x, y) : null }
  }).filter(g => g.y.length)
}

// ---------- a run record ----------
export interface RecordGroup { index?: number; role: string; name: string; tone?: string; atoms: string }
export interface RecordLike {
  analysis?: string; job?: string; record?: string; status?: string; complete?: boolean
  command?: { args?: string[] }
  frames?: { analysed: number; lastTime: number } | null
  inputs?: Record<string, { path: string } | undefined>
  groups: RecordGroup[]
  options?: { flag: string; value: unknown }[]
  outputs?: { kind: string; path: string }[]
  /** gmx distance's averages, as it printed them (R7). */
  distances?: { average: number }[]
}

/** A record's reference and selections, atoms from its ranges. */
export function recordGroups(r: RecordLike): { ref: Group | null; sels: Group[] } {
  const conv = (g: RecordGroup, i: number): Group => ({ name: g.name, atoms: fromRanges(g.atoms), tone: toneOf(g.tone, i) })
  const r0 = r.groups.find(g => g.role === 'reference')
  return { ref: r0 ? conv(r0, 0) : null, sels: r.groups.filter(g => g.role === 'selection').map(conv) }
}

export const binOf = (r: RecordLike | null, x: number[]) => {
  const v = r?.options?.find(o => o.flag === 'bin')?.value
  return v != null && v !== '' ? Number(v) : x.length > 1 ? +(x[1] - x[0]).toFixed(4) : null
}

/** Its facts in one line: what it is, the frames, the bin, the reference. */
export function facts(parts: (string | null | false | undefined)[]) { return parts.filter(Boolean).join(' · ') }

type RecordSource = { id: string; kind: Analysis['kind']; title: string; label: string; source: string; record: RecordLike; xvg: string; struct: string | null; structNote: string }

export function fromRecord(o: RecordSource): Analysis {
  const x = parseXvg(o.xvg), command = o.record.analysis ?? 'rdf'
  if (command !== 'rdf') return fromResult(o, x, command)
  const { ref, sels } = recordGroups(o.record), bin = binOf(o.record, x.x)
  return {
    id: o.id, kind: o.kind, title: o.title, label: o.label, x: x.x, xlabel: x.xlabel || 'r (nm)', ylabel: x.ylabel || 'g(r)', ref, sels: withCurves(x, sels),
    struct: o.struct, structNote: o.structNote,
    sub: facts([o.source, o.record.frames ? o.record.frames.analysed + ' frames' : null, bin ? 'bin ' + bin + ' nm' : null, ref ? 'ref ' + ref.name + ' · ' + ref.atoms.length + ' atoms' : null]),
  }
}

/**
 * Any other command's result (R10a): a curve per column of its main file, each with the group it measures, drawn from
 * the data with no rule and no peaks; a reference that no curve measures is the reference.
 */
const QUANTITY: Record<string, string> = { rmsf: 'RMSF', energy: 'energy', distance: 'distance', mindist: 'minimum distance', density: 'density', order: 'S_CD' }
function fromResult(o: RecordSource, x: Xvg, command: string): Analysis {
  const groups = o.record.groups.map((g, i) => ({ role: g.role, name: g.name, atoms: fromRanges(g.atoms), tone: toneOf(g.tone, i) }))
  const of = x.ys.map((_, i) => curveGroup(command, groups, i))
  const sels: Sel[] = x.ys.map((y, i) => ({ name: of[i]?.name ?? (command.startsWith('gyrate') && i ? 'about ' + 'xyz'[i - 1] : command === 'order' && !i ? 'S_CD' : x.legends[i] || 'series ' + (i + 1)), atoms: of[i]?.atoms ?? [], tone: of[i]?.tone ?? TONES[i % TONES.length], y, peak: null, shell: null }))
  // gmx order's first group is its first carbon, not a reference (R16b).
  const r = command === 'order' ? undefined : groups.find(g => g.role === 'reference' && !of.includes(g)), ref = r ? { name: r.name, atoms: r.atoms, tone: r.tone } : null
  // gmx rms fits on its first group (R10d), unless -fit none.
  const fit = command === 'rms' && groups[0] && o.record.options?.find(f => f.flag === 'fit')?.value !== 'none' ? { name: groups[0].name, atoms: groups[0].atoms } : undefined
  return {
    // gmx writes some y labels as a unit alone, "(nm)": the quantity is named in front of it.
    id: o.id, kind: o.kind, command, title: o.title, label: o.label, x: x.x, xlabel: x.xlabel || 'x', ylabel: /^\(/.test(x.ylabel) ? (QUANTITY[command] ?? 'value') + ' ' + x.ylabel : x.ylabel || 'y', ref, sels, struct: o.struct, structNote: o.structNote,
    plot: { y: command.startsWith('hbond') || command === 'density' ? 'zero' : 'data', rule: null },
    // RMSF is painted on the structure (R10b): per atom, or per residue with -res.
    ...(command === 'rmsf' && sels[0] ? { paint: { by: o.record.options?.some(f => f.flag === 'res' && f.value === true) ? 'residue' as const : 'atom' as const, values: x.x.map((v, i): [number, number] => [v, sels[0].y[i]]), label: 'RMSF', unit: 'nm' } } : {}),
    ...(fit ? { fit } : {}),
    sub: facts([o.source, 'gmx ' + command, o.record.frames ? o.record.frames.analysed + ' frames' : null, ref ? 'ref ' + ref.name + ' · ' + ref.atoms.length + ' atoms' : null, command === 'rms' ? (fit ? 'fit on ' + fit.name : 'no fit') : null]),
  }
}

/** The largest atom number a set of groups reaches: a structure with fewer atoms can't be theirs. */
export function maxAtom(groups: (Group | null)[]): number {
  let m = 0
  for (const g of groups) if (g) for (const v of g.atoms) if (v > m) m = v
  return m
}

// ---------- an RDF of the vault ----------
export interface VaultCurve { label: string; text: string; xCol: number; yCol: number; xScale: number }

/** Linear interpolation of (xs, ys) at x: a curve of another file put on the first curve's grid. */
function interp(xs: number[], ys: number[], x: number) {
  if (x <= xs[0]) return ys[0]
  for (let i = 1; i < xs.length; i++) if (xs[i] >= x) { const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1); return ys[i - 1] + t * (ys[i] - ys[i - 1]) }
  return ys[ys.length - 1]
}

/**
 * An RDF analysis of the Matrix: each curve from its file's columns as the vault records them. With the
 * gmx-cypher run that wrote the file (found by its SHA-256), column k is that run's selection k: its atoms and hue.
 */
export function fromVault(o: { id: string; title: string; label: string; source: string; curves: VaultCurve[]; record: RecordLike | null; struct: string | null; structNote: string }): Analysis {
  const tables = new Map<string, ReturnType<typeof parseTable>>()
  const table = (t: string) => { if (!tables.has(t)) tables.set(t, parseTable(t)); return tables.get(t)! }
  const first = o.curves[0]
  if (!first) throw new Error('this analysis has no curves')
  const t0 = table(first.text), X = (t0.cols[first.xCol - 1] || []).map(v => v * (first.xScale || 1))
  const keep = X.map(Number.isFinite), x = X.filter((_, i) => keep[i])
  if (x.length < 2) throw new Error('no data rows in column ' + first.xCol)
  const groups = o.record ? recordGroups(o.record) : { ref: null, sels: [] }
  const sels: Sel[] = o.curves.flatMap((c, i) => {
    const t = table(c.text), cx = (t.cols[c.xCol - 1] || []).map(v => v * (c.xScale || 1)), cy = t.cols[c.yCol - 1]
    if (!cy) return []
    const y = c.text === first.text && c.xCol === first.xCol ? cy.filter((_, j) => keep[j]).map(v => (Number.isFinite(v) ? v : 0)) : x.map(v => interp(cx, cy, v))
    const g = c.xCol === 1 ? groups.sels[c.yCol - 2] : undefined
    return [{ name: c.label, atoms: g ? g.atoms : [], tone: g ? g.tone : TONES[i % TONES.length], y, peak: peakOf(x, y), shell: shellOf(x, y) }]
  })
  const head = t0.head
  return {
    id: o.id, kind: 'vault', title: o.title, label: o.label, x, xlabel: head.xLabel || 'r (nm)', ylabel: head.yLabel || 'g(r)', ref: groups.ref, sels,
    struct: o.struct, structNote: o.structNote,
    sub: facts([o.source, o.record?.frames ? o.record.frames.analysed + ' frames' : null, x.length > 1 ? 'bin ' + +(x[1] - x[0]).toFixed(4) + ' nm' : null, groups.ref ? 'ref ' + groups.ref.name : o.record ? null : 'no atom groups (no record of the job that wrote this file)']),
  }
}

// ---------- files from disk ----------
export interface LoadedFile { path: string; text: string }
export interface FileRow { path: string; kind: 'gro' | 'ndx' | 'xvg' | 'run' | 'file'; status: string; error: boolean }

/**
 * Dropped or picked files as analyses, the design's way: each .xvg finds its run record (by the record's -o,
 * else by stem), its index (the record's -n, the .xvg's command line, the stem, or the only one), and the
 * structure the record names, else the nearest one with enough atoms.
 */
export function fromFiles(files: LoadedFile[]): { analyses: Analysis[]; structs: Record<string, Struct>; files: FileRow[] } {
  type P = { path: string; name: string; dir: string; kind: FileRow['kind']; data: unknown; error: string | null; status: string }
  const parsed: P[] = files.map(f => {
    const name = basename(f.path), dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
    const kind: FileRow['kind'] = /\.json$/i.test(name) ? 'run' : /\.(gro|pdb)$/i.test(name) ? 'gro' : /\.ndx$/i.test(name) ? 'ndx' : /\.xvg$/i.test(name) ? 'xvg' : 'file'
    const p: P = { path: f.path, name, dir, kind, data: null, error: null, status: '' }
    try {
      if (kind === 'gro') { const s = readStructure(name, f.text); p.data = s; p.status = s.n + ' atoms' }
      else if (kind === 'ndx') { const g = parseNdx(f.text); if (!g.length) throw new Error('no [ groups ]'); p.data = g; p.status = g.length + ' groups' }
      else if (kind === 'xvg') { const x = parseXvg(f.text); p.data = x; p.status = x.ys.length + ' curves · ' + x.x.length + ' points' }
      else if (kind === 'run') {
        const r = JSON.parse(f.text) as RecordLike
        if (!r || !Array.isArray(r.groups)) throw new Error('no groups')
        if (r.complete === false || r.status === 'running') { p.error = "an incomplete record: its job didn't finish"; return p }
        p.data = r; p.status = (r.analysis || 'rdf') + (r.frames ? ' · ' + r.frames.analysed + ' frames' : '')
      } else p.error = 'not a gro, pdb, ndx, xvg or run.json'
    } catch (e) { p.error = 'not a valid ' + kind + ' (' + (e as Error).message + ')' }
    return p
  })
  const ok = parsed.filter(p => !p.error), of = (k: P['kind']) => ok.filter(p => p.kind === k)
  const gros = of('gro'), ndxs = of('ndx'), xvgs = of('xvg'), runs = of('run'), used = new Set<string>(), linked: Record<string, string> = {}
  const near = (list: P[], f: P, pred: (x: P) => boolean) => list.find(x => x.dir === f.dir && pred(x)) || list.find(pred)
  const after = (r: RecordLike, flag: string) => { const a = r.command?.args || [], i = a.indexOf(flag); return i >= 0 ? basename(a[i + 1]) : null }
  const structs: Record<string, Struct> = {}
  const analyses = xvgs.map(f => {
    const x = f.data as Xvg, stem = stemOf(f.name)
    const run = near(runs, f, r => after(r.data as RecordLike, '-o') === f.name) || near(runs, f, r => stemOf(r.name) === stem)
    const rec = run ? (run.data as RecordLike) : null
    const ndxName = (rec && after(rec, '-n')) || x.ndxName, local = ndxs.filter(n => n.dir === f.dir)
    const ndx = (ndxName && near(ndxs, f, n => n.name === ndxName)) || near(ndxs, f, n => stemOf(n.name) === stem) || (local.length === 1 ? local[0] : null) || (ndxs.length === 1 ? ndxs[0] : null)
    const ng = ndx ? (ndx.data as { name: string; atoms: number[] }[]) : [], byName = (nm: string) => ng.find(g => g.name === nm)
    let ref: Group | null = null, sels: Group[] = []
    if (rec) {
      // The record's groups, atoms from the index when it holds the same group at the same place.
      const conv = (g: RecordGroup, i: number): Group => {
        const hit = g.index != null && ng[g.index]?.name === g.name ? ng[g.index] : byName(g.name)
        return { name: g.name, tone: toneOf(g.tone, i), atoms: hit ? hit.atoms : fromRanges(g.atoms) }
      }
      const r0 = rec.groups.find(g => g.role === 'reference')
      ref = r0 ? conv(r0, 0) : null
      sels = rec.groups.filter(g => g.role === 'selection').map(conv)
    } else if (ng.length) {
      const ri = x.refIdx ?? 0
      if (ng[ri]) ref = { name: ng[ri].name, atoms: ng[ri].atoms, tone: 'stone' }
      if (x.legends.length && x.legends.every(l => byName(l))) sels = x.legends.map((l, i) => ({ name: l, atoms: byName(l)!.atoms, tone: TONES[i % TONES.length] }))
      else sels = (x.selIdx?.length ? x.selIdx : ng.map((_, i) => i).filter(i => i !== ri)).map(i => ng[i]).filter(Boolean).map((g, i) => ({ name: g.name, atoms: g.atoms, tone: TONES[i % TONES.length] }))
    } else sels = x.ys.map((_, i) => ({ name: x.legends[i] || 'series ' + (i + 1), atoms: [], tone: TONES[i % TONES.length] }))
    const need = maxAtom([ref, ...sels]), recStruct = rec ? basename(rec.inputs?.structure?.path || '') : ''
    let best: P | null = null, score = -Infinity
    for (const s of gros) {
      if (need && (s.data as Struct).n < need) continue
      let sc = 0
      if (recStruct && recStruct === s.name) sc += 5
      if (s.dir === f.dir || !s.dir || f.dir.startsWith(s.dir + '/')) sc += 2
      if (sc > score) { score = sc; best = s }
    }
    used.add(f.path)
    if (run) used.add(run.path)
    if (ndx) used.add(ndx.path)
    if (best) { used.add(best.path); structs['file:' + best.path] = best.data as Struct }
    const all = withCurves(x, sels), bin = binOf(rec, x.x)
    linked[f.path] = ' → ' + [run && run.name, ndx && ndx.name, best && best.name].filter(Boolean).join(', ')
    const a: Analysis = {
      id: 'file:' + f.path, kind: 'file', title: f.name, label: stem, x: x.x, xlabel: x.xlabel || 'r (nm)', ylabel: x.ylabel || 'g(r)', ref, sels: all,
      struct: best ? 'file:' + best.path : null,
      structNote: best ? best.name + (best.dir ? ' in ' + best.dir + '/' : '') : gros.length ? 'no structure with the ' + need + ' atoms these groups reach' : 'no .gro or .pdb among the files',
      sub: facts(['files', rec?.frames ? rec.frames.analysed + ' frames' : null, bin ? 'bin ' + bin + ' nm' : null, ref ? 'ref ' + ref.name : null]),
    }
    return a
  })
  const order = { gro: 0, ndx: 1, xvg: 2, run: 3, file: 4 }
  const rows: FileRow[] = parsed.slice().sort((p, q) => order[p.kind] - order[q.kind] || p.path.localeCompare(q.path)).map(p => ({
    path: p.path, kind: p.kind, error: !!p.error,
    status: p.error ? p.error : p.status + (linked[p.path] ?? (xvgs.length && !used.has(p.path) ? ' · not linked' : '')),
  }))
  return { analyses, structs, files: rows }
}

/** Short names for legends: the stems without the words they all share, as the design shortens them. */
export function shortLabels(stems: string[]): string[] {
  if (stems.length < 2) return stems.map(s => s.replace(/^rdf_/i, '') || s)
  const toks = stems.map(s => s.split('_'))
  let k = 0
  while (k < toks[0].length - 1 && toks.every(t => t[k] === toks[0][k])) k++
  const out = toks.map((t, i) => t.slice(Math.max(0, k - 1)).join('_') || stems[i])
  const seen: Record<string, number> = {}
  return out.map(l => (seen[l] ? l + ' (' + ++seen[l] + ')' : ((seen[l] = 1), l)))
}
