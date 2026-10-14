// (de)Cypher's kit: the structure view, the chart and the curves, shared by the page and by its HTML export.
// Everything lives inside decypherKit() and uses no name from outside it, so an export carries this very code
// as its source text (decypherKit.toString()) and draws exactly what the page draws. Ported from the RDF
// Explorer design (v3): rdf-lib.js's structure builder, its canvas drawing and its chart.

export type Tone = 'coral' | 'sky' | 'mint' | 'butter' | 'lilac' | 'aqua' | 'rose' | 'stone'
export type Rep = 'ball & stick' | 'licorice' | 'spacefill'
export type Rest = 'tinted' | 'grey' | 'ghost'
export type Arrange = 'side by side' | 'frame positions'
export type ColorBy = 'group' | 'job'

/** A structure's atoms in file order, each with its GROMACS number (`nr`, 1-based); a subset keeps the numbers. */
export interface Struct { title: string; n: number; nr: number[]; resnr: number[]; resn: string[]; name: string[]; xyz: number[]; box: [number, number, number] }
export interface Peak { r: number; g: number }
export interface Group { name: string; atoms: number[]; tone: Tone }
export interface Sel extends Group { y: number[]; peak: Peak | null }

/** One RDF: a gmx-cypher job, a run record found on disk, an RDF of the PMF Sequences vault, or files from disk. */
export interface Analysis {
  id: string
  kind: 'job' | 'record' | 'vault' | 'file'
  /** Its name in a card's header, and its short name in legends. */
  title: string
  label: string
  /** Its facts in one line: source · frames · bin. */
  sub: string
  x: number[]
  xlabel: string
  ylabel: string
  ref: Group | null
  sels: Sel[]
  /** Key of its structure, and why that one (or why none). */
  struct: string | null
  structNote: string
}

export interface Hue { base: string; fg: string; soft: string; strong: string }
export interface Palette {
  dark: boolean; bg: string; fg: string; card: string; secondary: string; muted: string; border: string; input: string; ring: string
  bond: string; edge: string; hl: number; neutral: Record<string, string>; hues: Record<Tone, Hue>
}

export interface Mol {
  n: number; gnr: number[]; el: string[]; name: string[]; resn: string[]; resnr: number[]
  local: Float64Array; comp: Int32Array; comps: { minx: number; maxx: number; miny: number; maxy: number; D: number; ox: number; oy: number }[]
  bonds: Int32Array; g2l: Int32Array; ext: { w: number; h: number }; nmol: number; molOf: Int32Array; molLabels: string[]; truncated: boolean; hidden: number
}

/** What a structure view draws: the analysis's groups, which are plotted, its reference(s), and the style. */
export interface SceneState {
  mol: Mol | null
  pal: Palette
  rep: Rep
  rest: Rest
  labels: boolean
  hydrogens: boolean
  sels: Group[]
  /** Indices into `sels` that are plotted. */
  selected: number[]
  /** The first is this analysis's reference (solid); others are compared analyses' references on the same structure (dashed). `on: false`: one that is not plotted (morphed RDFs), drawn faint. */
  refs: { label: string; atoms: number[]; on?: boolean }[]
  /** A group or reference hovered elsewhere (a chip, a curve), ringed here. */
  hoverSel: number
  hoverRef: number
}

/** The atom under the pointer: its line, its group or reference (−1: none), and where its card goes. */
export interface AtomHover { atom: string; sel: number; ref: number; left: number; top: number }

export interface Curve {
  key: string; name: string; source: string; analysis: string
  x: number[]; y: number[]; color: string; dash: string; peak: Peak | null; atoms: number
  hot?: boolean; dim?: boolean
}

/** A chart as data: [tag, attributes, ...children]. The page renders it with React, the export with the DOM. */
export type VNode = [string, Record<string, unknown>, ...(VNode | string)[]]
export interface ChartGeom { m: { l: number; r: number; t: number; b: number }; iw: number; ih: number; x0: number; x1: number; y1: number; grid: number[] }

/** One job as an export carries it: atoms as ranges, y values rounded, its selection when exported. */
export interface ExportAnalysis { id: string; title: string; label: string; sub: string; x: number[]; xlabel: string; ylabel: string; ref: { name: string; atoms: string; tone: Tone } | null; sels: { name: string; atoms: string; tone: Tone; y: number[]; peak: Peak | null }[]; struct: string | null; structNote: string; selected: string[]; tone: Tone }
/** Everything an exported page needs: its tokens, structures without solvent, the analyses, the comparison and the style. */
export interface ExportData {
  /** The page's heading, as chosen ('(de)Cypher' unless changed). */
  header: string
  made: string; by: string; theme: 'light' | 'dark'; tokens: { light: Record<string, string>; dark: Record<string, string> }
  structs: Record<string, Struct>; analyses: ExportAnalysis[]
  compare: { ids: string[]; focus: string; selected: string[]; colorBy: ColorBy } | null
  /** RDFs shown as one card (they differ only in their reference): the first leads; `on` are those whose reference is plotted. */
  morphs?: { ids: string[]; on: string[]; title: string }[]
  view: { rep: Rep; rest: Rest; labels: boolean; hydrogens: boolean; arrange: Arrange }
}

export function decypherKit() {
  const TONES: Tone[] = ['coral', 'sky', 'mint', 'butter', 'lilac', 'aqua', 'rose', 'stone']
  /** Morpheus's dashes for several curves of one series, in order. */
  const DASH = ['none', '5 4', '2 3', '8 3 2 3', '1 3', '10 4']
  const REPS: Rep[] = ['ball & stick', 'licorice', 'spacefill']
  const RESTS: Rest[] = ['tinted', 'grey', 'ghost']
  /** Water and ions: never drawn, so the view shows the molecules the groups are about. */
  const SOLV = new Set(['SOL', 'WAT', 'HOH', 'TIP3', 'TIP3P', 'TIP4', 'TIP4P', 'TIP5P', 'SPC', 'SPCE', 'T3P', 'T4P', 'NA', 'CL', 'K', 'NA+', 'CL-', 'SOD', 'CLA', 'POT', 'ION', 'NIO', 'CIO'])
  const COV: Record<string, number> = { H: 0.031, C: 0.076, N: 0.071, O: 0.066, S: 0.105, P: 0.107, X: 0.08 }
  const RADS: Record<Rep, Record<string, number>> = {
    'ball & stick': { H: 0.028, C: 0.042, N: 0.042, O: 0.042, S: 0.056, P: 0.052, X: 0.045 },
    licorice: { H: 0.02, C: 0.024, N: 0.024, O: 0.024, S: 0.028, P: 0.028, X: 0.024 },
    spacefill: { H: 0.09, C: 0.136, N: 0.124, O: 0.122, S: 0.144, P: 0.144, X: 0.13 },
  }
  const BONDW: Record<Rep, number> = { 'ball & stick': 0.016, licorice: 0.044, spacefill: 0 }
  const MAX_ATOMS = 4000
  /** Atoms not in a group are warm greys, so the groups' pastels are the only colour in the view. */
  const NEUTRAL = {
    light: { bond: '#a8a29e', edge: '#201e1d', hl: 0.45, neutral: { C: '#7d7773', H: '#f7f6f5', O: '#b3aaa4', N: '#9b948f', S: '#cfc5bd', P: '#b8b0aa', X: '#a39d99' } },
    dark: { bond: '#5a5450', edge: '#0e0d0c', hl: 0.26, neutral: { C: '#8a8480', H: '#aaa49f', O: '#6f6965', N: '#7a7470', S: '#a0978f', P: '#8a8480', X: '#7a7470' } },
  }

  /** The canvas and chart colours of a theme, from its resolved Morpheus tokens. */
  function palette(dark: boolean, t: Record<string, string>): Palette {
    const hues = {} as Record<Tone, Hue>
    for (const k of TONES) hues[k] = { base: t[k], fg: t[k + '-foreground'], soft: t[k + '-soft'], strong: t[k + '-strong'] }
    const n = dark ? NEUTRAL.dark : NEUTRAL.light
    return { dark, bg: t.background, fg: t.foreground, card: t.card, secondary: t.secondary, muted: t['muted-foreground'], border: t.border, input: t.input, ring: t.ring, bond: n.bond, edge: n.edge, hl: n.hl, neutral: n.neutral, hues }
  }

  /** `43-3239:4, 5` as atom numbers. */
  function ranges(s: string): number[] {
    const out: number[] = []
    String(s || '').split(',').forEach(t => {
      const m = t.trim().match(/^(\d+)(?:-(\d+))?(?::(\d+))?$/)
      if (!m) return
      const a = +m[1], b = m[2] ? +m[2] : a, st = m[3] ? +m[3] : 1
      for (let v = a; v <= b; v += st) out.push(v)
    })
    return out
  }

  // ---------- colour ----------
  const hexCache: Record<string, number[]> = {}
  function hex(c: string): number[] {
    if (hexCache[c]) return hexCache[c]
    const v = parseInt(c.slice(1), 16)
    return (hexCache[c] = [(v >> 16) & 255, (v >> 8) & 255, v & 255])
  }
  function mix(a: string, b: string, t: number): string {
    if (t <= 0) return a
    const A = hex(a), B = hex(b)
    const r = Math.round(A[0] + (B[0] - A[0]) * t), g = Math.round(A[1] + (B[1] - A[1]) * t), bb = Math.round(A[2] + (B[2] - A[2]) * t)
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bb).toString(16).slice(1)
  }
  function rgba(c: string, a: number): string { const h = hex(c); return 'rgba(' + h[0] + ',' + h[1] + ',' + h[2] + ',' + a + ')' }

  // ---------- structure ----------
  function eig3(A: number[][]) {
    const a = A.map(r => r.slice()), v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    for (let s = 0; s < 60; s++) {
      let p = 0, q = 1, mx = Math.abs(a[0][1])
      if (Math.abs(a[0][2]) > mx) { p = 0; q = 2; mx = Math.abs(a[0][2]) }
      if (Math.abs(a[1][2]) > mx) { p = 1; q = 2; mx = Math.abs(a[1][2]) }
      if (mx < 1e-12) break
      const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]), c = Math.cos(th), sn = Math.sin(th)
      for (let k = 0; k < 3; k++) { const kp = a[k][p], kq = a[k][q]; a[k][p] = c * kp - sn * kq; a[k][q] = sn * kp + c * kq }
      for (let k = 0; k < 3; k++) { const pk = a[p][k], qk = a[q][k]; a[p][k] = c * pk - sn * qk; a[q][k] = sn * pk + c * qk }
      for (let k = 0; k < 3; k++) { const kp = v[k][p], kq = v[k][q]; v[k][p] = c * kp - sn * kq; v[k][q] = sn * kp + c * kq }
    }
    return { vals: [a[0][0], a[1][1], a[2][2]], vecs: v }
  }

  /**
   * The drawable structure: solvent and ions left out, bonds guessed from distances (across the box edges),
   * each molecule made whole and, side by side, laid flat on its own and packed in rows, the molecules with
   * plotted atoms first. Over 4000 atoms, the groups' atoms are kept and the rest cut in file order.
   */
  function buildMol(s: Struct, selNrs: Set<number>, refNrs: Set<number>, arrange: Arrange): Mol | null {
    let idx: number[] = [], hidden = 0
    for (let i = 0; i < s.n; i++) { if (SOLV.has(String(s.resn[i]).toUpperCase())) hidden++; else idx.push(i) }
    let truncated = false
    if (idx.length > MAX_ATOMS) {
      truncated = true
      const keep = idx.filter(i => selNrs.has(s.nr[i]) || refNrs.has(s.nr[i])).slice(0, MAX_ATOMS), kept = new Set(keep)
      for (const i of idx) { if (keep.length >= MAX_ATOMS) break; if (!kept.has(i)) keep.push(i) }
      idx = keep.sort((p, q) => p - q)
    }
    const n = idx.length
    if (!n) return null
    let maxNr = 0
    for (const i of idx) if (s.nr[i] > maxNr) maxNr = s.nr[i]
    const el: string[] = new Array(n), raw = new Float64Array(3 * n), g2l = new Int32Array(maxNr + 1).fill(-1)
    for (let k = 0; k < n; k++) {
      const i = idx[k]; g2l[s.nr[i]] = k
      raw[3 * k] = s.xyz[3 * i]; raw[3 * k + 1] = s.xyz[3 * i + 1]; raw[3 * k + 2] = s.xyz[3 * i + 2]
      let e = (String(s.name[i]).replace(/^\d+/, '')[0] || 'X').toUpperCase()
      if (!'HCNOSP'.includes(e)) e = 'X'
      el[k] = e
    }
    const [bx, by, bz] = s.box
    const mic = (d: number, L: number) => (L > 0 ? d - L * Math.round(d / L) : d)
    const adj: number[][] = Array.from({ length: n }, () => []), bonds: number[] = []
    for (let i = 0; i < n; i++) {
      const xi = raw[3 * i], yi = raw[3 * i + 1], zi = raw[3 * i + 2], ci = COV[el[i]], hi = el[i] === 'H'
      for (let j = i + 1; j < n; j++) {
        if (hi && el[j] === 'H') continue
        const dx = mic(raw[3 * j] - xi, bx); if (dx > 0.25 || dx < -0.25) continue
        const dy = mic(raw[3 * j + 1] - yi, by); if (dy > 0.25 || dy < -0.25) continue
        const dz = mic(raw[3 * j + 2] - zi, bz); if (dz > 0.25 || dz < -0.25) continue
        const lim = (ci + COV[el[j]]) * 1.2, d2 = dx * dx + dy * dy + dz * dz
        if (d2 < lim * lim && d2 > 0.0016) { bonds.push(i, j); adj[i].push(j); adj[j].push(i) }
      }
    }
    // Connected components, unwrapped across the periodic boundaries.
    const molOf = new Int32Array(n).fill(-1), un = new Float64Array(3 * n), mols: { members: number[] }[] = []
    for (let s0 = 0; s0 < n; s0++) {
      if (molOf[s0] >= 0) continue
      const id = mols.length, members = [s0]; molOf[s0] = id
      un[3 * s0] = raw[3 * s0]; un[3 * s0 + 1] = raw[3 * s0 + 1]; un[3 * s0 + 2] = raw[3 * s0 + 2]
      for (let q = 0; q < members.length; q++) {
        const i = members[q]
        for (const j of adj[i]) {
          if (molOf[j] >= 0) continue
          molOf[j] = id; members.push(j)
          un[3 * j] = un[3 * i] + mic(raw[3 * j] - raw[3 * i], bx)
          un[3 * j + 1] = un[3 * i + 1] + mic(raw[3 * j + 1] - raw[3 * i + 1], by)
          un[3 * j + 2] = un[3 * i + 2] + mic(raw[3 * j + 2] - raw[3 * i + 2], bz)
        }
      }
      mols.push({ members })
    }
    const molLabels = mols.map(g => {
      if (g.members.length < 3) return ''
      const seq: string[] = []; let last: string | null = null
      g.members.slice().sort((p, q) => idx[p] - idx[q]).forEach(k => { const i = idx[k], key = s.resnr[i] + s.resn[i]; if (key !== last) { seq.push(s.resn[i]); last = key } })
      const u = [...new Set(seq)]
      return u.length === 1 ? u[0] + ' × ' + seq.length : u.slice(0, 5).join(' · ') + (u.length > 5 ? ' …' : '')
    })
    let groups: { members: number[] }[]
    if (arrange !== 'frame positions') {
      const score = (g: { members: number[] }) => (g.members.some(k => selNrs.has(s.nr[idx[k]])) ? 0 : g.members.some(k => refNrs.has(s.nr[idx[k]])) ? 1 : 2)
      groups = mols.slice().sort((p, q) => score(p) - score(q) || q.members.length - p.members.length)
    } else groups = [{ members: mols.flatMap(g => g.members) }]
    const local = new Float64Array(3 * n), comp = new Int32Array(n)
    const comps = groups.map((g, gi) => {
      let cx = 0, cy = 0, cz = 0
      g.members.forEach(k => { cx += un[3 * k]; cy += un[3 * k + 1]; cz += un[3 * k + 2] })
      const m = g.members.length; cx /= m; cy /= m; cz /= m
      let R = [1, 0, 0, 0, 1, 0, 0, 0, 1]
      if (m >= 3) {
        const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
        g.members.forEach(k => { const v = [un[3 * k] - cx, un[3 * k + 1] - cy, un[3 * k + 2] - cz]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += v[a] * v[b] })
        const { vals, vecs } = eig3(C)
        const ord = [0, 1, 2].sort((p, q) => vals[q] - vals[p])
        const e1 = [0, 1, 2].map(r => vecs[r][ord[0]]), e2 = [0, 1, 2].map(r => vecs[r][ord[1]])
        const e3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
        R = [...e1, ...e2, ...e3]
      }
      let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity, rmax = 0
      g.members.forEach(k => {
        const vx = un[3 * k] - cx, vy = un[3 * k + 1] - cy, vz = un[3 * k + 2] - cz
        const lx = R[0] * vx + R[1] * vy + R[2] * vz, ly = R[3] * vx + R[4] * vy + R[5] * vz, lz = R[6] * vx + R[7] * vy + R[8] * vz
        local[3 * k] = lx; local[3 * k + 1] = ly; local[3 * k + 2] = lz; comp[k] = gi
        minx = Math.min(minx, lx); maxx = Math.max(maxx, lx); miny = Math.min(miny, ly); maxy = Math.max(maxy, ly)
        rmax = Math.max(rmax, Math.hypot(lx, ly, lz))
      })
      const pad = 0.1
      return { minx: minx - pad, maxx: maxx + pad, miny: miny - pad, maxy: maxy + pad, D: rmax * 4 + 0.6, ox: 0, oy: 0 }
    })
    // Shelf-pack the molecules into rows.
    const gap = 0.45
    const area = comps.reduce((a, c) => a + (c.maxx - c.minx) * (c.maxy - c.miny), 0)
    const W = Math.max(Math.max(...comps.map(c => c.maxx - c.minx)), Math.sqrt(area) * 2.2)
    let cxr = 0, cyr = 0, rowH = 0, totalW = 0
    comps.forEach(c => {
      const w = c.maxx - c.minx, h = c.maxy - c.miny
      if (cxr > 0 && cxr + w > W) { cyr += rowH + gap; cxr = 0; rowH = 0 }
      c.ox = cxr - c.minx; c.oy = -cyr - c.maxy; cxr += w + gap; rowH = Math.max(rowH, h); totalW = Math.max(totalW, cxr - gap)
    })
    const totalH = cyr + rowH
    comps.forEach(c => { c.ox -= totalW / 2; c.oy += totalH / 2 })
    return {
      n, gnr: idx.map(i => s.nr[i]), el, name: idx.map(i => s.name[i]), resn: idx.map(i => s.resn[i]), resnr: idx.map(i => s.resnr[i]),
      local, comp, comps, bonds: Int32Array.from(bonds), g2l, ext: { w: totalW, h: totalH }, nmol: mols.length, molOf, molLabels, truncated, hidden,
    }
  }

  // ---------- the structure view ----------
  const mul = (A: number[], B: number[]) => {
    const o = new Array(9)
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[3 * r + c] = A[3 * r] * B[c] + A[3 * r + 1] * B[3 + c] + A[3 * r + 2] * B[6 + c]
    return o as number[]
  }
  const rotX = (t: number) => { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, -s, 0, s, c] }
  const rotY = (t: number) => { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c] }
  const initRot = () => mul(rotX(-0.32), rotY(0.42))
  function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
  }

  /**
   * A canvas that draws a Mol and answers the pointer: drag rotates, right- or alt-drag pans, the wheel zooms,
   * a double click fits the plotted groups, a click on a group's atom picks it (⌘, ctrl or shift: adds it); where
   * several references are shown (morphed RDFs), a click on a reference's atom picks that reference the same way.
   */
  function structureView(canvas: HTMLCanvasElement, wrap: HTMLElement, cb: { hover: (h: AtomHover | null) => void; pick: (sel: number, add: boolean) => void; pickRef?: (ref: number, add: boolean) => void }) {
    const cam = { M: initRot(), zoom: 1, panX: 0, panY: 0 }
    let st: SceneState | null = null, cw = 0, ch = 0, dpr = 1, fitScale = 0
    let P: Float64Array | null = null, hitR = new Float32Array(0), vis = new Uint8Array(0)
    let memb: { groupOf: Int16Array; ref: Uint8Array; refOwner: Int8Array; groupAtoms: number[][]; refAtoms: number[][] } | null = null
    let hoverAtom = -1, camRaf = 0, fadeRaf = 0
    let drag: { sx: number; sy: number; x: number; y: number; moved: boolean; pan: boolean } | null = null
    let fade: { img: HTMLCanvasElement; t0: number; dur: number } | null = null

    const cy0 = () => ch / 2 - 14
    function fit() { const mol = st && st.mol; if (!mol || !cw) return; fitScale = Math.min(cw / (mol.ext.w + 0.5), (ch - 60) / (mol.ext.h + 0.7)) }
    function membership() {
      if (memb || !st || !st.mol) return memb
      const mol = st.mol, n = mol.n, L = mol.g2l, at = (nr: number) => (nr > 0 && nr < L.length ? L[nr] : -1)
      const groupOf = new Int16Array(n).fill(-1), ref = new Uint8Array(n), refOwner = new Int8Array(n).fill(-1)
      const groupAtoms = st.sels.map(() => [] as number[]), refAtoms = st.refs.map(() => [] as number[])
      st.sels.forEach((g, si) => g.atoms.forEach(nr => { const l = at(nr); if (l >= 0 && groupOf[l] < 0) { groupOf[l] = si; groupAtoms[si].push(l) } }))
      st.refs.forEach((r, ri) => r.atoms.forEach(nr => { const l = at(nr); if (l < 0) return; refAtoms[ri].push(l); if (!ref[l]) { ref[l] = ri === 0 ? 1 : 2; refOwner[l] = ri } }))
      return (memb = { groupOf, ref, refOwner, groupAtoms, refAtoms })
    }

    function draw() {
      const ctx = canvas.getContext('2d'); if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cw, ch)
      drawScene(ctx, cw, ch)
      drawFade(ctx)
    }
    function snapFade() {
      if (!canvas.width || !st || !st.mol) return
      const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height
      const cx = c.getContext('2d'); if (!cx) return
      cx.drawImage(canvas, 0, 0)
      fade = { img: c, t0: 0, dur: 200 }
      cancelAnimationFrame(fadeRaf)
      const step = () => { if (!fade) return; draw(); if (fade) fadeRaf = requestAnimationFrame(step) }
      fadeRaf = requestAnimationFrame(step)
    }
    function drawFade(ctx: CanvasRenderingContext2D) {
      const f = fade; if (!f) return
      const now = performance.now(); if (!f.t0) f.t0 = now
      const t = Math.min(1, (now - f.t0) / f.dur), e = 1 - Math.pow(1 - t, 3)
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = 'rgba(0,0,0,' + (0.15 + 0.85 * e) + ')'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 - e
      const sc = 1 - 0.05 * e, W = canvas.width, H = canvas.height
      ctx.drawImage(f.img, (W * (1 - sc)) / 2, (H * (1 - sc)) / 2, W * sc, H * sc)
      ctx.restore()
      if (t >= 1) fade = null
    }

    function drawScene(ctx: CanvasRenderingContext2D, w: number, h: number) {
      if (!st || !st.mol || !w || !fitScale) return
      const mol = st.mol, th = st.pal, T = th.hues, BG = th.card, rep = st.rep, TAU = Math.PI * 2
      const M = cam.M, s = fitScale * cam.zoom, cx = w / 2 + cam.panX, cy = cy0() + cam.panY, n = mol.n
      if (!P || P.length !== 4 * n) { P = new Float64Array(4 * n); hitR = new Float32Array(n); vis = new Uint8Array(n) }
      let zmin = Infinity, zmax = -Infinity
      for (let k = 0; k < n; k++) {
        const c = mol.comps[mol.comp[k]], lx = mol.local[3 * k], ly = mol.local[3 * k + 1], lz = mol.local[3 * k + 2]
        const px = M[0] * lx + M[1] * ly + M[2] * lz, py = M[3] * lx + M[4] * ly + M[5] * lz, pz = M[6] * lx + M[7] * ly + M[8] * lz
        const f = c.D / (c.D - pz)
        P[4 * k] = cx + (c.ox + px * f) * s; P[4 * k + 1] = cy - (c.oy + py * f) * s; P[4 * k + 2] = pz; P[4 * k + 3] = f
        if (pz < zmin) zmin = pz
        if (pz > zmax) zmax = pz
      }
      const mb = membership()!, sels = st.sels, selIdx = new Set(st.selected)
      const refOff = (ri: number) => ri >= 0 && st!.refs[ri] != null && st!.refs[ri].on === false
      const rest = selIdx.size ? st.rest : 'tinted', restB = rest === 'tinted' ? 0 : 0.5
      const hovSi = st.hoverSel, hovRef = st.hoverRef
      const R = RADS[rep] || RADS['ball & stick'], BW = BONDW[rep] ?? 0.016
      const kind = new Uint8Array(n), fill: string[] = new Array(n), rim: string[] = new Array(n), lw = new Float32Array(n), bcol: string[] = new Array(n)
      for (let k = 0; k < n; k++) {
        const e = mol.el[k], si = mb.groupOf[k], rk = mb.ref[k], isRef = rk > 0
        const sel = si >= 0 && selIdx.has(si), prev = si >= 0 && si === hovSi && !sel
        if (e === 'H' && !st.hydrogens && !sel && !prev && !isRef) { vis[k] = 0; hitR[k] = 0; continue }
        vis[k] = 1; let rs = 1
        if (isRef) { kind[k] = 3; fill[k] = refOff(mb.refOwner[k]) ? mix(th.fg, th.card, 0.78) : rk === 2 ? mix(th.fg, th.card, 0.3) : th.fg; rim[k] = th.bg; lw[k] = 1; rs = 1.06; bcol[k] = th.bond }
        else if (sel) { const t = T[sels[si].tone]; kind[k] = 2; fill[k] = t.base; rim[k] = t.strong; lw[k] = 2; rs = rep === 'spacefill' ? 1.03 : 1.25; bcol[k] = t.strong }
        else if (prev) { const t = T[sels[si].tone]; kind[k] = 4; fill[k] = t.soft; rim[k] = t.strong; lw[k] = 1.6; rs = 1.12; bcol[k] = t.strong }
        else if (si >= 0 && rest === 'tinted') { const t = T[sels[si].tone]; kind[k] = 1; fill[k] = t.soft; rim[k] = t.strong; lw[k] = 1.1; bcol[k] = th.bond }
        else { kind[k] = 0; fill[k] = th.neutral[e]; rim[k] = mix(fill[k], th.edge, 0.45); lw[k] = 1; bcol[k] = th.bond; if (rest === 'ghost') rs = 0.7 }
        hitR[k] = Math.max(1.5, R[e] * s * P[4 * k + 3] * rs)
      }
      const ghost = (k: number) => rest === 'ghost' && kind[k] === 0
      const blend = (k: number, fog: number) => (kind[k] >= 2 ? fog * 0.35 : kind[k] === 1 ? fog : 1 - (1 - restB) * (1 - fog))
      const items: [number, number][] = []
      for (let k = 0; k < n; k++) if (vis[k]) items.push([P[4 * k + 2], k])
      if (BW > 0) for (let b = 0; b < mol.bonds.length / 2; b++) { const i = mol.bonds[2 * b], j = mol.bonds[2 * b + 1]; if (vis[i] && vis[j]) items.push([(P[4 * i + 2] + P[4 * j + 2]) / 2 - 0.02, -1 - b]) }
      items.sort((p, q) => p[0] - q[0])
      const zr = zmax - zmin || 1
      ctx.lineCap = 'round'
      for (let t = 0; t < items.length; t++) {
        const z = items[t][0], id = items[t][1], fog = Math.min(0.5, ((zmax - z) / zr) * 0.5)
        if (id < 0) {
          const b = -1 - id, i = mol.bonds[2 * b], j = mol.bonds[2 * b + 1]
          const mx = (P[4 * i] + P[4 * j]) / 2, my = (P[4 * i + 1] + P[4 * j + 1]) / 2, f = (P[4 * i + 3] + P[4 * j + 3]) / 2
          for (const k of [i, j]) {
            let wd = BW * s * f
            if (kind[k] === 2) wd *= rep === 'licorice' ? 1.25 : 1.6
            if (ghost(k)) wd *= 0.6
            ctx.globalAlpha = ghost(k) ? 0.45 : 1
            ctx.strokeStyle = mix(rep === 'licorice' ? fill[k] : bcol[k], BG, blend(k, fog))
            ctx.lineWidth = Math.max(1, wd)
            ctx.beginPath(); ctx.moveTo(P[4 * k], P[4 * k + 1]); ctx.lineTo(mx, my); ctx.stroke()
          }
          ctx.globalAlpha = 1
          continue
        }
        const k = id, x = P[4 * k], y = P[4 * k + 1], r = hitR[k], kd = kind[k], bl = blend(k, fog)
        ctx.globalAlpha = ghost(k) ? 0.45 : 1
        if (kd === 2) {
          const hr = r * (rep === 'spacefill' ? 1.45 : 2.2)
          const g = ctx.createRadialGradient(x, y, r * 0.8, x, y, hr)
          g.addColorStop(0, rgba(rim[k], 0.5 * (1 - fog))); g.addColorStop(1, rgba(rim[k], 0))
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, hr, 0, TAU); ctx.fill()
        }
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU)
        ctx.fillStyle = mix(fill[k], BG, bl); ctx.fill()
        if (rep !== 'licorice' || kd >= 2) { ctx.lineWidth = lw[k]; ctx.strokeStyle = mix(rim[k], BG, bl); ctx.stroke() }
        if (r > 3 && !ghost(k)) { ctx.beginPath(); ctx.arc(x - r * 0.32, y - r * 0.34, r * 0.3, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,' + th.hl * (1 - bl) + ')'; ctx.fill() }
        if (kd === 3) { const off = refOff(mb.refOwner[k]); if (mb.ref[k] === 2 || off) ctx.setLineDash([3, 2]); ctx.beginPath(); ctx.arc(x, y, r + 2.4, 0, TAU); ctx.lineWidth = 1.2; ctx.strokeStyle = mix(th.fg, BG, off ? 0.55 : fog * 0.5); ctx.stroke(); ctx.setLineDash([]) }
        const ringed = k === hoverAtom || (kd === 3 && hovRef >= 0 && mb.refOwner[k] === hovRef) || (kd === 2 && mb.groupOf[k] === hovSi)
        if (ringed) { ctx.beginPath(); ctx.arc(x, y, r + 3.5, 0, TAU); ctx.lineWidth = 1.5; ctx.strokeStyle = th.fg; ctx.stroke() }
        ctx.globalAlpha = 1
      }
      ctx.globalAlpha = 0.24
      for (let k = 0; k < n; k++) if (vis[k] && kind[k] === 2) { ctx.beginPath(); ctx.arc(P[4 * k], P[4 * k + 1], hitR[k] * 0.8, 0, TAU); ctx.fillStyle = fill[k]; ctx.fill() }
      ctx.globalAlpha = 1
      if (!st.labels) return
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.font = '400 11px mononoki, ui-monospace, monospace'; ctx.fillStyle = th.muted
      const bb: Record<number, { x0: number; x1: number; y1: number }> = {}
      for (let k = 0; k < n; k++) {
        if (!vis[k]) continue
        const m = mol.molOf[k], r = hitR[k]
        const q = bb[m] || (bb[m] = { x0: Infinity, x1: -Infinity, y1: -Infinity })
        q.x0 = Math.min(q.x0, P[4 * k] - r); q.x1 = Math.max(q.x1, P[4 * k] + r); q.y1 = Math.max(q.y1, P[4 * k + 1] + r)
      }
      Object.keys(bb).forEach(key => { const m = +key, lab = mol.molLabels[m]; if (lab) ctx.fillText(lab, (bb[m].x0 + bb[m].x1) / 2, Math.min(h - 44, bb[m].y1 + 16)) })
      ctx.font = '700 11px mononoki, ui-monospace, monospace'
      const placed: { x: number; y: number; w: number; h: number }[] = []
      const callout = (atoms: number[], text: string, bg: string, fgc: string, line: string, dashed: boolean) => {
        let top = -1, ty = Infinity
        atoms.forEach(k => { if (!vis[k]) return; const yy = P![4 * k + 1] - hitR[k]; if (yy < ty) { ty = yy; top = k } })
        if (top < 0) return
        const ax = P![4 * top], pw = ctx.measureText(text).width + 16, ph = 20
        let px = Math.min(Math.max(4, ax - pw / 2), w - 4 - pw), py = ty - 16 - ph, guard = 0
        const clash = () => placed.some(q => px < q.x + q.w + 4 && px + pw + 4 > q.x && py < q.y + q.h + 3 && py + ph + 3 > q.y)
        while (guard++ < 30 && clash()) py -= ph + 4
        py = Math.max(4, py)
        placed.push({ x: px, y: py, w: pw, h: ph })
        ctx.strokeStyle = line; ctx.lineWidth = 1
        if (dashed) ctx.setLineDash([3, 2])
        ctx.beginPath(); ctx.moveTo(ax, ty - 3); ctx.lineTo(Math.min(Math.max(ax, px + 10), px + pw - 10), py + ph); ctx.stroke()
        rr(ctx, px, py, pw, ph, 10); ctx.fillStyle = bg; ctx.fill()
        if (dashed) { ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]) }
        ctx.fillStyle = fgc; ctx.fillText(text, px + pw / 2, py + ph / 2 + 0.5)
      }
      st.refs.forEach((r, ri) => { if (mb.refAtoms[ri].length) callout(mb.refAtoms[ri], 'ref ' + r.label, ri || r.on === false ? th.card : th.fg, r.on === false ? th.muted : ri ? th.fg : th.bg, r.on === false ? th.border : th.fg, ri > 0 || r.on === false) })
      st.selected.forEach(i => { const g = sels[i]; if (!g) return; const t = T[g.tone]; callout(mb.groupAtoms[i], g.name, t.base, t.fg, t.strong, false) })
      if (hovSi >= 0 && sels[hovSi] && !selIdx.has(hovSi)) { const t = T[sels[hovSi].tone]; callout(mb.groupAtoms[hovSi], sels[hovSi].name, t.soft, t.strong, t.strong, false) }
    }

    function animateCam(to: { zoom: number; panX: number; panY: number }, ms = 380) {
      cancelAnimationFrame(camRaf)
      const from = { zoom: cam.zoom, panX: cam.panX, panY: cam.panY }, t0 = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3)
        cam.zoom = from.zoom + (to.zoom - from.zoom) * e; cam.panX = from.panX + (to.panX - from.panX) * e; cam.panY = from.panY + (to.panY - from.panY) * e
        draw()
        if (t < 1) camRaf = requestAnimationFrame(step)
      }
      camRaf = requestAnimationFrame(step)
    }
    /** Zoom onto the plotted groups (none plotted: the whole view). */
    function fitSel() {
      const mb = membership()
      if (!P || !st || !st.mol || !cw || !mb) return
      let atoms: number[] = []
      st.selected.forEach(i => { atoms = atoms.concat(mb.groupAtoms[i] || []) })
      atoms = atoms.filter(k => vis[k])
      if (!atoms.length) { animateCam({ zoom: 1, panX: 0, panY: 0 }); return }
      const s = fitScale * cam.zoom, cx = cw / 2 + cam.panX, cy = cy0() + cam.panY
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      atoms.forEach(k => { const ux = (P![4 * k] - cx) / s, uy = (P![4 * k + 1] - cy) / s, ur = hitR[k] / s; x0 = Math.min(x0, ux - ur); x1 = Math.max(x1, ux + ur); y0 = Math.min(y0, uy - ur); y1 = Math.max(y1, uy + ur) })
      const z = Math.min(8, Math.max(0.25, Math.min((cw - 160) / Math.max(x1 - x0, 0.3), (ch - 190) / Math.max(y1 - y0, 0.3)) / fitScale))
      const s2 = fitScale * z
      animateCam({ zoom: z, panX: -((x0 + x1) / 2) * s2, panY: -((y0 + y1) / 2) * s2 + 16 })
    }
    function reset() { cam.M = initRot(); animateCam({ zoom: 1, panX: 0, panY: 0 }) }
    function resize() {
      const w = wrap.clientWidth, h = wrap.clientHeight, d = window.devicePixelRatio || 1
      if (!w || !h) return
      cw = w; ch = h; dpr = d
      canvas.width = Math.round(w * d); canvas.height = Math.round(h * d)
      fit(); draw()
    }
    function hit(e: { clientX: number; clientY: number }) {
      if (!P || !st || !st.mol) return -1
      const rect = canvas.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top
      let best = -1, bz = -Infinity
      for (let k = 0; k < st.mol.n; k++) {
        if (!vis[k]) continue
        const dx = x - P[4 * k], dy = y - P[4 * k + 1], r = Math.max(hitR[k], 5)
        if (dx * dx + dy * dy <= r * r && P[4 * k + 2] > bz) { bz = P[4 * k + 2]; best = k }
      }
      return best
    }
    const selOf = (k: number) => { const mb = membership(); return mb && k >= 0 && !mb.ref[k] ? mb.groupOf[k] : -1 }
    const refOf = (k: number) => { const mb = membership(); return mb && k >= 0 && mb.ref[k] ? mb.refOwner[k] : -1 }
    function hoverAt(e: PointerEvent) {
      const k = hit(e), si = selOf(k)
      canvas.style.cursor = si >= 0 || (cb.pickRef && refOf(k) >= 0) ? 'pointer' : 'grab'
      if (k === hoverAtom) return
      hoverAtom = k
      draw()
      if (k < 0 || !st || !st.mol || !P) { cb.hover(null); return }
      const mol = st.mol, mb = membership()!, x = P[4 * k], y = P[4 * k + 1], r = hitR[k]
      let left = x + r + 12
      if (left + 240 > cw - 8) left = x - r - 12 - 240
      cb.hover({ atom: '#' + mol.gnr[k] + ' ' + mol.name[k] + ' · ' + mol.resn[k] + ' ' + mol.resnr[k], sel: si, ref: mb.ref[k] ? mb.refOwner[k] : -1, left: Math.max(8, left), top: Math.max(8, Math.min(ch - 100, y - 30)) })
    }
    const onDown = (e: PointerEvent) => {
      drag = { sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: false, pan: e.button !== 0 || e.altKey }
      try { canvas.setPointerCapture(e.pointerId) } catch { /* capture is a nicety */ }
    }
    const onMove = (e: PointerEvent) => {
      const d = drag
      if (!d) { hoverAt(e); return }
      const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) {
        d.moved = true; canvas.style.cursor = 'grabbing'; cancelAnimationFrame(camRaf)
        if (hoverAtom >= 0) { hoverAtom = -1; cb.hover(null) }
      }
      if (!d.moved) return
      if (d.pan) { cam.panX += dx; cam.panY += dy } else cam.M = mul(rotX(dy * 0.01), mul(rotY(dx * 0.01), cam.M))
      draw()
    }
    const onUp = (e: PointerEvent) => {
      const d = drag; drag = null
      if (d && !d.moved && e.button === 0) {
        const k = hit(e), si = selOf(k), ri = refOf(k), add = e.metaKey || e.ctrlKey || e.shiftKey
        if (si >= 0) cb.pick(si, add)
        else if (ri >= 0 && cb.pickRef) cb.pickRef(ri, add)
      }
      hoverAt(e)
    }
    const onLeave = () => { if (!drag && hoverAtom >= 0) { hoverAtom = -1; draw(); cb.hover(null) } }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); cancelAnimationFrame(camRaf)
      const z = Math.min(12, Math.max(0.25, cam.zoom * Math.exp(-e.deltaY * 0.0015))), kk = z / cam.zoom
      const rect = canvas.getBoundingClientRect(), qx = e.clientX - rect.left, qy = e.clientY - rect.top
      const cx = cw / 2 + cam.panX, cy = cy0() + cam.panY
      cam.panX = qx - (qx - cx) * kk - cw / 2; cam.panY = qy - (qy - cy) * kk - cy0(); cam.zoom = z
      draw()
    }
    const onCtx = (e: Event) => e.preventDefault()
    const onDbl = () => fitSel()
    const events: [string, EventListener, AddEventListenerOptions?][] = [
      ['pointerdown', onDown as EventListener], ['pointermove', onMove as EventListener], ['pointerup', onUp as EventListener], ['pointerleave', onLeave],
      ['wheel', onWheel as EventListener, { passive: false }], ['contextmenu', onCtx], ['dblclick', onDbl],
    ]
    events.forEach(([t, f, o]) => canvas.addEventListener(t, f, o))
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null
    if (ro) ro.observe(wrap)
    resize()

    return {
      /** New state: a new Mol fades the old view out and fits the new one; the rotation is kept. */
      set(next: SceneState) {
        const molChanged = !st || st.mol !== next.mol
        if (molChanged && st && st.mol && next.mol) snapFade()
        if (molChanged) { cam.zoom = 1; cam.panX = 0; cam.panY = 0; P = null; hoverAtom = -1 }
        st = next; memb = null
        if (molChanged) fit()
        draw()
      },
      fit: fitSel,
      reset,
      redraw: draw,
      /** Where the atom with this GROMACS number is drawn, in CSS pixels of the canvas; null if it is not drawn. */
      where(nr: number): { x: number; y: number } | null {
        if (!P || !st || !st.mol) return null
        const k = nr > 0 && nr < st.mol.g2l.length ? st.mol.g2l[nr] : -1
        return k >= 0 && vis[k] ? { x: P[4 * k], y: P[4 * k + 1] } : null
      },
      destroy() {
        events.forEach(([t, f]) => canvas.removeEventListener(t, f))
        if (ro) ro.disconnect()
        cancelAnimationFrame(camRaf); cancelAnimationFrame(fadeRaf)
      },
    }
  }

  // ---------- curves ----------
  /** The same group in another analysis: the same atoms of the same structure, else the same name, else the same place in a list as long. */
  function matchGroup<G extends Group>(g: G, toA: { sels: G[]; struct: string | null }, fromA: { sels: G[]; struct: string | null }): G | null {
    if (toA === fromA) return g
    const key = g.atoms.join(',')
    if (key && toA.struct && toA.struct === fromA.struct) { const hit = toA.sels.find(x => x.atoms.join(',') === key); if (hit) return hit }
    return toA.sels.find(x => x.name === g.name) || (toA.sels.length === fromA.sels.length ? toA.sels[fromA.sels.indexOf(g)] : null) || null
  }

  // ---------- RDFs that differ only in their reference ----------
  /** b differs from a only in its reference: the same structure, and each of a's groups, by its atoms, is a group of b. */
  function sameButReference(a: { struct: string | null; sels: Group[] }, b: { struct: string | null; sels: Group[] }): boolean {
    if (a === b || !a.struct || a.struct !== b.struct || !a.sels.length || a.sels.length !== b.sels.length) return false
    return a.sels.every(g => g.atoms.length > 0 && b.sels.some(x => x.atoms.join(',') === g.atoms.join(',')))
  }
  /**
   * The references plotted after a click on one of `all`: it alone, or with ⌘, ctrl or shift added to or taken from
   * those plotted; a second click on the only one brings them all back, and never none.
   */
  function pickRefs(all: string[], on: string[], id: string, add: boolean): string[] {
    const next = add ? (on.includes(id) ? on.filter(x => x !== id) : all.filter(x => x === id || on.includes(x))) : on.length === 1 && on[0] === id ? all.slice() : [id]
    return next.length ? next : all.slice()
  }
  /** Each reference's name in a legend: its own, with the RDF's label after it when two RDFs name theirs alike. */
  function refLabels(members: { id: string; label: string; ref: { name: string } | null }[]): Record<string, string> {
    const out: Record<string, string> = {}
    members.forEach(m => { if (m.ref) out[m.id] = members.filter(o => o.ref && o.ref.name === m.ref!.name).length > 1 ? m.ref.name + ' · ' + m.label : m.ref.name })
    return out
  }

  /**
   * The curves to draw: each plotted group of `focus` in every analysis of `plotted` (focus first) that has it.
   * By group: the group's hue, lighter for later analyses, a dash per analysis. By job: the analysis's hue,
   * lighter for later groups, a dash per group. Two curves never differ by hue alone.
   */
  function buildCurves(o: { focus: Analysis; plotted: Analysis[]; selected: string[]; colorBy: ColorBy; pal: Palette; tones: Record<string, Tone> }): Curve[] {
    const { focus, plotted, pal } = o, dark = pal.dark, out: Curve[] = [], toneCount: Record<string, number> = {}
    const names = o.selected.filter(n => focus.sels.some(g => g.name === n))
    names.forEach((name, gi) => {
      const g0 = focus.sels.find(g => g.name === name)!, tn = pal.hues[g0.tone]
      const kk = toneCount[g0.tone] || 0; toneCount[g0.tone] = kk + 1
      plotted.forEach((an, mi) => {
        const gg = matchGroup(g0, an, focus)
        if (!gg) return
        let color: string, dash: string
        if (o.colorBy === 'job') {
          const mt = pal.hues[o.tones[an.id] || TONES[mi % TONES.length]], ink = dark ? mt.base : mt.fg
          color = gi === 0 ? mt.strong : mix(mt.strong, ink, Math.min(0.7, 0.35 * gi))
          dash = DASH[gi % DASH.length]
        } else {
          const ink = dark ? tn.base : tn.fg
          color = kk === 0 ? tn.strong : mix(tn.strong, ink, Math.min(0.75, 0.45 * kk))
          if (mi > 0) color = mix(color, ink, Math.min(0.6, 0.3 * mi))
          dash = DASH[mi % DASH.length]
        }
        out.push({ key: an.id + '|' + gg.name + '|' + name, name, source: an.label, analysis: an.id, x: an.x, y: gg.y, color, dash, peak: gg.peak, atoms: gg.atoms.length })
      })
    })
    return out
  }

  // ---------- chart ----------
  function niceTicks(min: number, max: number, count: number) {
    if (min === max) { min -= 1; max += 1 }
    const raw = (max - min) / count, mag = Math.pow(10, Math.floor(Math.log10(raw))), err = raw / mag
    const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag
    const ticks: number[] = []
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(+v.toFixed(10))
    return { ticks, decimals: Math.max(0, -Math.floor(Math.log10(step) + 1e-9)) }
  }
  /** The value of a curve at the grid point nearest r. */
  function valAt(x: number[], y: number[], r: number) {
    const i = Math.max(0, Math.min(x.length - 1, Math.round((r - x[0]) / (x[1] - x[0] || 1))))
    return y[i] || 0
  }
  /** The values under the pointer at r, highest first (equal values keep the curves' order). */
  function hoverRows(curves: Curve[], r: number): { curve: Curve; v: number }[] {
    return curves.map((curve, i) => ({ curve, v: valAt(curve.x, curve.y, r), i })).sort((a, b) => b.v - a.v || a.i - b.i).map(({ curve, v }) => ({ curve, v }))
  }
  /** The grid point under a pointer at `px` from the chart's left edge, or null outside the plot. */
  function hoverX(geom: ChartGeom, px: number): number | null {
    const t = (px - geom.m.l) / geom.iw, X = geom.grid
    if (t < 0 || t > 1 || X.length < 2) return null
    const r0 = geom.x0 + t * (geom.x1 - geom.x0)
    return X[Math.max(0, Math.min(X.length - 1, Math.round((r0 - X[0]) / (X[1] - X[0] || 1))))]
  }

  /**
   * g(r) as an SVG tree: gridlines in `border`, axes in `foreground`, the dashed g = 1 line, each curve in its
   * colour and dash with its highest point dotted and labelled, and at `hover` a rule with a dot on each curve.
   */
  function chart(o: { W: number; H: number; curves: Curve[]; grid: number[]; xlabel: string; ylabel: string; hover: number | null; peaks: boolean; pal: Palette; animate?: boolean }): { tree: VNode; geom: ChartGeom } {
    const th = o.pal, W = o.W, H = o.H, m = { l: 48, r: 20, t: 24, b: 40 }
    const iw = Math.max(20, W - m.l - m.r), ih = Math.max(20, H - m.t - m.b)
    const grid = o.curves.length ? o.curves[0].x : o.grid
    let x0 = grid.length ? grid[0] : 0, x1 = grid.length ? grid[grid.length - 1] : 1
    o.curves.forEach(c => { x0 = Math.min(x0, c.x[0]); x1 = Math.max(x1, c.x[c.x.length - 1]) })
    let ymax = 1
    o.curves.forEach(c => c.y.forEach(v => { if (v > ymax) ymax = v }))
    const y1 = ymax * 1.12
    const sx = (v: number) => m.l + ((v - x0) / (x1 - x0 || 1)) * iw, sy = (v: number) => m.t + ih - (v / y1) * ih
    const xt = niceTicks(x0, x1, Math.max(3, Math.round(iw / 90))), yt = niceTicks(0, y1, Math.max(3, Math.round(ih / 48)))
    const F = 'mononoki, ui-monospace, monospace', BG = th.card, ease = 'cubic-bezier(.2,.7,.2,1)'
    const cap = { fontFamily: F, fontSize: '11px', fill: th.muted }, lab = { fontFamily: F, fontSize: '10px', letterSpacing: '0.12em', fill: th.muted }
    const k: VNode[] = []
    k.push(['text', { key: 'yl', x: 0, y: 10, style: lab }, (o.ylabel || 'g(r)').toUpperCase()])
    xt.ticks.forEach(t => k.push(['line', { key: 'gx' + t, x1: sx(t), x2: sx(t), y1: m.t, y2: m.t + ih, stroke: th.border, strokeWidth: 1 }]))
    yt.ticks.forEach(t => k.push(['line', { key: 'gy' + t, x1: m.l, x2: m.l + iw, y1: sy(t), y2: sy(t), stroke: th.border, strokeWidth: 1 }]))
    if (o.curves.length) k.push(['line', { key: 'one', x1: m.l, x2: m.l + iw, y1: sy(1), y2: sy(1), stroke: th.input, strokeWidth: 1, strokeDasharray: '3 3' }])
    k.push(['path', { key: 'ax', d: 'M' + m.l + ',' + m.t + 'V' + (m.t + ih) + 'H' + (m.l + iw), fill: 'none', stroke: th.fg, strokeWidth: 1.5 }])
    xt.ticks.forEach(t => k.push(['text', { key: 'tx' + t, x: sx(t), y: m.t + ih + 16, textAnchor: 'middle', style: cap }, t.toFixed(xt.decimals)]))
    yt.ticks.forEach(t => k.push(['text', { key: 'ty' + t, x: m.l - 8, y: sy(t) + 4, textAnchor: 'end', style: cap }, t.toFixed(yt.decimals)]))
    k.push(['text', { key: 'xl', x: m.l + iw, y: H - 2, textAnchor: 'end', style: lab }, (o.xlabel || 'r (nm)').toUpperCase()])
    // Peak labels never overlap: one that would is moved up a line or two, else left out (its dot stays, the hover reads it).
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = []
    const labelAt = (x: number, y: number, text: string): number | null => {
      const w = text.length * 6.6 + 2
      for (let up = 0; up < 3; up++) {
        const b = { x0: x + 7, x1: x + 9 + w, y0: y - 19 - up * 13, y1: y - 6 - up * 13 }
        if (b.y0 < 0 || placed.some(q => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0)) continue
        placed.push(b)
        return -8 - up * 13
      }
      return null
    }
    o.curves.forEach(c => {
      const d = c.y.map((v, j) => (j ? 'L' : 'M') + sx(c.x[j]).toFixed(1) + ',' + sy(v).toFixed(1)).join('')
      const g: VNode[] = [['path', { key: 'p', d, fill: 'none', stroke: c.color, strokeWidth: c.hot ? 2.8 : 2, strokeLinejoin: 'round', strokeLinecap: 'round', strokeDasharray: c.dash === 'none' ? undefined : c.dash, style: o.animate ? { d: 'path("' + d + '")', transition: 'd 360ms ' + ease + ', stroke 200ms ease' } : undefined }]]
      if (o.peaks && c.peak) {
        const pk = c.peak, px = sx(pk.r), py = sy(pk.g), text = pk.r.toFixed(3), ty = c.dim ? null : labelAt(px, py, text)
        const mark: VNode = ['g', { key: 'pk', style: { transform: 'translate(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px)', transition: o.animate ? 'transform 360ms ' + ease : undefined } },
          ['circle', { key: 'c', cx: 0, cy: 0, r: 4, fill: c.color }]]
        if (ty != null) mark.push(['text', { key: 't', x: 8, y: ty, style: { fontFamily: F, fontSize: '11px', fill: th.fg, stroke: BG, strokeWidth: '3px', paintOrder: 'stroke', strokeLinejoin: 'round' } }, text])
        g.push(mark)
      }
      k.push(['g', { key: 'c' + c.key, opacity: c.dim ? 0.4 : 1, style: { transition: 'opacity 140ms ease' } }, ...g])
    })
    if (o.hover != null && o.curves.length) {
      const xv = sx(o.hover)
      k.push(['line', { key: 'hl', x1: xv, x2: xv, y1: m.t, y2: m.t + ih, stroke: th.input, strokeWidth: 1 }])
      o.curves.forEach(c => k.push(['circle', { key: 'hd' + c.key, cx: xv, cy: sy(valAt(c.x, c.y, o.hover!)), r: 3.5, fill: c.color, stroke: BG, strokeWidth: 1.5 }]))
    }
    return {
      tree: ['svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': (o.ylabel || 'g(r)') + ' against ' + (o.xlabel || 'r (nm)'), style: { display: 'block', overflow: 'visible' } }, ...k],
      geom: { m, iw, ih, x0, x1, y1, grid },
    }
  }

  // ---------- the exported page ----------
  /** The exported page: each job's structure and g(r), and the comparison graph, from the data the export carries. */
  function mount(root: HTMLElement, data: ExportData) {
    const SVGNS = 'http://www.w3.org/2000/svg'
    let theme = data.theme
    const pals = { light: palette(false, data.tokens.light), dark: palette(true, data.tokens.dark) }
    const pal = () => pals[theme]
    const analyses: Analysis[] = data.analyses.map(a => ({
      id: a.id, kind: 'job', title: a.title, label: a.label, sub: a.sub, x: a.x, xlabel: a.xlabel, ylabel: a.ylabel,
      ref: a.ref ? { name: a.ref.name, atoms: ranges(a.ref.atoms), tone: a.ref.tone } : null,
      sels: a.sels.map(s => ({ name: s.name, atoms: ranges(s.atoms), tone: s.tone, y: s.y, peak: s.peak })), struct: a.struct, structNote: a.structNote,
    }))
    const tones: Record<string, Tone> = {}
    data.analyses.forEach(a => { tones[a.id] = a.tone })
    const mols: Record<string, Mol | null> = {}
    const molOf = (key: string | null) => {
      if (!key || !data.structs[key]) return null
      if (!(key in mols)) {
        const sel = new Set<number>(), ref = new Set<number>()
        analyses.forEach(a => { if (a.struct !== key) return; a.sels.forEach(g => g.atoms.forEach(v => sel.add(v))); if (a.ref) a.ref.atoms.forEach(v => ref.add(v)) })
        mols[key] = buildMol(data.structs[key], sel, ref, data.view.arrange)
      }
      return mols[key]
    }
    const redraws: (() => void)[] = []

    function h(tag: string, attrs?: Record<string, unknown> | null, ...kids: (Node | string | null | undefined | false)[]): HTMLElement {
      const e = document.createElement(tag)
      for (const [k, v] of Object.entries(attrs || {})) {
        if (v == null || v === false) continue
        if (k === 'class') e.className = String(v)
        else if (k === 'style') Object.assign(e.style, v)
        else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
        else e.setAttribute(k, String(v))
      }
      kids.forEach(c => { if (c != null && c !== false) e.append(c) })
      return e
    }
    function svg(n: VNode | string): Node {
      if (typeof n === 'string') return document.createTextNode(n)
      const [tag, attrs, ...kids] = n, e = document.createElementNS(SVGNS, tag)
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || k === 'key') continue
        if (k === 'style') { for (const [sk, sv] of Object.entries(v as Record<string, string>)) if (sv != null) e.style.setProperty(sk.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), String(sv)) }
        else e.setAttribute(k === 'viewBox' || k.startsWith('aria-') ? k : k.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), String(v))
      }
      kids.forEach(c => e.appendChild(svg(c)))
      return e
    }
    const swatch = (color: string, dash: string) => svg(['svg', { width: 22, height: 6, 'aria-hidden': 'true' }, ['line', { x1: 1, x2: 21, y1: 3, y2: 3, stroke: color, strokeWidth: 2.5, strokeLinecap: 'round', strokeDasharray: dash === 'none' ? undefined : dash }]])

    /** A chart that fills its box, redrawn on resize, with a rule and a card of values under the pointer. */
    function chartBox(get: () => { curves: Curve[]; grid: number[]; xlabel: string; ylabel: string }) {
      const box = h('div', { class: 'dc-chart' }), card = h('div', { class: 'dc-hover', hidden: true })
      const wrap = h('div', { class: 'dc-chart-wrap' }, box, card)
      let hover: number | null = null, geom: ChartGeom | null = null
      const render = () => {
        const W = box.clientWidth, H = box.clientHeight
        if (!W || !H) return
        const g = get(), out = chart({ W, H, curves: g.curves, grid: g.grid, xlabel: g.xlabel, ylabel: g.ylabel, hover, peaks: true, pal: pal() })
        geom = out.geom
        box.replaceChildren(svg(out.tree))
        if (hover == null || !g.curves.length) { card.hidden = true; return }
        const xv = geom.m.l + ((hover - geom.x0) / (geom.x1 - geom.x0 || 1)) * geom.iw
        card.hidden = false
        card.style.left = Math.max(0, xv + 294 > W ? xv - 294 : xv + 14) + 'px'
        card.style.top = geom.m.t + 4 + 'px'
        card.replaceChildren(h('div', { class: 'dc-cap' }, (g.ylabel || 'g(r)') + ' at r = ' + hover.toFixed(3) + ' nm'),
          ...hoverRows(g.curves, hover).slice(0, 14).map(({ curve: c, v }) => h('div', { class: 'dc-hrow' }, swatch(c.color, c.dash), h('b', { style: { color: c.color } }, c.name), h('span', { class: 'dc-cap' }, c.source), h('span', null, v.toFixed(2)))),
          ...(g.curves.length > 14 ? [h('div', { class: 'dc-cap' }, '+ ' + (g.curves.length - 14) + ' more')] : []))
      }
      wrap.addEventListener('mousemove', e => {
        if (!geom) return
        const r = hoverX(geom, e.clientX - box.getBoundingClientRect().left)
        if (r !== hover) { hover = r; render() }
      })
      wrap.addEventListener('mouseleave', () => { if (hover != null) { hover = null; render() } })
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(render).observe(box)
      redraws.push(render)
      return { el: wrap, render }
    }

    /** Group chips: a click plots only that group (or clears it), ⌘, ctrl or shift adds or removes it. */
    function pick(list: string[], name: string, add: boolean): string[] {
      if (add) return list.includes(name) ? list.filter(x => x !== name) : [...list, name]
      return list.length === 1 && list[0] === name ? [] : [name]
    }
    function chips(a: Analysis, sel: () => string[], set: (s: string[]) => void, hoverTo: (i: number) => void, many?: { items: () => { id: string; label: string; count: number; on: boolean }[]; pick: (id: string, add: boolean) => void }) {
      const box = h('div', { class: 'dc-chips' })
      const render = () => {
        const s = sel(), T = pal().hues
        box.replaceChildren(
          ...(many ? many.items().map((r, i) => h('button', { type: 'button', class: 'dc-chip dc-ref dc-pick' + (i ? ' dc-alt' : '') + (r.on ? '' : ' dc-off'), 'aria-pressed': r.on ? 'true' : 'false', title: 'click: plot only this reference · ⌘-click: add or remove',
            onclick: (e: MouseEvent) => many.pick(r.id, e.metaKey || e.ctrlKey || e.shiftKey) }, 'ref ' + r.label, h('span', { class: 'dc-n' }, String(r.count || '—'))))
            : a.ref ? [h('span', { class: 'dc-chip dc-ref' }, 'ref ' + a.ref.name, h('span', { class: 'dc-n' }, String(a.ref.atoms.length || '—')))] : []),
          ...a.sels.map((g, i) => {
            const on = s.includes(g.name), t = T[g.tone]
            return h('button', {
              type: 'button', class: 'dc-chip' + (on ? ' dc-on' : ''), 'aria-pressed': on ? 'true' : 'false',
              style: { background: on ? t.base : t.soft, color: on ? t.fg : t.strong },
              onclick: (e: MouseEvent) => set(pick(sel(), g.name, e.metaKey || e.ctrlKey || e.shiftKey)),
              onmouseenter: () => hoverTo(i), onmouseleave: () => hoverTo(-1),
            }, h('span', { class: 'dc-dot', style: { background: on ? t.fg : t.strong } }), g.name, h('span', { class: 'dc-n' }, String(g.atoms.length || '—')))
          }))
      }
      redraws.push(render)
      render()
      return { el: box, render }
    }

    function table(get: () => Curve[]) {
      const box = h('div', { class: 'dc-table' })
      const render = () => {
        const cs = get()
        box.replaceChildren(...(cs.length ? [h('div', { class: 'dc-trow dc-thead' }, h('span'), h('span', null, 'SERIES'), h('span', null, 'SOURCE'), h('span', { class: 'dc-r' }, 'ATOMS'), h('span', { class: 'dc-r' }, 'PEAK R'), h('span', { class: 'dc-r' }, 'PEAK G'))] : []),
          ...cs.map(c => h('div', { class: 'dc-trow' }, swatch(c.color, c.dash), h('b', { style: { color: c.color } }, c.name), h('span', { class: 'dc-cap' }, c.source), h('span', { class: 'dc-r' }, String(c.atoms || '—')), h('span', { class: 'dc-r' }, c.peak ? c.peak.r.toFixed(3) : '—'), h('span', { class: 'dc-r' }, c.peak ? c.peak.g.toFixed(2) : '—'))))
      }
      redraws.push(render)
      return { el: box, render }
    }

    function structureBox(a: Analysis, sel: () => string[], set: (s: string[]) => void, refs: () => { label: string; atoms: number[]; on?: boolean }[], pickRef?: (i: number, add: boolean) => void) {
      const mol = molOf(a.struct)
      if (!mol) return { el: h('div', { class: 'dc-nostruct' }, h('b', null, 'No structure'), h('span', { class: 'dc-cap' }, a.structNote || 'this job came without a structure')), set: () => {} }
      const canvas = h('canvas', { class: 'dc-canvas' }) as HTMLCanvasElement, tip = h('div', { class: 'dc-tip', hidden: true })
      const wrap = h('div', { class: 'dc-struct' }, canvas, tip,
        h('div', { class: 'dc-legend' }, h('span', null, h('i', { class: 'dc-k dc-k-sel' }), 'plotted'), h('span', null, h('i', { class: 'dc-k dc-k-rest' }), 'not plotted'), h('span', null, h('i', { class: 'dc-k dc-k-ref' }), 'reference'),
          h('span', { class: 'dc-grow' }), h('span', null, 'drag rotate · right-drag pan · scroll zoom · double-click fit')))
      let hoverSel = -1
      const view = structureView(canvas, wrap, {
        hover: hv => {
          if (!hv) { tip.hidden = true; return }
          const g = hv.sel >= 0 ? a.sels[hv.sel] : null, r = hv.ref >= 0 ? refs()[hv.ref] : null
          tip.hidden = false; tip.style.left = hv.left + 'px'; tip.style.top = hv.top + 'px'
          tip.replaceChildren(h('div', { class: 'dc-cap' }, hv.atom),
            h('b', { style: { color: g ? pal().hues[g.tone].strong : 'var(--foreground)' } }, g ? g.name + ' · ' + g.atoms.length + ' atoms' : r ? 'reference · ' + r.label : 'not in any group'),
            h('div', { class: 'dc-cap' }, g ? (sel().includes(g.name) ? 'click: remove · ⌘-click: keep the others' : 'click: plot · ⌘-click: add') : r ? (pickRef ? 'click: plot only this one · ⌘-click: add or remove' : 'g(r) is measured from these atoms') : ''))
        },
        pick: (i, add) => set(pick(sel(), a.sels[i].name, add)),
        pickRef,
      })
      const update = () => {
        const s = sel()
        view.set({ mol, pal: pal(), rep: data.view.rep, rest: data.view.rest, labels: data.view.labels, hydrogens: data.view.hydrogens, sels: a.sels, selected: a.sels.flatMap((g, i) => (s.includes(g.name) ? [i] : [])), refs: refs(), hoverSel, hoverRef: -1 })
      }
      redraws.push(update)
      update()
      return { el: wrap, set: (i: number) => { hoverSel = i; update() } }
    }

    function header() {
      const seg = h('div', { class: 'dc-seg', role: 'group', 'aria-label': 'theme' })
      const render = () => seg.replaceChildren(...(['light', 'dark'] as const).map(t => h('button', { type: 'button', class: theme === t ? 'dc-on' : '', 'aria-pressed': theme === t ? 'true' : 'false', onclick: () => { theme = t; document.documentElement.dataset.theme = t; redraws.forEach(f => f()) } }, t)))
      redraws.push(render)
      render()
      return h('header', { class: 'dc-header' }, h('div', { class: 'dc-grow' }, h('h1', null, data.header || '(de)Cypher'),
        h('div', { class: 'dc-cap' }, data.analyses.length + (data.analyses.length === 1 ? ' RDF' : ' RDFs') + ' · exported ' + new Date(data.made).toLocaleString() + ' · ' + data.by)), seg)
    }

    function compareSection(c: NonNullable<ExportData['compare']>) {
      const plotted = c.ids.map(id => analyses.find(a => a.id === id)).filter((a): a is Analysis => !!a)
      const focus = plotted.find(a => a.id === c.focus) || plotted[0]
      if (!focus) return null
      let selected = c.selected.slice(), colorBy = c.colorBy
      const shown: Record<string, 'on' | 'dim' | 'off'> = {}
      const curves = () => buildCurves({ focus, plotted, selected, colorBy, pal: pal(), tones })
      const drawn = () => curves().filter(x => shown[x.key] !== 'off').map(x => ({ ...x, dim: shown[x.key] === 'dim' }))
      const ch = chartBox(() => ({ curves: drawn(), grid: focus.x, xlabel: focus.xlabel, ylabel: focus.ylabel }))
      const legend = h('div', { class: 'dc-chips' })
      const seg = h('div', { class: 'dc-seg', role: 'group', 'aria-label': 'colour by' })
      const NEXT = { on: 'dim', dim: 'off', off: 'on' } as const, WORD = { on: '', dim: ' · dimmed', off: ' · hidden' }
      const render = () => {
        legend.replaceChildren(...curves().map(x => {
          const s = shown[x.key] || 'on'
          return h('button', { type: 'button', class: 'dc-chip dc-curve', style: { opacity: s === 'on' ? '1' : s === 'dim' ? '0.55' : '0.35' }, onclick: () => { shown[x.key] = NEXT[s]; update() } },
            swatch(x.color, x.dash), h('b', { style: { color: x.color } }, x.name), h('span', { class: 'dc-cap' }, x.source + WORD[s]))
        }))
        seg.replaceChildren(...(['group', 'job'] as const).map(v => h('button', { type: 'button', class: colorBy === v ? 'dc-on' : '', onclick: () => { colorBy = v; update() } }, v)))
      }
      const groupChips = chips(focus, () => selected, s => { selected = s; update() }, () => {})
      const update = () => { render(); ch.render(); groupChips.render() }
      redraws.push(render)
      render()
      return h('section', { class: 'dc-card dc-compare' },
        h('div', { class: 'dc-bar' }, h('span', { class: 'dc-label' }, 'ONE GRAPH'), h('span', { class: 'dc-cap' }, plotted.map(a => a.label).join(' · ')), h('span', { class: 'dc-grow' }), h('span', { class: 'dc-label' }, 'COLOR BY'), seg),
        h('div', { class: 'dc-pad' }, ch.el, h('div', { class: 'dc-cap' }, 'click a curve: shown → dimmed → hidden · groups below are matched in every job by their atoms, then their name'), legend, groupChips.el))
    }

    /** One RDF's card; or, for RDFs that differ only in their reference, one card for them all (`morph`), led by the first. */
    function jobSection(members: Analysis[], ea: ExportAnalysis, morph: { title: string; on: string[] } | null) {
      const a = members[0], many = !!morph && members.length > 1, ids = members.map(m => m.id), names = refLabels(members)
      let on = many ? ids.filter(id => morph!.on.includes(id)) : ids
      if (!on.length) on = ids
      let selected = ea.selected.filter(n => a.sels.some(g => g.name === n))
      let hoverSel = -1
      const curves = () => buildCurves({ focus: a, plotted: members, selected, colorBy: 'group', pal: pal(), tones }).filter(c => on.includes(c.analysis)).map(c => {
        const m = members.find(x => x.id === c.analysis)!
        return { ...c, source: m.ref ? 'ref ' + names[m.id] : c.source, dim: hoverSel >= 0 && c.name !== a.sels[hoverSel]?.name }
      })
      const ch = chartBox(() => ({ curves: curves(), grid: a.x, xlabel: a.xlabel, ylabel: a.ylabel }))
      const tb = table(curves)
      const refMembers = members.filter(m => m.ref)
      const refs = () => refMembers.map(m => ({ label: names[m.id], atoms: m.ref!.atoms, on: on.includes(m.id) }))
      let sv: { el: HTMLElement; set: (i: number) => void } | null = null
      const refresh = () => { ch.render(); tb.render(); cp.render(); if (sv) sv.set(hoverSel) }
      const set = (s: string[]) => { selected = s; refresh() }
      const pickRef = (id: string, add: boolean) => { on = pickRefs(ids, on, id, add); refresh() }
      const cp = chips(a, () => selected, set, i => { hoverSel = i; ch.render(); if (sv) sv.set(i) },
        many ? { items: () => refMembers.map(m => ({ id: m.id, label: names[m.id], count: m.ref!.atoms.length, on: on.includes(m.id) })), pick: pickRef } : undefined)
      sv = data.structs && a.struct ? structureBox(a, () => selected, set, refs, many ? (i, add) => pickRef(refMembers[i].id, add) : undefined) : null
      tb.render()
      return h('section', { class: 'dc-card' },
        h('div', { class: 'dc-bar' }, h('h2', null, many ? morph!.title : a.title), h('span', { class: 'dc-cap' }, many ? members.length + ' RDFs · the same groups, each from its own reference' : a.sub)),
        h('div', { class: sv ? 'dc-split' : 'dc-pad' }, sv ? sv.el : null, h('div', { class: 'dc-side' }, ch.el, cp.el, tb.el)))
    }

    document.documentElement.dataset.theme = theme
    const page = h('main', { class: 'dc-page' }, header())
    if (data.compare) { const c = compareSection(data.compare); if (c) page.append(c) }
    // RDFs morphed into one card take the place of the first of them; the others have no card of their own.
    const byId = new Map(analyses.map((a, i) => [a.id, { a, ea: data.analyses[i] }]))
    const morphs = (data.morphs || []).map(m => ({ ...m, members: m.ids.map(id => byId.get(id)?.a).filter((x): x is Analysis => !!x) })).filter(m => m.members.length > 1)
    const joined = new Set(morphs.flatMap(m => m.members))
    analyses.forEach((a, i) => {
      const m = morphs.find(x => x.members[0] === a)
      if (m) page.append(jobSection(m.members, byId.get(a.id)!.ea, m))
      else if (!joined.has(a)) page.append(jobSection([a], data.analyses[i], null))
    })
    root.replaceChildren(page)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => redraws.forEach(f => f()))
  }

  return { TONES, DASH, REPS, RESTS, SOLV, palette, ranges, mix, buildMol, structureView, matchGroup, buildCurves, sameButReference, pickRefs, refLabels, niceTicks, valAt, hoverRows, hoverX, chart, mount }
}

export type Kit = ReturnType<typeof decypherKit>
