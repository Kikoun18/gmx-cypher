// (de)Cypher's sources as analyses: a gmx-cypher run (its record and its g(r)), an RDF of the PMF Sequences
// vault, or files from disk (gro, pdb, ndx, xvg, run.json) linked as the RDF Explorer design links them. The
// x and y come from PMF Sequences' own parseTable, the first peaks from gmx-cypher's (T27), as in the result view.

import { parseTable } from '../../../app/src/lib/seq'
import { structFormat } from '../../../app/src/lib/structFile'
import { parseNdx } from '../lib/ndx'
import { firstPeak } from '../lib/rdf'
import { decypherKit, type Analysis, type Group, type Peak, type Sel, type Struct, type Tone } from './kit'

const kit = decypherKit()
export const TONES = kit.TONES
const toneOf = (t: unknown, i: number): Tone => (TONES.includes(t as Tone) ? (t as Tone) : TONES[i % TONES.length])
export const basename = (s: string) => String(s || '').replace(/['"]/g, '').split(/[\\/]/).pop() || ''
export const stemOf = (n: string) => n.replace(/\.run\.json$/i, '').replace(/\.(xvg|ndx|gro|pdb|json)$/i, '')

// ---------- structures ----------
export function parseGro(text: string): Struct {
  const lines = text.split(/\r?\n/), n = parseInt(lines[1], 10)
  if (!(n > 0)) throw new Error('no atom count on line 2')
  if (lines.length < n + 2) throw new Error('it ends before its ' + n + ' atoms')
  const nr: number[] = new Array(n), resnr: number[] = new Array(n), resn: string[] = new Array(n), name: string[] = new Array(n), xyz: number[] = new Array(3 * n)
  // Coordinates are fixed-width; a .gro written with more decimals widens them, read from the first atom.
  let w = 8
  const s0 = lines[2].slice(20), d1 = s0.indexOf('.'), d2 = s0.indexOf('.', d1 + 1)
  if (d1 >= 0 && d2 > d1) w = d2 - d1
  for (let i = 0; i < n; i++) {
    const L = lines[i + 2]
    nr[i] = i + 1; resnr[i] = parseInt(L.slice(0, 5), 10); resn[i] = L.slice(5, 10).trim(); name[i] = L.slice(10, 15).trim()
    for (let k = 0; k < 3; k++) xyz[3 * i + k] = parseFloat(L.slice(20 + k * w, 20 + (k + 1) * w))
  }
  const box = (lines[n + 2] || '').trim().split(/\s+/).map(Number)
  return { title: lines[0].trim(), n, nr, resnr, resn, name, xyz, box: [box[0] || 0, box[1] || 0, box[2] || 0] }
}

/** A .pdb's first model, in nm like a .gro; its box from CRYST1. */
export function parsePdb(text: string): Struct {
  const s: Struct = { title: '', n: 0, nr: [], resnr: [], resn: [], name: [], xyz: [], box: [0, 0, 0] }
  for (const l of text.split(/\r?\n/)) {
    if (l.startsWith('ENDMDL')) break
    if (l.startsWith('TITLE') && !s.title) s.title = l.slice(10).trim()
    if (l.startsWith('CRYST1')) s.box = [parseFloat(l.slice(6, 15)) / 10 || 0, parseFloat(l.slice(15, 24)) / 10 || 0, parseFloat(l.slice(24, 33)) / 10 || 0]
    if (!/^(ATOM  |HETATM)/.test(l)) continue
    const p = l.padEnd(80)
    s.n++; s.nr.push(s.n); s.name.push(p.slice(12, 16).trim()); s.resn.push(p.slice(17, 21).trim()); s.resnr.push(parseInt(p.slice(22, 26), 10))
    s.xyz.push(parseFloat(p.slice(30, 38)) / 10, parseFloat(p.slice(38, 46)) / 10, parseFloat(p.slice(46, 54)) / 10)
  }
  if (!s.n) throw new Error('no ATOM or HETATM lines')
  return s
}

export function parseStruct(name: string, text: string): Struct {
  const f = structFormat(name, text)
  if (!f) throw new Error(basename(name) + ' is not a .gro or .pdb')
  return f === 'gro' ? parseGro(text) : parsePdb(text)
}

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

export function peakOf(x: number[], y: number[]): Peak | null {
  const p = firstPeak(x.map((v, i) => [v, y[i]] as [number, number]))
  return p ? { r: p.r, g: p.g } : null
}

/** Groups with their curves: by legend when the legends are the groups' names, else in order. */
function withCurves(x: Xvg, groups: Group[]): Sel[] {
  return groups.map((g, i) => {
    let col = x.legends.indexOf(g.name)
    if (col < 0) col = i
    const y = x.ys[col] || []
    return { ...g, y, peak: y.length ? peakOf(x.x, y) : null }
  }).filter(g => g.y.length)
}

// ---------- a run record ----------
export interface RecordGroup { index?: number; role: string; name: string; tone?: string; atoms: string }
export interface RecordLike {
  analysis?: string; job?: string; record?: string
  command?: { args?: string[] }
  frames?: { analysed: number; lastTime: number } | null
  inputs?: Record<string, { path: string } | undefined>
  groups: RecordGroup[]
  options?: { flag: string; value: unknown }[]
}

/** A record's reference and selections, atoms from its ranges. */
export function recordGroups(r: RecordLike): { ref: Group | null; sels: Group[] } {
  const conv = (g: RecordGroup, i: number): Group => ({ name: g.name, atoms: kit.ranges(g.atoms), tone: toneOf(g.tone, i) })
  const r0 = r.groups.find(g => g.role === 'reference')
  return { ref: r0 ? conv(r0, 0) : null, sels: r.groups.filter(g => g.role === 'selection').map(conv) }
}

export const binOf = (r: RecordLike | null, x: number[]) => {
  const v = r?.options?.find(o => o.flag === 'bin')?.value
  return v != null && v !== '' ? Number(v) : x.length > 1 ? +(x[1] - x[0]).toFixed(4) : null
}

/** Its facts in one line: what it is, the frames, the bin, the reference. */
export function facts(parts: (string | null | false | undefined)[]) { return parts.filter(Boolean).join(' · ') }

export function fromRecord(o: { id: string; kind: Analysis['kind']; title: string; label: string; source: string; record: RecordLike; xvg: string; struct: string | null; structNote: string }): Analysis {
  const x = parseXvg(o.xvg), { ref, sels } = recordGroups(o.record), bin = binOf(o.record, x.x)
  return {
    id: o.id, kind: o.kind, title: o.title, label: o.label, x: x.x, xlabel: x.xlabel || 'r (nm)', ylabel: x.ylabel || 'g(r)', ref, sels: withCurves(x, sels),
    struct: o.struct, structNote: o.structNote,
    sub: facts([o.source, o.record.frames ? o.record.frames.analysed + ' frames' : null, bin ? 'bin ' + bin + ' nm' : null, ref ? 'ref ' + ref.name + ' · ' + ref.atoms.length + ' atoms' : null]),
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
 * An RDF analysis of PMF Sequences: each curve from its file's columns as the vault records them. With the
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
    return [{ name: c.label, atoms: g ? g.atoms : [], tone: g ? g.tone : TONES[i % TONES.length], y, peak: peakOf(x, y) }]
  })
  const head = t0.head
  return {
    id: o.id, kind: 'vault', title: o.title, label: o.label, x, xlabel: head.xLabel || 'r (nm)', ylabel: head.yLabel || 'g(r)', ref: groups.ref, sels,
    struct: o.struct, structNote: o.structNote,
    sub: facts([o.source, o.record?.frames ? o.record.frames.analysed + ' frames' : null, x.length > 1 ? 'bin ' + +(x[1] - x[0]).toFixed(4) + ' nm' : null, groups.ref ? 'ref ' + groups.ref.name : o.record ? null : 'no atom groups (not a gmx-cypher run)']),
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
      if (kind === 'gro') { const s = parseStruct(name, f.text); p.data = s; p.status = '✓ ' + s.n + ' atoms' }
      else if (kind === 'ndx') { const g = parseNdx(f.text); if (!g.length) throw new Error('no [ groups ]'); p.data = g; p.status = '✓ ' + g.length + ' groups' }
      else if (kind === 'xvg') { const x = parseXvg(f.text); p.data = x; p.status = '✓ ' + x.ys.length + ' curves · ' + x.x.length + ' points' }
      else if (kind === 'run') {
        const r = JSON.parse(f.text) as RecordLike
        if (!r || !Array.isArray(r.groups)) throw new Error('no groups')
        p.data = r; p.status = '✓ ' + (r.analysis || 'rdf') + (r.frames ? ' · ' + r.frames.analysed + ' frames' : '')
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
        return { name: g.name, tone: toneOf(g.tone, i), atoms: hit ? hit.atoms : kit.ranges(g.atoms) }
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
    status: p.error ? '✗ ' + p.error : p.status + (linked[p.path] ?? (xvgs.length && !used.has(p.path) ? ' · not linked' : '')),
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
