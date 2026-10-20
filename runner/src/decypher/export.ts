// The HTML export: one file that opens in any browser with nothing to fetch. It carries the Morpheus tokens of
// both themes, mononoki, the kit's own source text (the same code that draws (de)Cypher) and the data: each
// job's g(r) and groups, its structure without solvent, and the comparison graph as it was. Paths of this
// machine stay out: structures and jobs are named s1, a1….

import { KIT_DATA, kit, toRanges } from '../core/index'
import { decypherKit, type Analysis, type ColorBy, type ExportAnalysis, type ExportData, type Struct, type Tone } from '../core/kit'
import type { ThemeTokens } from '../core/tokens'


/** A structure's atoms without water and ions, at the 3 decimals of a .gro; over 4000, the groups' atoms first. */
export function compactStruct(s: Struct, keep: Set<number>, max = 4000): Struct {
  let idx: number[] = []
  for (let i = 0; i < s.n; i++) if (!kit.SOLV.has(String(s.resn[i]).toUpperCase())) idx.push(i)
  if (idx.length > max) {
    const first = idx.filter(i => keep.has(s.nr[i])).slice(0, max), kept = new Set(first)
    for (const i of idx) { if (first.length >= max) break; if (!kept.has(i)) first.push(i) }
    idx = first.sort((a, b) => a - b)
  }
  const r3 = (v: number) => Math.round(v * 1000) / 1000
  return {
    title: s.title, n: idx.length, nr: idx.map(i => s.nr[i]), resnr: idx.map(i => s.resnr[i]), resn: idx.map(i => s.resn[i]), name: idx.map(i => s.name[i]),
    el: idx.map(i => s.el[i]), xyz: idx.flatMap(i => [r3(s.xyz[3 * i]), r3(s.xyz[3 * i + 1]), r3(s.xyz[3 * i + 2])]), box: s.box, cell: s.cell,
  }
}

export interface ExportInput {
  analyses: Analysis[]
  structs: Record<string, Struct>
  selected: (a: Analysis) => string[]
  tones: Record<string, Tone>
  compare: { ids: string[]; focus: string; selected: string[]; colorBy: ColorBy } | null
  view: ExportData['view']
  theme: 'light' | 'dark'
  /** Both themes' tokens: the page's own. */
  tokens: ThemeTokens
  structures: boolean
  by: string
  made?: string
  /** The page's heading; '(de)Cypher' if left empty. */
  header?: string
  /** A heading of the user's choosing for an RDF's card, by analysis id; the card keeps its own title where there is none. A morphed card takes its first RDF's. */
  titles?: Record<string, string>
  /** RDFs shown as one card (they differ only in their reference), by analysis id: the first leads; `on` are those whose reference is plotted. */
  morphs?: { ids: string[]; on: string[] }[]
}

export const DEFAULT_HEADER = '(de)Cypher'

/**
 * The cards a page has: one per RDF, but RDFs morphed into one (they differ only in their reference) stand as one,
 * at the place of the first of them that is in `analyses`. `on`: the members whose reference is plotted (all if none is).
 */
export function cardsOf(analyses: Analysis[], morphs: { ids: string[]; on: string[] }[]): { lead: Analysis; members: Analysis[]; on: string[] }[] {
  const by = new Map(analyses.map(a => [a.id, a])), joined = new Set<string>()
  const cards = new Map<string, { lead: Analysis; members: Analysis[]; on: string[] }>()
  for (const m of morphs) {
    const members = m.ids.map(x => by.get(x)).filter((a): a is Analysis => !!a && !joined.has(a.id))
    if (members.length < 2) continue
    members.forEach(a => joined.add(a.id))
    const on = members.filter(a => m.on.includes(a.id)).map(a => a.id)
    cards.set(members[0].id, { lead: members[0], members, on: on.length ? on : members.map(a => a.id) })
  }
  return analyses.filter(a => cards.has(a.id) || !joined.has(a.id)).map(a => cards.get(a.id) ?? { lead: a, members: [a], on: [a.id] })
}

/** A card's default heading: the RDF's title; for morphed RDFs, their labels joined. */
export const cardTitle = (members: Analysis[]) => (members.length > 1 ? members.map(m => m.label).join(' + ') : members[0].title)

const round = (v: number, d: number) => +v.toFixed(d)
/** A note without this machine's folders: an absolute path keeps only its last name. */
const scrub = (s: string) => s.replace(/(^|[\s(])(\/[^\s/]+)+\/?/g, (m, pre: string) => pre + (m.slice(pre.length).replace(/\/$/, '').split('/').pop() || ''))

export function exportData(o: ExportInput): ExportData {
  const id = new Map(o.analyses.map((a, i) => [a.id, 'a' + (i + 1)])), sid = new Map<string, string>(), structs: Record<string, Struct> = {}
  if (o.structures) for (const a of o.analyses) {
    if (!a.struct || !o.structs[a.struct] || sid.has(a.struct)) continue
    const key = 's' + (sid.size + 1), keep = new Set<number>()
    o.analyses.filter(b => b.struct === a.struct).forEach(b => [b.ref, ...b.sels].forEach(g => g?.atoms.forEach(v => keep.add(v))))
    sid.set(a.struct, key)
    structs[key] = compactStruct(o.structs[a.struct], keep)
  }
  const chosen = (a: Analysis | undefined) => ((a && o.titles?.[a.id]) ?? '').trim()
  const analyses: ExportAnalysis[] = o.analyses.map(a => ({
    id: id.get(a.id)!, title: chosen(a) || a.title, label: a.label, sub: a.sub, x: a.x.map(v => round(v, 5)), xlabel: a.xlabel, ylabel: a.ylabel,
    ref: a.ref ? { name: a.ref.name, atoms: toRanges(a.ref.atoms), tone: a.ref.tone } : null,
    sels: a.sels.map(g => ({ name: g.name, atoms: toRanges(g.atoms), tone: g.tone, y: g.y.map(v => round(v, 4)), peak: g.peak && { r: round(g.peak.r, 5), g: round(g.peak.g, 4) }, shell: g.shell ? { r: round(g.shell.r, 5), g: round(g.shell.g, 4) } : null, ...(g.colors ? { colors: g.colors } : {}) })),
    struct: a.struct ? sid.get(a.struct) ?? null : null, structNote: scrub(a.structNote), selected: o.selected(a), tone: o.tones[a.id] ?? 'coral', ...(a.plot ? { plot: a.plot } : {}), ...(a.paint ? { paint: a.paint } : {}),
  }))
  const compare = o.compare && o.compare.ids.filter(x => id.has(x)).length > 1
    ? { ids: o.compare.ids.filter(x => id.has(x)).map(x => id.get(x)!), focus: id.get(o.compare.focus) ?? id.get(o.compare.ids[0])!, selected: o.compare.selected, colorBy: o.compare.colorBy }
    : null
  // A morph keeps the RDFs that are in the export, the first of them leading; fewer than two is no morph.
  const morphs = cardsOf(o.analyses, o.morphs ?? []).filter(c => c.members.length > 1)
    .map(c => ({ ids: c.members.map(a => id.get(a.id)!), on: c.on.map(x => id.get(x)!), title: chosen(c.lead) || cardTitle(c.members) }))
  return { header: (o.header ?? '').trim() || DEFAULT_HEADER, made: o.made ?? new Date().toISOString(), by: o.by, theme: o.theme, tokens: o.tokens, structs, analyses, compare, ...(morphs.length ? { morphs } : {}), view: o.view }
}

const CSS = `*{box-sizing:border-box}
html,body{margin:0;background:var(--background);color:var(--foreground);font-family:mononoki,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.5;transition:background-color 160ms ease,color 160ms ease}
::selection{background:var(--primary);color:var(--primary-foreground)}
button{font-family:inherit;color:inherit}
button:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
.dc-page{max-width:1560px;margin:0 auto;padding:0 20px 40px;display:flex;flex-direction:column;gap:16px}
.dc-header{display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid var(--border)}
.dc-header h1{margin:0;font-family:Archivo,ui-sans-serif,system-ui,sans-serif;font-size:22px;line-height:28px;font-weight:800;letter-spacing:-0.01em}
.dc-grow{flex:1;min-width:0}
.dc-cap{font-size:11px;line-height:16px;color:var(--muted-foreground)}
.dc-label{font-size:10px;line-height:14px;letter-spacing:.12em;color:var(--muted-foreground);text-transform:uppercase}
.dc-seg{display:inline-flex;gap:2px;padding:3px;border-radius:10px;border:1px solid var(--border);background:var(--muted)}
.dc-seg button{height:24px;padding:0 10px;border:0;border-radius:7px;background:transparent;font-size:11px;cursor:pointer;transition:background-color 120ms ease}
.dc-seg button:hover{background:color-mix(in srgb,var(--background) 70%,transparent)}
.dc-seg button.dc-on{background:var(--primary);color:var(--primary-foreground);font-weight:700;box-shadow:var(--shadow-raised)}
.dc-card{background:var(--card);border:1px solid var(--border);border-radius:16px;display:flex;flex-direction:column;min-width:0;overflow:hidden}
.dc-bar{display:flex;align-items:center;flex-wrap:wrap;gap:4px 12px;padding:10px 16px;border-bottom:1px solid var(--border)}
.dc-bar h2{margin:0;font-family:Archivo,ui-sans-serif,system-ui,sans-serif;font-size:18px;line-height:24px;font-weight:800}
.dc-pad{padding:12px 16px 16px;display:flex;flex-direction:column;gap:10px;min-width:0}
.dc-split{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))}
.dc-side{padding:12px 16px 16px;display:flex;flex-direction:column;gap:10px;min-width:0}
.dc-struct{position:relative;min-height:460px;border-right:1px solid var(--border)}
.dc-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}
.dc-legend{position:absolute;left:14px;right:14px;bottom:10px;display:flex;flex-wrap:wrap;gap:6px 14px;pointer-events:none;font-size:11px;line-height:16px;color:var(--muted-foreground)}
.dc-legend span{display:inline-flex;align-items:center;gap:7px}
.dc-k{display:inline-block;width:10px;height:10px;border-radius:9999px}
.dc-ramp{display:inline-block;width:112px;height:6px;border-radius:999px}
.dc-k-sel{background:var(--coral);box-shadow:0 0 0 1.5px var(--coral-strong),0 0 9px var(--coral-strong)}
.dc-k-rest{background:var(--stone)}
.dc-k-ref{width:8px;height:8px;background:var(--foreground);box-shadow:0 0 0 1.5px var(--card),0 0 0 2.7px var(--foreground)}
.dc-tip,.dc-hover{position:absolute;z-index:2;pointer-events:none;background:var(--popover);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow-menu);padding:8px 10px;display:flex;flex-direction:column;gap:2px}
.dc-tip{width:240px}
.dc-tip b{font-size:12px}
.dc-hover{width:280px;gap:4px}
.dc-hover[hidden],.dc-tip[hidden]{display:none}
.dc-hrow{display:grid;grid-template-columns:22px minmax(0,1fr) auto auto;gap:7px;align-items:center;font-size:11px;line-height:16px}
.dc-hrow b,.dc-trow b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dc-chart-wrap{position:relative}
.dc-chart{height:320px}
.dc-compare .dc-chart{height:400px}
.dc-chips{display:flex;flex-wrap:wrap;gap:6px}
.dc-chip{height:26px;padding:0 10px;border-radius:9999px;border:0;font-size:11px;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;cursor:pointer;background:transparent;transition:background-color 120ms ease,opacity 120ms ease}
.dc-chip.dc-on{font-weight:700}
.dc-chip.dc-ref{background:transparent;color:var(--foreground);cursor:default;border:1.5px solid var(--foreground)}
.dc-chip.dc-pick{cursor:pointer}
.dc-chip.dc-alt{background:transparent;color:var(--foreground);border-style:dashed}
.dc-chip.dc-off{opacity:.45;background:transparent;color:var(--foreground)}
.dc-chip.dc-curve{border:1px solid var(--border)}
.dc-chip.dc-curve:hover{background:var(--accent)}
.dc-dot{width:7px;height:7px;border-radius:9999px;flex-shrink:0}
.dc-n{opacity:.7}
.dc-table{display:flex;flex-direction:column;gap:2px}
.dc-trow{display:grid;grid-template-columns:26px minmax(0,1fr) minmax(0,1.1fr) 44px 70px 56px;gap:8px;align-items:center;font-size:12px;line-height:16px;min-height:24px}
.dc-trow.dc-plain{grid-template-columns:26px minmax(0,1fr) minmax(0,1.1fr)}
.dc-thead{font-size:10px;letter-spacing:.12em;color:var(--muted-foreground)}
.dc-r{text-align:right}
.dc-nostruct{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:24px;min-height:220px;border-right:1px solid var(--border);text-align:center}
.dc-foot{padding:8px 0;font-size:11px;color:var(--muted-foreground)}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}`

const vars = (t: Record<string, string>) => Object.entries(t).map(([k, v]) => '--' + k + ':' + v).join(';')
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** The whole page: fonts as data, both themes' tokens, the kit's source and the data, inline. */
export function exportHtml(data: ExportData, fonts: Fonts = {}): string {
  const src = decypherKit.toString()
  if (/<\/script/i.test(src)) throw new Error('the kit\'s source holds </script>: it cannot be put inline')
  const face = (b64: string | undefined, weight: number, family = 'mononoki', range = '') => (b64 ? '@font-face{font-family:' + family + ';src:url(data:font/woff2;base64,' + b64 + ') format("woff2");font-weight:' + weight + ';font-style:normal;font-display:swap' + (range ? ';unicode-range:' + range : '') + '}\n' : '')
  const title = data.header && data.header !== DEFAULT_HEADER ? data.header : DEFAULT_HEADER + ' · ' + (data.analyses.length === 1 ? data.analyses[0].title : data.analyses.length + ' RDFs')
  return '<!doctype html>\n<html lang="en" data-theme="' + data.theme + '">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<meta name="generator" content="' + esc(data.by) + ' (de)Cypher">\n<title>' + esc(title) + '</title>\n<style>\n'
    + face(fonts.regular, 400) + face(fonts.bold, 700) + face(fonts.title, 800, 'Archivo', LATIN) + face(fonts.titleExt, 800, 'Archivo', LATIN_EXT)
    + ':root,[data-theme="light"]{' + vars(data.tokens.light) + ';color-scheme:light}\n[data-theme="dark"]{' + vars(data.tokens.dark) + ';color-scheme:dark}\n' + CSS + '\n</style>\n</head>\n<body>\n'
    + '<div id="app"><p style="padding:20px">This page draws with JavaScript: turn it on to see the structures and charts.</p></div>\n'
    + '<script type="application/json" id="dc-data">' + JSON.stringify(data).replace(/</g, '\\u003c') + '</script>\n'
    + '<script>\n(function () {\nvar kit = (' + src + ')(' + JSON.stringify(KIT_DATA).replace(/</g, '\\u003c') + ');\nkit.mount(document.getElementById("app"), JSON.parse(document.getElementById("dc-data").textContent));\n})();\n</script>\n</body>\n</html>\n'
}

/** The page's fonts as base64: mononoki 400 and 700, and Archivo 800 for titles (T160), latin and latin-ext. */
export interface Fonts { regular?: string; bold?: string; title?: string; titleExt?: string }
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'

/** The page's fonts as base64, from its own files; none if they can't be read (the page falls back to a mono and a sans font). */
export async function fontData(): Promise<Fonts> {
  const b64 = async (url: string) => {
    try {
      const r = await fetch(url)
      if (!r.ok) return undefined
      const bytes = new Uint8Array(await r.arrayBuffer())
      let s = ''
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      return btoa(s)
    } catch { return undefined }
  }
  const [regular, bold, title, titleExt] = await Promise.all(['mononoki-latin-400-normal', 'mononoki-latin-700-normal', 'archivo-latin-800-normal', 'archivo-latin-ext-800-normal'].map(f => b64('/fonts/' + f + '.woff2')))
  return { regular, bold, title, titleExt }
}

/** Saves text as a file through the browser's download. */
export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/html;charset=utf-8' })), a = document.createElement('a')
  a.href = url; a.download = name
  document.body.append(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** decypher_3-RDFs_2026-10-13.html, or with the one RDF's label. */
export function exportName(analyses: Analysis[], made = new Date()): string {
  const day = made.toISOString().slice(0, 10)
  const base = analyses.length === 1 ? 'decypher_' + analyses[0].label : 'decypher_' + analyses.length + '-RDFs'
  return (base + '_' + day).replace(/[^\w.+-]+/g, '_') + '.html'
}
