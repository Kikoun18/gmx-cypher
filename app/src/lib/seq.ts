// Sequence-level PMF store: xvg parsing, per-curve correction, persistence and
// every pure store transform the page uses. Nothing here touches React.

import { SACCH, correctCurve, runStats, wellArea } from './pmf';
import type { GmxHeader } from './gmxHeader';
import { curveDisplay } from './storage/records';
import type {
  AnalysisType, Column, Curve, Extra, LitRef, Metric, Page, Run, Seq, Settings, Slot, Store, StructMeta, Table, TagDef, Vis, XvgHead,
} from './types';

export const METRIC_META: Record<Metric, { label: string; unit: string; desc: string }> = {
  area: { label: 'Area', unit: 'kJ·nm/mol', desc: 'Integrated well — depth × width' },
  min: { label: 'Min', unit: 'kJ/mol', desc: 'Deepest point of the PMF well' },
};

/** A new project's run tags: the four former fixed methods, with the same keys and labels. */
export const DEFAULT_TAGS: TagDef[] = [
  { k: 'hmr', label: 'hmr' },
  { k: 'fast', label: 'fast water' },
  { k: 'prosecco75', label: 'prosecco75' },
  { k: 'add', label: 'ADD' },
];

export const getTags = (st: Partial<Settings>): TagDef[] => (Array.isArray(st.tags) ? st.tags : DEFAULT_TAGS);

/** A tag whose key comes from its label (like analysis keys), unique in `list`. Renaming later keeps the key. */
export function newTag(list: TagDef[], label: string): TagDef {
  let k = slug(label), n = 2;
  while (list.some(t => t.k === k)) k = slug(label) + '-' + n++;
  return { k, label };
}

/** How many runs carry tag `k`. */
export const tagUse = (store: Store, k: string) => store.seqs.reduce((n, s) => n + s.runs.filter(r => r.tags.includes(k)).length, 0);

/** The store without tag `k` on any run (a deleted tag, F16). */
export function removeTagData(store: Store, k: string): Store {
  return { ...store, seqs: store.seqs.map(s => (!s.runs.some(r => r.tags.includes(k)) ? s : {
    ...s, runs: s.runs.map(r => (r.tags.includes(k) ? { ...r, tags: r.tags.filter(t => t !== k) } : r)),
  })) };
}

/** Sorted unique tag keys of a run as stored, now or before R2 (`methods: { key: true }` → tagged). */
export function tagsOf(r: { tags?: unknown; methods?: unknown }): string[] {
  const out = new Set(Array.isArray(r.tags) ? r.tags.filter((k): k is string => typeof k === 'string' && !!k) : []);
  if (r.methods && typeof r.methods === 'object') for (const [k, v] of Object.entries(r.methods)) if (v === true) out.add(k);
  return [...out].sort();
}

export const toggleTag = (tags: string[], k: string) => (tags.includes(k) ? tags.filter(t => t !== k) : [...tags, k].sort());

/** Labels in the project's tag order, then keys the list doesn't know (e.g. from an import). */
export function tagLabel(tags: string[], list: TagDef[]): string {
  const known = list.filter(t => tags.includes(t.k)).map(t => t.label), unknown = tags.filter(k => !list.some(t => t.k === k));
  return known.concat(unknown).join(' · ') || 'no tags';
}

export const DEFAULT_TEMP = 310.15;

// Up to ten runs per cell. Slot keys stay letters so older data ('a', 'b') still reads.
export const SLOTS: Slot[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
export const runLabel = (k: string) => 'run ' + (SLOTS.indexOf(k as Slot) + 1 || 1);

const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().slice(0, 10);

// --- columns ---------------------------------------------------------------
// Columns start as the three saccharides but are user-editable. A run's
// `sacch` field holds its column key (kept for backwards compatibility).

export const PALETTE = [
  { dark: '#ff6a4d', light: '#c62410' }, { dark: '#6aa9ff', light: '#1a5fb4' },
  { dark: '#5fc08a', light: '#1a7a4c' }, { dark: '#e0b24a', light: '#8a6100' },
  { dark: '#c28cff', light: '#6b3fb0' }, { dark: '#4fc9c9', light: '#0f7373' },
  { dark: '#ff7fb0', light: '#b0245e' }, { dark: '#b0a79f', light: '#5c5550' },
];

export function getCols(store: Partial<Store> | null): Column[] {
  return store && Array.isArray(store.cols) && store.cols.length ? store.cols : SACCH.map(c => ({ ...c }));
}

const slug = (t: string) => String(t || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'col';

export function newColumn(cols: Column[], label: string, name: string): Column {
  let k = slug(label), n = 2;
  while (cols.some(c => c.k === k)) k = slug(label) + '-' + n++;
  const used = new Set(cols.map(c => c.light));
  const p = PALETTE.find(q => !used.has(q.light)) || PALETTE[cols.length % PALETTE.length];
  const lb = String(label).trim();
  const nm = (name || '').trim() || lb;
  return { k, label: lb.length <= 5 ? lb.toUpperCase() : lb, short: nm, name: nm, light: p.light, dark: p.dark };
}

export function matchCol(cols: Column[], token: string): Column | null {
  const t = String(token || '').trim().toLowerCase();
  if (!t) return null;
  return cols.find(c => c.k === t || c.label.toLowerCase() === t || slug(c.label) === slug(t)) || null;
}

export function addColumn(store: Store, label: string, name: string) {
  const cols = getCols(store);
  const col = newColumn(cols, label, name);
  return { store: { ...store, cols: cols.concat(col) }, col };
}

export function updateColumn(store: Store, k: string, patch: Partial<Column>): Store {
  return { ...store, cols: getCols(store).map(c => (c.k === k ? { ...c, ...patch, short: patch.name != null ? (patch.name || c.label) : c.short } : c)) };
}

export function cycleColour(store: Store, k: string): Store {
  const cols = getCols(store), c = cols.find(q => q.k === k)!;
  const i = PALETTE.findIndex(p => p.light === c.light);
  const p = PALETTE[(i + 1) % PALETTE.length];
  return updateColumn(store, k, { light: p.light, dark: p.dark });
}

const alive = (s: Seq) => s.runs.length > 0 || s.extras.length > 0 || s.structures.length > 0;
const cellKeyOf = (col: string, rowId: string) => col + '_' + rowId;

/** Drop notes / literature keyed by cell whose column or row no longer exists. */
function pruneCells(store: Store): Store {
  const ids = new Set(store.seqs.map(s => s.id)), ks = new Set(getCols(store).map(c => c.k));
  const keep = (key: string) => { const i = key.indexOf('_'); return ks.has(key.slice(0, i)) && ids.has(key.slice(i + 1)); };
  const cell: Record<string, string> = {}, lit: Record<string, LitRef[]> = {}, row: Record<string, string> = {};
  for (const [k, v] of Object.entries(store.notes.cell)) if (keep(k)) cell[k] = v;
  for (const [k, v] of Object.entries(store.lit)) if (keep(k) && v.length) lit[k] = v;
  for (const [k, v] of Object.entries(store.notes.row)) if (ids.has(k)) row[k] = v;
  const pages = store.pages.map(p => {
    const cs = p.cols ? p.cols.filter(k => ks.has(k)) : null;
    return { ...p, rows: p.rows.filter(id => ids.has(id)), cols: cs && cs.length ? cs : null };
  });
  return { ...store, notes: { cell, row }, lit, pages };
}

// Removing a column deletes its runs, cell notes and literature; rows left empty go too.
export function removeColumn(store: Store, k: string): Store {
  const cols = getCols(store).filter(c => c.k !== k);
  const seqs = store.seqs.map(s => ({ ...s, runs: s.runs.filter(r => r.sacch !== k), extras: s.extras.filter(e => e.sacch !== k) })).filter(alive);
  return pruneCells({ ...store, cols, seqs });
}

export function moveColumn(store: Store, k: string, dir: number): Store {
  const cols = getCols(store).slice(), i = cols.findIndex(c => c.k === k), j = i + dir;
  if (i < 0 || j < 0 || j >= cols.length) return store;
  [cols[i], cols[j]] = [cols[j], cols[i]];
  return { ...store, cols };
}

const gOf = (s: Seq) => (s.group || '').trim();

// Swap with the nearest row of the same method in that direction.
export function moveSeq(store: Store, id: string, dir: number): Store {
  const seqs = store.seqs.slice(), i = seqs.findIndex(s => s.id === id);
  if (i < 0) return store;
  const g = gOf(seqs[i]);
  let j = i + dir;
  while (j >= 0 && j < seqs.length && gOf(seqs[j]) !== g) j += dir;
  if (j < 0 || j >= seqs.length) return store;
  [seqs[i], seqs[j]] = [seqs[j], seqs[i]];
  return { ...store, seqs };
}

// Method blocks show in first-appearance order with the unlabelled block last.
export function groupOrder(seqs: Seq[]): string[] {
  const o = [...new Set(seqs.map(gOf))];
  return o.filter(g => g).concat(o.includes('') ? [''] : []);
}

export function moveGroup(store: Store, g: string, dir: number): Store {
  const order = groupOrder(store.seqs), i = order.indexOf(g), j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return store;
  [order[i], order[j]] = [order[j], order[i]];
  return { ...store, seqs: order.flatMap(k => store.seqs.filter(s => gOf(s) === k)) };
}

export function runsInColumn(store: Store, k: string): number {
  return store.seqs.reduce((n, s) => n + s.runs.filter(r => r.sacch === k).length, 0);
}

// --- file-name pattern -----------------------------------------------------

export const DEFAULT_PATTERN = '{method}_{column}_{seq}_t{time}.xvg';
type Field = 'ana' | 'group' | 'col' | 'name' | 'seq' | 'time' | 'run' | 'temp';
const ALIAS: Record<string, Field> = { analysis: 'ana', ana: 'ana', type: 'ana', method: 'group', group: 'group', sugar: 'col', col: 'col', column: 'col', ligand: 'col', name: 'name', seq: 'seq', sequence: 'seq', time: 'time', t: 'time', run: 'run', temp: 'temp' };
export const TOKENS = [
  { t: '{method}', d: 'group header' }, { t: '{column}', d: 'column name' }, { t: '{name}', d: 'row name' },
  { t: '{seq}', d: 'sequence' }, { t: '{time}', d: 'sim. time' }, { t: '{run}', d: '1–10' },
  { t: '{temp}', d: 'temperature' }, { t: '{analysis}', d: 'analysis type' }, { t: '{*}', d: 'ignored' },
];
const stripExt = (n: string) => String(n || '').replace(/\.(xvg|dat|txt)$/i, '');

export type ParsedName = {
  matched: boolean;
  fields: Partial<Record<Field, string>>;
  /** Values that matched a token but can't be read (an unreadable {run}, F5). */
  bad?: Partial<Record<Field, string>>;
};

export function patternFields(pattern: string): Set<Field> {
  const out = new Set<Field>();
  String(pattern || '').replace(/\{([^}]*)\}/g, (_, n: string) => { const a = ALIAS[n.trim().toLowerCase()]; if (a) out.add(a); return ''; });
  return out;
}

const esc = (t: string) => t.replace(/[.*+?^$()|[\]\\]/g, '\\$&');

/**
 * One regex builder for both patterns (F4): case-insensitive, one lazy group per
 * token. For folder paths, tokens never cross "/", `**` is zero or more folders,
 * and the pattern matches the end of the path (implicit leading `**` + "/", F3).
 */
function matchPattern(subject: string, pat: string, folders: boolean): ParsedName {
  const keys: (Field | null)[] = [];
  const tok = folders ? '([^/]+?)' : '(.+?)';
  const STAR: Record<string, string> = { '/**/': '/(?:[^/]+/)*', '**/': '(?:[^/]+/)*', '/**': '(?:/[^/]+)*', '**': '.*' };
  const lit = (t: string) => (folders ? t.split(/(\/?\*\*\/?)/).map(x => STAR[x] || esc(x)).join('') : esc(t));
  let re = '', last = 0;
  pat.replace(/\{([^}]*)\}/g, (m: string, n: string, i: number) => {
    re += lit(pat.slice(last, i)) + tok;
    keys.push(ALIAS[n.trim().toLowerCase()] || null);
    last = i + m.length;
    return m;
  });
  re += lit(pat.slice(last));
  if (!keys.length) return { matched: false, fields: {} };
  const m = new RegExp((folders ? '^(?:.*?/)??' : '^') + re + '$', 'i').exec(subject);
  if (!m) return { matched: false, fields: {} };
  const fields: ParsedName['fields'] = {};
  keys.forEach((k, i) => { if (k && m[i + 1] != null) fields[k] = m[i + 1]; });
  if (fields.run == null) return { matched: true, fields };
  const v = fields.run.trim().toLowerCase(), n = /^\d+$/.test(v) ? parseInt(v, 10) : 0;
  const run = n >= 1 && n <= SLOTS.length ? SLOTS[n - 1] : SLOTS.includes(v as Slot) ? v : null;
  if (run) return { matched: true, fields: { ...fields, run } };
  const { run: raw, ...rest } = fields;
  return { matched: true, fields: rest, bad: { run: raw } };
}

export function parseName(filename: string, pattern: string): ParsedName {
  return matchPattern(stripExt(filename), stripExt(pattern), false);
}

/** The folder part of a path (relative, or a header's working directory) against the path pattern. */
export function parsePath(dir: string, pattern: string): ParsedName {
  const clean = (t: string) => String(t || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return matchPattern(clean(dir), clean(pattern), true);
}

export type FieldSource = 'name' | 'path' | 'header';
export const FIELD_LABEL: Record<Field, string> = { ana: 'analysis', group: 'group', col: 'column', name: 'name', seq: 'sequence', time: 'time', run: 'run', temp: 'temperature' };

/**
 * Fields from several sources, each with where it came from. Values that differ
 * after normalisation are conflicts (except for the header, which only fills): the first value is kept for display, but the
 * file must not be uploaded until the conflict is resolved.
 */
export function mergeFields(sources: [FieldSource, ParsedName | undefined][], norm: (k: Field, v: string) => string = (_k, v) => v.trim().toLowerCase()) {
  const fields: ParsedName['fields'] = {}, from: Partial<Record<Field, FieldSource>> = {}, conflicts: string[] = [];
  for (const [src, p] of sources) {
    if (!p || !p.matched) continue;
    // The header's working directory only fills fields nothing else gave (F6): it never conflicts.
    const fill = src === 'header';
    if (!fill) for (const [k, v] of Object.entries(p.bad || {}) as [Field, string][]) conflicts.push(FIELD_LABEL[k] + ': ' + v + ' (' + src + ') is not a run number 1–' + SLOTS.length);
    for (const [k, v] of Object.entries(p.fields) as [Field, string][]) {
      if (fields[k] == null) { fields[k] = v; from[k] = src; }
      else if (!fill && norm(k, fields[k]!) !== norm(k, v)) conflicts.push(FIELD_LABEL[k] + ': ' + fields[k] + ' (' + from[k] + ') ≠ ' + v + ' (' + src + ')');
    }
  }
  return { fields, from, conflicts };
}

// --- analyses --------------------------------------------------------------
// PMF is fixed (its columns and labels live in Settings → Data & axes). Every
// other analysis is a user-editable definition stored in settings.analyses.

export const DEFAULT_ANALYSES: AnalysisType[] = [
  { k: 'hist', label: 'Histogram', name: 'Umbrella / AWH sampling histograms', xLabel: 'Reaction coordinate (nm)', yLabel: 'Count', xCol: 1, yCols: 'all', xScale: 1, style: 'step', match: 'histogram, histo, umbrella' },
  { k: 'rdf', label: 'RDF', name: 'Radial distribution function', xLabel: 'r (nm)', yLabel: 'g(r)', xCol: 1, yCols: '2', xScale: 1, style: 'line', match: 'rdf, radial' },
  { k: 'rmsd', label: 'RMSD', name: 'Root-mean-square deviation', xLabel: 'Time (ps)', yLabel: 'RMSD (nm)', xCol: 1, yCols: '2', xScale: 1, style: 'line', match: 'rmsd' },
  { k: 'rmsf', label: 'RMSF', name: 'Per-residue fluctuation', xLabel: 'Residue', yLabel: 'RMSF (nm)', xCol: 1, yCols: '2', xScale: 1, style: 'line', match: 'rmsf, fluctuation' },
  { k: 'rg', label: 'Rg', name: 'Radius of gyration', xLabel: 'Time (ps)', yLabel: 'Rg (nm)', xCol: 1, yCols: '2', xScale: 1, style: 'line', match: 'gyrate, gyration, rg' },
  { k: 'hbond', label: 'H-bonds', name: 'Hydrogen bonds', xLabel: 'Time (ps)', yLabel: 'Number', xCol: 1, yCols: '2', xScale: 1, style: 'line', match: 'hbond, hbnum, hydrogen' },
  { k: 'dist', label: 'Distance', name: 'COM distance', xLabel: 'Time (ps)', yLabel: 'Distance (nm)', xCol: 1, yCols: '2', xScale: 1, style: 'line', match: 'distance, pullx' },
  { k: 'energy', label: 'Energy', name: 'Energy terms', xLabel: 'Time (ps)', yLabel: 'kJ/mol', xCol: 1, yCols: 'all', xScale: 1, style: 'line', match: 'energy' },
];

// --- display smoothing ---------------------------------------------------------
// Only what is drawn (and exported as shown) is smoothed; stored curves never change.

export const SMOOTH_LEVELS: { v: number; label: string }[] = [{ v: 0, label: 'off' }, { v: 2, label: 'light' }, { v: 4, label: 'medium' }, { v: 8, label: 'strong' }];
export const smoothOf = (t: AnalysisType): number => (t.smooth != null ? t.smooth : t.k === 'hist' ? 4 : 0);
/** Markers by default on the RDF's first-shell peak and the most flexible residue (RMSF); none elsewhere (F57). */
export const markerOf = (t: AnalysisType): 'max' | 'min' | 'none' => t.marker || (t.k === 'rdf' || t.k === 'rmsf' ? 'max' : 'none');
export const markerLabelOf = (t: AnalysisType): 'none' | 'x' | 'y' => t.markerLabel || 'none';
export const MARKERS = [{ v: 'max' as const, label: 'maximum' }, { v: 'min' as const, label: 'minimum' }, { v: 'none' as const, label: 'none' }];
export const MARKER_LABELS = [{ v: 'none' as const, label: 'none' }, { v: 'x' as const, label: 'x value' }, { v: 'y' as const, label: 'y value' }];
export const smoothLabel = (r: number) => (SMOOTH_LEVELS.find(l => l.v === r) || { label: r + '-point' }).label;

/** A curve's maximum or minimum: null and non-finite points (and points without an x) are skipped, the first wins on ties, and a curve without a finite point has none. */
export function curveExtreme(x: (number | null)[], y: (number | null)[], kind: 'max' | 'min'): { i: number; x: number; y: number } | null {
  let best: { i: number; x: number; y: number } | null = null;
  y.forEach((v, i) => {
    const xv = x[i];
    if (v == null || !isFinite(v) || xv == null || !isFinite(xv)) return;
    if (!best || (kind === 'max' ? v > best.y : v < best.y)) best = { i, x: xv, y: v };
  });
  return best;
}

/** A value for a tile or a marker label: whole numbers from 1000, 2 decimals from 1, else 3 significant digits. */
export const fmtValue = (v: number) => (Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 1 || v === 0 ? v.toFixed(2) : v.toPrecision(3));

/** A marked point on a curve: the dot (with a background halo for analyses), and the value written next to it. */
/** `dim`: its curve is dimmed, so an export draws the label in the curve's pale colour (the screen dims the whole marker). */
export interface Mark { x: number; y: number; halo: boolean; label?: string; dim?: boolean }
/** A marker label near the plot's right edge goes on the left of its dot (screen and exports). */
export const labelLeft = (x: number, plotR: number) => x > plotR - 56;

/** The mark of one drawn curve (x as stored, y as drawn), or none. */
export function curveMark(x: (number | null)[], y: (number | null)[], kind: 'max' | 'min' | 'none', label: 'none' | 'x' | 'y', halo = true): Mark | undefined {
  const e = kind === 'none' ? null : curveExtreme(x, y, kind);
  if (!e) return undefined;
  return { x: e.x, y: e.y, halo, ...(label !== 'none' ? { label: fmtValue(label === 'x' ? e.x : e.y) } : {}) };
}

/** Screen markers: one per series that has a mark, faint with a dimmed curve, none outside the plot. */
export function plotMarkers(series: { k: string; color: string; op: number; mark?: Mark }[], g: ReturnType<typeof buildPlotMulti>) {
  return series.filter(s => s.mark && s.mark.y >= g.lo && s.mark.y <= g.hi)
    .map(s => ({ k: s.k, x: g.sx(s.mark!.x), y: g.sy(s.mark!.y), color: s.color, op: s.op, halo: s.mark!.halo, label: s.mark!.label }));
}

/** Gaussian-weighted moving average over neighbouring points (σ = r points, ±3σ); gaps stay gaps. */
export function smoothY(y: (number | null)[], r: number): (number | null)[] {
  if (!r || y.length < 3) return y;
  const R = Math.ceil(3 * r), w = Array.from({ length: R + 1 }, (_, d) => Math.exp(-(d * d) / (2 * r * r)));
  return y.map((v, i) => {
    if (v == null || !isFinite(v)) return v;
    let s = 0, ws = 0;
    for (let d = -R; d <= R; d++) {
      const u = y[i + d];
      if (u == null || !isFinite(u)) continue;
      s += u * w[Math.abs(d)]; ws += w[Math.abs(d)];
    }
    return ws ? Number((s / ws).toPrecision(6)) : v;
  });
}

export function getAnalyses(st: Partial<Settings> | null): AnalysisType[] {
  const s = st || {};
  const pmf: AnalysisType = { k: 'pmf', label: 'PMF', name: 'AWH free-energy profile', xLabel: s.xLabel || 'Distance (nm)', yLabel: s.yLabel || 'PMF (kJ/mol)', style: 'line', match: 'pmf, awh' };
  return [pmf].concat(Array.isArray(s.analyses) ? s.analyses : DEFAULT_ANALYSES);
}

export function newAnalysis(list: { k: string }[], label: string): AnalysisType {
  let k = slug(label), n = 2;
  while (list.some(a => a.k === k)) k = slug(label) + '-' + n++;
  return { k, label, name: '', xLabel: 'x', yLabel: 'y', xCol: 1, yCols: '2', xScale: 1, style: 'line', match: '' };
}

const kws = (t: AnalysisType) => String(t.match || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean);

export function matchAna(types: AnalysisType[], token: string): AnalysisType | null {
  const t = String(token || '').trim().toLowerCase();
  if (!t) return null;
  return types.find(a => a.k === t || String(a.label).toLowerCase() === t || slug(a.label) === slug(t))
    || types.find(a => kws(a).includes(t)) || null;
}

// The file's own header is better evidence than its name: a gmx awh title
// means PMF, then keywords in the xvg title / y label, then in the file name.
/**
 * Header evidence first (the tool `gmx awh` or title AWH = PMF; then keywords in the
 * title and y label), then file-name keywords. No match: PMF, except for a file from
 * another GROMACS tool, which is unknown (k '') and has to be chosen (F32).
 */
export function detectAna(types: AnalysisType[], filename: string, head: XvgHead | null, tool: string | null = null): { k: string; from: 'header' | 'auto' } {
  const match = (hay: string) => {
    const toks = new Set(hay.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    const hit = (w: string) => toks.has(w) || (w.length >= 4 && hay.toLowerCase().includes(w));
    return types.find(t => t.k !== 'pmf' && kws(t).some(hit));
  };
  if (tool === 'gmx awh' || (head && head.title.trim().toLowerCase() === 'awh')) return { k: 'pmf', from: 'header' };
  const h = head && match([head.title, head.yLabel].join(' '));
  if (h) return { k: h.k, from: 'header' };
  const n = match(stripExt(filename));
  return n ? { k: n.k, from: 'auto' } : tool ? { k: '', from: 'header' } : { k: 'pmf', from: 'auto' };
}

// "2", "2,4", "2-5", "3-" or "all" → 1-based column numbers, x excluded.
export function ySpecCols(spec: string | undefined, n: number, xCol: number): number[] {
  const s = String(spec == null ? '2' : spec).trim().toLowerCase(), out: number[] = [];
  if (!s || s === 'all' || s === '*') { for (let j = 1; j <= n; j++) if (j !== xCol) out.push(j); return out; }
  for (const part of s.split(/[,\s]+/).filter(Boolean)) {
    if (part.includes('-')) {
      const [a, b] = part.split('-');
      for (let j = +(a || 1); j <= Math.min(+(b || n), n); j++) if (j !== xCol) out.push(j);
    } else { const j = parseInt(part, 10); if (j >= 1 && j <= n && j !== xCol) out.push(j); }
  }
  return [...new Set(out)];
}

const cleanLabel = (t: string) => String(t || '').replace(/\\f\{[^}]*\}/g, '').replace(/\\[A-Za-z]/g, '').trim();

// Whole numeric table plus the grace header (title, axis labels, legends).
export function parseTable(text: string): Table {
  const rows: number[][] = [], head: XvgHead = { title: '', xLabel: '', yLabel: '', legends: [] };
  const q = (l: string) => { const m = /"([^"]*)"/.exec(l); return m ? cleanLabel(m[1]) : ''; };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#' || line[0] === '&') continue;
    if (line[0] === '@') {
      const l = line.slice(1).trim();
      if (/^title\b/i.test(l)) head.title = q(l);
      else if (/^xaxis\s+label/i.test(l)) head.xLabel = q(l);
      else if (/^yaxis\s+label/i.test(l)) head.yLabel = q(l);
      else { const m = /^s(\d+)\s+legend/i.exec(l); if (m) head.legends[+m[1]] = q(l); }
      continue;
    }
    const parts = line.split(/\s+/).map(Number);
    if (!isFinite(parts[0])) continue;
    rows.push(parts);
  }
  const n = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const cols = Array.from({ length: n }, (_, j) => rows.map(r => (r[j] === undefined ? NaN : r[j])));
  return { cols, n: rows.length, head };
}

export function pickXY(table: Table, xCol: number, yCol: number) {
  const X = table.cols[xCol - 1], Y = table.cols[yCol - 1];
  if (!X || !Y) throw new Error('no column ' + (X ? yCol : xCol));
  const x: number[] = [], y: number[] = [];
  for (let i = 0; i < X.length; i++) if (isFinite(X[i]) && isFinite(Y[i])) { x.push(X[i]); y.push(Y[i]); }
  if (x.length < 4) throw new Error('no numbers in columns ' + xCol + '/' + yCol);
  return { x, y };
}

/**
 * One curve from a table: rows where x is finite, x multiplied by xScale, both
 * kept to 6 significant digits (non-finite y → null). pickCurves is built on it,
 * and the vault re-derives stored curves with it.
 */
export function curveFromTable(table: Table, xCol: number, yCol: number, xScale: number): { x: (number | null)[]; y: (number | null)[] } {
  const X = table.cols[xCol - 1], Y = table.cols[yCol - 1];
  if (!X) throw new Error('no column ' + xCol);
  if (!Y) throw new Error('no column ' + yCol);
  const sc = Number(xScale) || 1;
  const keep: number[] = [];
  X.forEach((v, i) => { if (isFinite(v)) keep.push(i); });
  if (keep.length < 2) throw new Error('fewer than 2 rows');
  const r = (v: number) => (isFinite(v) ? Number(v.toPrecision(6)) : null);
  return { x: keep.map(i => r(X[i] * sc)), y: keep.map(i => r(Y[i])) };
}

/** A PMF run's arrays from a table: pickXY, rounded to 4 decimals exactly as addRun stores them. */
export function runFromTable(table: Table, xCol: number, yCol: number): { x: number[]; y: number[] } {
  const { x, y } = pickXY(table, xCol, yCol);
  return { x: x.map(v => +v.toFixed(4)), y: y.map(v => +v.toFixed(4)) };
}

/** Every requested y column of a table as one curve each, sharing the x column. With `fileId`, each curve records where it came from (the vault keeps the original). */
export function pickCurves(table: Table, head: XvgHead | null, t: AnalysisType, file: string, fileId?: string): Curve[] {
  const xc = Math.max(1, +(t.xCol || 1)), n = table.cols.length;
  if (!table.cols[xc - 1]) throw new Error('no column ' + xc);
  const idx = ySpecCols(t.yCols, n, xc);
  if (!idx.length) throw new Error('no y column for "' + (t.yCols || '') + '"');
  const sc = Number(t.xScale) || 1;
  return idx.map(j => ({
    id: uid('c'), ...curveFromTable(table, xc, j, sc),
    label: (head && head.legends[j - 1 - xc]) || (idx.length > 1 ? 'col ' + j : stripExt(file) || 'col ' + j),
    file,
    ...(fileId ? { src: { fileId, xCol: xc, yCol: j, xScale: sc } } : {}),
  }));
}

export const slotKey = (rowId: string, sacch: string, run: string) => rowId + '|' + sacch + '|' + run;

// --- xvg -------------------------------------------------------------------

// Curve stats on the corrected curve, at this run's own temperature.
const statsCache = new WeakMap<Run, { corrected: number[]; min: number; at: number; area: number }>();
export function curveStats(run: Run) {
  let s = statsCache.get(run);
  if (!s) {
    const c = correctCurve(run.x, run.y, { temperature: run.temp || DEFAULT_TEMP });
    const rs = runStats(c);
    s = { corrected: c, min: rs.min, at: run.x[rs.at], area: wellArea(run.x, c) };
    statsCache.set(run, s);
  }
  return s;
}

export function runCurve(run: Run, corrected: boolean): number[] {
  return corrected ? curveStats(run).corrected : run.y;
}

export type SkipFn = ((seq: Seq, run: Run) => boolean) | null;

// Cell value = mean of the metric over whichever runs are present.
export function cellValue(seq: Seq, sacchKey: string, metric: Metric, skip: SkipFn): number | null {
  const runs = seq.runs.filter(r => r.sacch === sacchKey && r.state !== 'missing' && !(skip && skip(seq, r)));
  if (!runs.length) return null;
  const vs = runs.map(r => curveStats(r)[metric]);
  return vs.reduce((a, b) => a + b, 0) / vs.length;
}

export function maxMag(seqs: Seq[], metric: Metric, cols: Column[], skip: SkipFn): number {
  let m = 0;
  for (const s of seqs) for (const sc of cols) {
    const v = cellValue(s, sc.k, metric, skip);
    if (v != null) m = Math.max(m, Math.abs(v));
  }
  return m || 1;
}


// --- store -----------------------------------------------------------------

export function emptyStore(): Store { return { seqs: [], cols: getCols(null), notes: { cell: {}, row: {} }, vis: {}, lit: {}, pages: [] }; }

export const DEFAULT_SETTINGS: Settings = {
  parse: true, pattern: DEFAULT_PATTERN, pathPattern: '', xCol: 1, yCol: 2, xLabel: 'Distance (nm)', yLabel: 'PMF (kJ/mol)', temp: '310.15', dark: null, bw: false, rowAll: false, hiddenOut: false,
  laserKey: 'k', laserMode: 'toggle', laserColor: '#ff2a1a', laserSize: 'm', laserTrail: true, compareKey: 'c',
};

// Settings that describe a dataset travel with the project; the rest (theme,
// laser pointer) belong to this browser and apply to every project.
export const PROJECT_KEYS = ['parse', 'pattern', 'pathPattern', 'xCol', 'yCol', 'xLabel', 'yLabel', 'temp', 'rowAll', 'hiddenOut', 'analyses', 'tags'] as const;
const isProjectKey = (k: string) => (PROJECT_KEYS as readonly string[]).includes(k);

export function splitSettings(patch: Partial<Settings>): { project: Partial<Settings>; app: Partial<Settings> } {
  const project: Record<string, unknown> = {}, app: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) (isProjectKey(k) ? project : app)[k] = v;
  return { project: project as Partial<Settings>, app: app as Partial<Settings> };
}

export function mergeSettings(app: Partial<Settings>, project: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...splitSettings(app).app, ...splitSettings(project || {}).project };
}

/** Older extras kept one shared x and a `ys` array; newer ones keep a list of curves. */
type LegacyExtra = Partial<Extra> & { x?: (number | null)[]; ys?: (number | null)[][]; legends?: string[] };
function normExtra(e: LegacyExtra): Extra {
  // Visibility and shade from a file are cleaned like the vault does (curveDisplay).
  const curves = Array.isArray(e.curves) ? e.curves.map(({ vis: _v, shade: _s, ...c }) => ({ ...c, ...curveDisplay({ vis: _v, shade: _s }) }))
    : (e.ys || []).map((y, j) => ({ id: uid('c'), x: e.x || [], y, label: (e.legends && e.legends[j]) || (e.ys!.length > 1 ? 'col ' + (j + 2) : 'col 2'), file: e.file || '' }));
  return { id: e.id || uid('x'), type: e.type || 'pmf', sacch: e.sacch || '', run: (e.run || 'a') as Slot, time: e.time || '', file: e.file || '', added: e.added || today(), curves };
}

function normSeq(s: Partial<Seq>): Seq {
  return {
    id: s.id || uid('s'), group: s.group || '', name: s.name || '', seq: s.seq || '', desc: s.desc || '',
    // Runs from before R2 carry `methods`; they load as tags.
    runs: Array.isArray(s.runs) ? s.runs.map(r => { const { methods: _m, ...rest } = r as Run & { methods?: unknown }; return { ...rest, tags: tagsOf(r) }; }) : [],
    extras: Array.isArray(s.extras) ? s.extras.map(normExtra) : [],
    structures: Array.isArray(s.structures) ? s.structures : [],
  };
}

function normPage(p: Partial<Page>): Page {
  return { id: p.id || uid('pg'), name: (p.name || 'Untitled page').trim() || 'Untitled page', desc: p.desc || '', rows: Array.isArray(p.rows) ? [...new Set(p.rows)] : [], cols: Array.isArray(p.cols) && p.cols.length ? p.cols : null };
}

export function normStore(v: Partial<Store> | null): Store {
  if (!v || !Array.isArray(v.seqs)) return emptyStore();
  const store: Store = {
    seqs: v.seqs.map(normSeq),
    cols: getCols(v),
    notes: { cell: (v.notes && v.notes.cell) || {}, row: (v.notes && v.notes.row) || {} },
    vis: v.vis || {},
    lit: v.lit || {},
    pages: Array.isArray(v.pages) ? v.pages.map(normPage) : [],
  };
  if (v.settings && typeof v.settings === 'object') store.settings = splitSettings(v.settings).project;
  return pruneCells(store);
}

export const seqKey = (name: string, seq: string, group: string) => (group || '').trim().toLowerCase() + '|' + (name || '').trim().toLowerCase() + '|' + (seq || '').trim().toUpperCase();
const rowKey = (s: Seq) => seqKey(s.name, s.seq, s.group);

const cloneSeqs = (store: Store): Seq[] => store.seqs.map(s => ({ ...s, runs: s.runs.slice(), extras: s.extras.slice(), structures: s.structures.slice() }));

export interface RowForm { name: string; seq: string; group: string; desc: string }

// Same method + name + sequence = same row.
function ensureRow(seqs: Seq[], form: RowForm): Seq {
  const key = seqKey(form.name, form.seq, form.group);
  let row = seqs.find(s => rowKey(s) === key);
  if (!row) {
    row = { id: uid('s'), group: (form.group || '').trim(), name: form.name.trim(), seq: (form.seq || '').trim().toUpperCase(), desc: form.desc || '', runs: [], extras: [], structures: [] };
    seqs.push(row);
  }
  if (form.desc && form.desc.trim()) row.desc = form.desc.trim();
  return row;
}

export interface ExtraForm extends RowForm { type: string; sacch: string; run: Slot; time: string; file: string; curves: Curve[]; append?: boolean }

// An analysis attached to a run slot. Same type + column + slot replaces it,
// or — with append — gains the new curves alongside the ones already there.
export function addExtra(store: Store, form: ExtraForm) {
  const seqs = cloneSeqs(store);
  const row = ensureRow(seqs, form);
  const i = row.extras.findIndex(o => o.type === form.type && o.sacch === form.sacch && o.run === form.run);
  if (i >= 0 && form.append) {
    row.extras[i] = { ...row.extras[i], curves: row.extras[i].curves.concat(form.curves) };
  } else {
    const e: Extra = { id: uid('x'), type: form.type, sacch: form.sacch, run: form.run, time: form.time || '', file: form.file || '', added: today(), curves: form.curves };
    if (i >= 0) row.extras[i] = e; else row.extras.push(e);
  }
  return { store: { ...store, seqs }, rowId: row.id, replaced: i >= 0 && !form.append };
}

function mapExtra(store: Store, rowId: string, id: string, f: (e: Extra) => Extra | null): Store {
  const seqs = cloneSeqs(store).map(s => (s.id !== rowId ? s : {
    ...s, extras: s.extras.map(e => (e.id === id ? f(e) : e)).filter((e): e is Extra => !!e && e.curves.length > 0),
  })).filter(alive);
  return { ...store, seqs };
}

export function appendCurves(store: Store, rowId: string, extraId: string, curves: Curve[]): Store {
  return mapExtra(store, rowId, extraId, e => ({ ...e, curves: e.curves.concat(curves) }));
}

export const nextVis = (v: Vis): Vis => (v === 'on' ? 'dim' : v === 'dim' ? 'off' : 'on');
export const VIS: Record<Vis, string> = { on: 'shown', dim: 'dimmed', off: 'hidden' };
/** How a curve is shown (R4c): a hidden run hides all its curves; a dimmed run or curve is dimmed. */
export const curveVis = (runVis: Vis, c: Curve): Vis => (runVis === 'off' || c.vis === 'off' ? 'off' : runVis === 'dim' || c.vis === 'dim' ? 'dim' : 'on');
/** The curves of an analysis that are drawn (and count in markers and tiles): loaded and not hidden. */
export const shownCurves = (e: { curves: Curve[] }, runVis: Vis) =>
  e.curves.map(c => ({ c, vis: curveVis(runVis, c) })).filter(s => !s.c.state && s.vis !== 'off');

export function updateCurve(store: Store, rowId: string, extraId: string, curveId: string, patch: Partial<Curve>): Store {
  return mapExtra(store, rowId, extraId, e => ({ ...e, curves: e.curves.map(c => (c.id === curveId ? { ...c, ...patch } : c)) }));
}

export function deleteCurve(store: Store, rowId: string, extraId: string, curveId: string): Store {
  return mapExtra(store, rowId, extraId, e => ({ ...e, curves: e.curves.filter(c => c.id !== curveId) }));
}

export function moveCurve(store: Store, rowId: string, extraId: string, curveId: string, dir: number): Store {
  return mapExtra(store, rowId, extraId, e => {
    const cs = e.curves.slice(), i = cs.findIndex(c => c.id === curveId), j = i + dir;
    if (i < 0 || j < 0 || j >= cs.length) return e;
    [cs[i], cs[j]] = [cs[j], cs[i]];
    return { ...e, curves: cs };
  });
}

// Move one analysis to another run slot. If that slot already has the same
// analysis, the two swap places.
export function moveExtra(store: Store, rowId: string, id: string, to: { sacch: string; run: Slot }) {
  const seqs = cloneSeqs(store), row = seqs.find(x => x.id === rowId);
  const e = row && row.extras.find(x => x.id === id);
  if (!row || !e || (e.sacch === to.sacch && e.run === to.run)) return { store, swapped: false };
  const other = row.extras.find(x => x.id !== id && x.type === e.type && x.sacch === to.sacch && x.run === to.run);
  row.extras = row.extras.map(x => (x.id === id ? { ...x, sacch: to.sacch, run: to.run } : other && x.id === other.id ? { ...x, sacch: e.sacch, run: e.run } : x));
  return { store: { ...store, seqs }, swapped: !!other };
}

export function deleteExtra(store: Store, rowId: string, id: string): Store {
  const seqs = cloneSeqs(store).map(s => (s.id === rowId ? { ...s, extras: s.extras.filter(e => e.id !== id) } : s)).filter(alive);
  return pruneCells({ ...store, seqs });
}

export function removeAnalysisData(store: Store, type: string): Store {
  return pruneCells({ ...store, seqs: cloneSeqs(store).map(s => ({ ...s, extras: s.extras.filter(e => e.type !== type) })).filter(alive) });
}

export interface RunForm extends RowForm { sacch: string; run: Slot; time: string; temp: string | number; tags: string[]; file: string; x: number[]; y: number[]; src?: Run['src'] }

export function addRun(store: Store, form: RunForm) {
  const seqs = cloneSeqs(store);
  const row = ensureRow(seqs, form);
  const run: Run = {
    id: uid('r'), sacch: form.sacch, run: form.run,
    time: form.time, temp: Number(form.temp) || DEFAULT_TEMP,
    tags: tagsOf(form), file: form.file || '', added: today(),
    x: form.x.map(v => +v.toFixed(4)), y: form.y.map(v => +v.toFixed(4)),
    ...(form.src ? { src: form.src } : {}),
  };
  const i = row.runs.findIndex(r => r.sacch === run.sacch && r.run === run.run);
  if (i >= 0) row.runs[i] = run; else row.runs.push(run);
  return { store: { ...store, seqs }, rowId: row.id, replaced: i >= 0 };
}

// --- batch upload ----------------------------------------------------------

export interface UploadFile {
  id: string;
  file: string;
  /** The picked file itself; the vault stores these bytes unchanged. */
  blob?: Blob;
  /** File ID the original will be stored under (assigned when picked). */
  fileId?: string;
  /** An untracked file already in the vault folder: attaching moves it instead of copying. */
  existingPath?: string;
  /** SHA-256 of the picked file (one read, readLocal). */
  sha256?: string;
  /** Where identical content already is in the project or its trash. */
  sameAs?: string;
  table: Table | null;
  head?: XvgHead;
  /** The parsed GROMACS header (R1a); null = none. */
  gmx?: GmxHeader | null;
  /** Path relative to the chosen or dropped folder, file name included. */
  path?: string;
  err?: string;
  parsed?: ParsedName;
}

export interface UploadForm extends RowForm {
  files: UploadFile[];
  time: string;
  temp: string;
  col: string;
  run: Slot | 'auto';
  parse: boolean;
  tags: string[];
  msg: string;
  err: boolean;
  ana: string;
  keepName?: boolean;
  /** Same analysis + slot already filled: replace it, or add the new curves to it. */
  onClash: 'replace' | 'append';
  /** Files with identical content are left out unless included here (by file id). */
  include?: Record<string, boolean>;
  /** Files in a chosen or dropped folder that were not read (not xvg, dat or txt). */
  skipped?: string[];
  /** Analysis chosen for one file (an unknown one, F32), by file id. */
  anaOf?: Record<string, string>;
}

/** The upload form pre-filled for one cell: that row (name kept, so several files become its next runs) and column. */
export function cellForm(row: Pick<Seq, 'name' | 'seq' | 'desc' | 'group'>, col: string, over: Partial<UploadForm> = {}): Partial<UploadForm> {
  return { name: row.name, seq: row.seq, desc: row.desc, group: row.group || '', col, parse: false, keepName: true, ...over };
}

export interface PlanItem {
  id: string;
  file: string;
  fileId?: string;
  x?: number[];
  y?: number[];
  /** Columns the PMF arrays were read from. */
  xCol?: number;
  yCol?: number;
  curves?: Curve[];
  ana: AnalysisType;
  anaHow: 'file' | 'form' | 'header' | 'auto';
  err: string;
  group: string;
  name: string;
  seq: string;
  col: Column;
  colNew: boolean;
  run: Slot;
  time: string;
  temp: string;
  matched: boolean;
  replaces: boolean;
  appends: boolean;
  dup: boolean;
  /** Identical content: already in the project or trash, or earlier in this batch. Not the same as `dup` (slot taken twice). */
  sameAs?: string;
  /** The GROMACS tool of a file whose analysis couldn't be told (F32); not uploaded until one is chosen. */
  unknown?: string;
  path?: string;
  /** Where each field read from the file came from. */
  from: Partial<Record<Field, FieldSource>>;
  /** Fields the name, path or header disagree on; the file isn't uploaded until they agree. */
  conflicts: string[];
  ok: boolean;
}

/** A fresh upload form. New uploads carry no tags until some are picked (R2c). */
export function blankUploadForm(st: Settings, cols: Column[], over?: Partial<UploadForm>): UploadForm {
  return {
    files: [], name: '', seq: '', group: '', desc: '', time: '', temp: String(st.temp || DEFAULT_TEMP),
    col: cols[0] ? cols[0].k : '', run: 'auto', parse: st.parse !== false, tags: [],
    msg: '', err: false, ana: 'auto', onClash: 'replace', ...over,
  };
}

// The arrays picked from a file's table, kept per table: re-planning (every keystroke in
// the upload form) reuses them instead of copying every curve again.
const picks = new WeakMap<Table, Map<string, unknown>>();
function picked<T>(t: Table, key: string, make: () => T): T {
  let m = picks.get(t);
  if (!m) picks.set(t, (m = new Map()));
  if (!m.has(key)) m.set(key, make());
  return m.get(key) as T;
}

// Resolve every loaded file in an upload to a row, column and run slot.
// File-name fields win when parsing is on; the shared form fills the rest.
// Files that fall back to the shared name get +1, +2… when there are several of
// the same analysis type, so a PMF plus its RDF and histogram land on one row and
// the n-th RDF pairs with the n-th PMF. keepName (form opened from a row) never
// suffixes. In append mode, analysis files that share a slot become extra curves.
export function planBatch(store: Store, form: UploadForm, types: AnalysisType[], st: Settings): PlanItem[] {
  const cols = getCols(store), newCols: Column[] = [];
  const append = form.onClash === 'append';
  types = types && types.length ? types : getAnalyses(st);
  const files = form.files.filter(f => f.table);
  // Name pattern, then path pattern on the folder path, or else on the header's working directory (F6).
  const norm = (k: Field, v: string) => (k === 'col' ? matchCol(cols, v)?.k || v.trim().toLowerCase() : v.trim().toLowerCase());
  const merged = new Map(files.map(f => {
    const dir = (f.path || '').replace(/\\/g, '/').split('/').slice(0, -1).join('/');
    const path: [FieldSource, ParsedName] | null = !st.pathPattern ? null : dir ? ['path', parsePath(dir, st.pathPattern)]
      : f.gmx?.workdir ? ['header', parsePath(f.gmx.workdir, st.pathPattern)] : null;
    return [f.id, { ...mergeFields(form.parse ? [['name', f.parsed], ...(path ? [path] : [])] : [], norm), matched: !!(f.parsed?.matched || path?.[1].matched) }];
  }));
  const pf = (f: UploadFile) => merged.get(f.id)!.fields;
  const resolve = (f: UploadFile): { ana: AnalysisType; anaHow: PlanItem['anaHow']; unknown?: string } => {
    const p = pf(f);
    if (p.ana) { const a = matchAna(types, p.ana); if (a) return { ana: a, anaHow: 'file' }; }
    const own = form.anaOf && types.find(t => t.k === form.anaOf![f.id]);
    if (own) return { ana: own, anaHow: 'form' };
    if (form.ana && form.ana !== 'auto') { const a = types.find(t => t.k === form.ana); if (a) return { ana: a, anaHow: 'form' }; }
    const d = detectAna(types, f.file, f.head || null, f.gmx?.tool);
    if (!d.k) return { ana: types.find(t => t.k === 'pmf') || types[0], anaHow: d.from, unknown: f.gmx!.tool! };
    return { ana: types.find(t => t.k === d.k) || types[0], anaHow: d.from };
  };
  const res = files.map(resolve);
  const sharedBy: Record<string, number> = {}, kBy: Record<string, number> = {};
  files.forEach((f, i) => {
    const k = res[i].ana.k;
    if (!res[i].unknown && !pf(f).name && !pf(f).seq && !(append && k !== 'pmf')) sharedBy[k] = (sharedBy[k] || 0) + 1;
  });
  const taken: Record<string, Set<Slot>> = {}, hashed = new Map<string, string>();
  return files.map((f, fi) => {
    const sameAs = f.sameAs || (f.sha256 && hashed.has(f.sha256) ? 'Identical to ' + hashed.get(f.sha256) + ' in this upload' : undefined);
    if (f.sha256 && !hashed.has(f.sha256)) hashed.set(f.sha256, f.file);
    const p = pf(f);
    const { ana, anaHow, unknown } = res[fi];
    const isPmf = ana.k === 'pmf';
    let data: { x?: number[]; y?: number[]; xCol?: number; yCol?: number; curves?: Curve[] } | null = null, err = '';
    const xc = +st.xCol || 1, yc = +st.yCol || 2;
    if (!unknown) try { data = isPmf ? picked(f.table!, 'xy:' + xc + ':' + yc, () => ({ ...pickXY(f.table!, xc, yc), xCol: xc, yCol: yc }))
      : picked(f.table!, JSON.stringify([ana, f.file, f.fileId]), () => ({ curves: pickCurves(f.table!, f.head || null, ana, f.file, f.fileId) })); }
    catch (e) { err = String((e as Error).message || e); }
    // A parsed sequence doubles as the row name when the pattern has no {name}.
    let name = (p.name || p.seq || '').trim();
    if (!name && unknown) name = (form.name || '').trim();
    if (!name) {
      const k = (kBy[ana.k] = (kBy[ana.k] || 0) + 1);
      name = (form.name || '').trim() + (!form.keepName && sharedBy[ana.k] > 1 && form.name.trim() ? '+' + k : '');
    }
    const group = (p.group != null ? p.group : form.group || '').trim();
    const seq = (p.seq || form.seq || '').trim().toUpperCase();
    let col: Column | null = null, colNew = false;
    if (p.col) {
      col = matchCol(cols.concat(newCols), p.col);
      if (!col) { col = newColumn(cols.concat(newCols), p.col, ''); newCols.push(col); colNew = true; }
    }
    if (!col) col = cols.find(c => c.k === form.col) || cols[0];
    const key = seqKey(name, seq, group) + '#' + col.k + '#' + ana.k;
    const row = store.seqs.find(s => rowKey(s) === seqKey(name, seq, group));
    const have: Slot[] = !row ? [] : isPmf ? row.runs.filter(r => r.sacch === col!.k).map(r => r.run)
      : row.extras.filter(e => e.type === ana.k && e.sacch === col!.k).map(e => e.run);
    const batch = taken[key] || (taken[key] = new Set());
    let run: Slot | null = (p.run as Slot) || (form.run === 'auto' ? null : form.run);
    const joins = append && !isPmf;
    if (!run && joins) run = have[0] || [...batch][0] || null;
    if (!run) run = SLOTS.find(s => !have.includes(s) && !batch.has(s)) || 'a';
    const dup = batch.has(run) && !joins;
    const inBatch = batch.has(run);
    if (!unknown) batch.add(run);
    const fills = have.includes(run) || (joins && inBatch);
    return {
      id: f.id, file: f.file, fileId: f.fileId, ...(data || {}), ana, anaHow, err, group, name, seq, col, colNew, run,
      time: p.time != null ? p.time : form.time, temp: p.temp || form.temp,
      matched: merged.get(f.id)!.matched, path: f.path, from: merged.get(f.id)!.from, conflicts: merged.get(f.id)!.conflicts,
      replaces: have.includes(run) && !joins, appends: fills && joins,
      dup, sameAs, unknown, ok: !!name && !dup && !err && !!data && !merged.get(f.id)!.conflicts.length && (!sameAs || !!(form.include && form.include[f.id])),
    };
  });
}

export function addBatch(store: Store, form: UploadForm, plan: PlanItem[]) {
  let next = store, last: { rowId: string; col: string } | null = null, n = 0;
  const touched = new Set<string>(), usedCols = new Set<string>();
  for (const it of plan) {
    if (!it.ok) continue;
    const cols = getCols(next);
    if (!cols.some(c => c.k === it.col.k)) next = { ...next, cols: cols.concat(it.col) };
    const common = { name: it.name, seq: it.seq, group: it.group, desc: form.desc, file: it.file, sacch: it.col.k, run: it.run, time: it.time };
    const r = it.ana.k === 'pmf'
      ? addRun(next, { ...common, tags: form.tags, x: it.x!, y: it.y!, temp: it.temp, ...(it.fileId ? { src: { fileId: it.fileId, xCol: it.xCol!, yCol: it.yCol! } } : {}) })
      : addExtra(next, { ...common, type: it.ana.k, curves: it.curves!, append: form.onClash === 'append' });
    next = r.store; last = { rowId: r.rowId, col: it.col.k }; n++;
    touched.add(r.rowId); usedCols.add(it.col.k);
  }
  return { store: next, last, count: n, touched: [...touched], cols: [...usedCols] };
}

// --- cells and rows --------------------------------------------------------

// Renumber the runs of one cell. map = { oldSlot: newSlot }, a permutation;
// analyses and visibility follow their run.
export function remapRuns(store: Store, rowId: string, col: string, map: Record<string, Slot>): Store {
  const ks = Object.keys(map || {}).filter(k => map[k] && map[k] !== k);
  if (!ks.length) return store;
  const to = (k: Slot): Slot => (map[k] && map[k] !== k ? map[k] : k);
  const seqs = cloneSeqs(store).map(x => (x.id !== rowId ? x : {
    ...x,
    runs: x.runs.map(r => (r.sacch === col ? { ...r, run: to(r.run) } : r)),
    extras: x.extras.map(e => (e.sacch === col ? { ...e, run: to(e.run) } : e)),
  }));
  const vis = { ...store.vis }, keep: Record<string, Store['vis'][string]> = {};
  for (const k of Object.keys(map)) { const o = slotKey(rowId, col, k); if (vis[o]) keep[to(k as Slot)] = vis[o]; delete vis[o]; }
  for (const n of Object.keys(keep)) vis[slotKey(rowId, col, n)] = keep[n];
  return { ...store, seqs, vis };
}

// Move every run and analysis of one cell to another column. Slots already used
// in the target shift the moving runs to the next free slots; their analyses,
// visibility, the cell note and the cell's literature follow.
export function moveCell(store: Store, rowId: string, from: string, to: string) {
  if (from === to) return { store, moved: 0, shifted: 0 };
  const seqs = cloneSeqs(store), row = seqs.find(x => x.id === rowId);
  if (!row) return { store, moved: 0, shifted: 0 };
  const used = new Set<Slot>(row.runs.filter(r => r.sacch === to).map(r => r.run).concat(row.extras.filter(e => e.sacch === to).map(e => e.run)));
  const srcSlots = [...new Set(row.runs.filter(r => r.sacch === from).map(r => r.run).concat(row.extras.filter(e => e.sacch === from).map(e => e.run)))]
    .sort((x, y) => SLOTS.indexOf(x) - SLOTS.indexOf(y));
  const map: Record<string, Slot> = {}, clash = srcSlots.filter(k => used.has(k));
  for (const k of srcSlots) if (!used.has(k)) map[k] = k;
  for (const k of srcSlots) if (!clash.includes(k)) used.add(k);
  for (const k of clash) {
    const n = SLOTS.find(z => !used.has(z));
    if (!n) throw new Error('No free run slot left in the target column');
    used.add(n); map[k] = n;
  }
  row.runs = row.runs.map(r => (r.sacch === from ? { ...r, sacch: to, run: map[r.run] } : r));
  row.extras = row.extras.map(e => (e.sacch === from ? { ...e, sacch: to, run: map[e.run] } : e));
  const vis = { ...store.vis };
  for (const k of srcSlots) {
    const o = slotKey(rowId, from, k), v = vis[o];
    delete vis[o];
    if (v) vis[slotKey(rowId, to, map[k])] = v;
  }
  const cell = { ...store.notes.cell }, fk = cellKeyOf(from, rowId), tk = cellKeyOf(to, rowId);
  if (cell[fk]) { cell[tk] = cell[tk] ? cell[tk] + '\n\n' + cell[fk] : cell[fk]; delete cell[fk]; }
  const lit = { ...store.lit };
  if (lit[fk]) { lit[tk] = (lit[tk] || []).concat(lit[fk]); delete lit[fk]; }
  return { store: { ...store, seqs, vis, notes: { ...store.notes, cell }, lit }, moved: srcSlots.length, shifted: clash.length };
}

// Rename / re-sequence / re-describe a row. If the new name+sequence already
// belongs to another row, the two merge (the target's runs win on a clash).
export function updateSeq(store: Store, rowId: string, patch: Partial<RowForm>) {
  const seqs = cloneSeqs(store);
  const row = seqs.find(s => s.id === rowId);
  if (!row) return { store, rowId, merged: false };
  const name = (patch.name != null ? patch.name : row.name).trim();
  const seq = (patch.seq != null ? patch.seq : row.seq).trim().toUpperCase();
  const group = (patch.group != null ? patch.group : row.group || '').trim();
  const desc = patch.desc != null ? patch.desc : row.desc;
  const twin = seqs.find(s => s.id !== rowId && rowKey(s) === seqKey(name, seq, group));
  if (twin) {
    const twinRuns = new Set(twin.runs.map(r => r.sacch + '|' + r.run));
    for (const r of row.runs) if (!twin.runs.some(o => o.sacch === r.sacch && o.run === r.run)) twin.runs.push(r);
    for (const e of row.extras) if (!twin.extras.some(o => o.type === e.type && o.sacch === e.sacch && o.run === e.run)) twin.extras.push(e);
    twin.structures = twin.structures.concat(row.structures);
    // Different descriptions are joined, like notes; nothing is overwritten.
    const d = (desc || '').trim(), td = (twin.desc || '').trim();
    if (d && d !== td) twin.desc = td ? td + '\n\n' + d : d;
    // Visibility follows runs into slots where the twin had no run; a flag the twin already has stays.
    const vis = { ...store.vis };
    for (const k of Object.keys(vis)) {
      const [rid, col, slot] = k.split('|');
      if (rid !== rowId) continue;
      const to = slotKey(twin.id, col, slot);
      if (!twinRuns.has(col + '|' + slot) && !(to in store.vis)) vis[to] = vis[k];
      delete vis[k];
    }
    // Notes and literature of the merged row follow it onto the twin.
    const cell = { ...store.notes.cell }, lit = { ...store.lit }, rowNotes = { ...store.notes.row };
    for (const c of getCols(store)) {
      const fk = cellKeyOf(c.k, rowId), tk = cellKeyOf(c.k, twin.id);
      if (cell[fk]) { cell[tk] = cell[tk] ? cell[tk] + '\n\n' + cell[fk] : cell[fk]; delete cell[fk]; }
      if (lit[fk]) { lit[tk] = (lit[tk] || []).concat(lit[fk]); delete lit[fk]; }
    }
    if (rowNotes[rowId]) { rowNotes[twin.id] = rowNotes[twin.id] ? rowNotes[twin.id] + '\n\n' + rowNotes[rowId] : rowNotes[rowId]; delete rowNotes[rowId]; }
    // Every page that showed the merged row now shows the twin in its place.
    const pages = store.pages.map(p => (!p.rows.includes(rowId) ? p : { ...p, rows: [...new Set(p.rows.map(id => (id === rowId ? twin.id : id)))] }));
    return { store: { ...store, seqs: seqs.filter(s => s.id !== rowId), notes: { cell, row: rowNotes }, lit, pages, vis }, rowId: twin.id, merged: true };
  }
  Object.assign(row, { name, seq, group, desc });
  return { store: { ...store, seqs }, rowId, merged: false };
}

/** The row editor: new details, and for a cell its run order (`order`, from slot per position) and target column (`to`). */
export interface RowEdit extends RowForm { col?: string; to?: string; order?: (Slot | null)[] | null }
export interface Dropped { kind: 'run' | 'analysis'; id: string; col: string; run: Slot; type?: string }

/**
 * The whole save of the row editor: the edited row's cell is renumbered and
 * moved first, then the row is renamed (which may merge it into a twin).
 * `dropped` is every run and analysis that existed before and is gone after,
 * described by its place before the save. The preview and the save are both
 * this call, so what the user is told can't drift from what happens.
 */
export function editRow(store: Store, rowId: string, edit: RowEdit): { store: Store; rowId: string; col: string; dropped: Dropped[]; error?: string } {
  const from = edit.col || '', to = edit.to || from;
  let st = store;
  try {
    if (from && edit.order) {
      const m: Record<string, Slot> = {};
      edit.order.forEach((o, i) => { if (o) m[o] = SLOTS[i]; });
      st = remapRuns(st, rowId, from, m);
    }
    if (to !== from) st = moveCell(st, rowId, from, to).store;
  } catch (e) { return { store, rowId, col: from, dropped: [], error: String((e as Error).message || e) }; }
  const res = updateSeq(st, rowId, edit);
  const kept = new Set(res.store.seqs.flatMap(q => [...q.runs.map(r => r.id), ...q.extras.map(x => x.id)]));
  const dropped: Dropped[] = store.seqs.flatMap(q => [
    ...q.runs.filter(r => !kept.has(r.id)).map((r): Dropped => ({ kind: 'run', id: r.id, col: r.sacch, run: r.run })),
    ...q.extras.filter(x => !kept.has(x.id)).map((x): Dropped => ({ kind: 'analysis', id: x.id, col: x.sacch, run: x.run, type: x.type })),
  ]);
  return { store: res.store, rowId: res.rowId, col: to, dropped };
}

export interface RunPatch { time?: string; temp?: string | number; tags?: string[]; sacch?: string; run?: Slot }

// Per-run metadata: simulation time, temperature, tags, column, run slot.
export function updateRun(store: Store, rowId: string, runId: string, patch: RunPatch): Store {
  const seqs = cloneSeqs(store);
  const row = seqs.find(s => s.id === rowId);
  if (!row) return store;
  const i = row.runs.findIndex(r => r.id === runId);
  if (i < 0) return store;
  const old = row.runs[i];
  const next: Run = { ...old };
  if (patch.time != null) next.time = patch.time;
  if (patch.temp != null) next.temp = Number(patch.temp) || DEFAULT_TEMP;
  if (patch.tags) next.tags = tagsOf(patch);
  if (patch.sacch) next.sacch = patch.sacch;
  if (patch.run) next.run = patch.run;
  if (old.sacch !== next.sacch || old.run !== next.run) {
    const moving = row.extras.filter(e => e.sacch === old.sacch && e.run === old.run);
    const kinds = new Set(moving.map(e => e.type));
    row.extras = row.extras
      .filter(e => !(e.sacch === next.sacch && e.run === next.run && kinds.has(e.type)))
      .map(e => (moving.includes(e) ? { ...e, sacch: next.sacch, run: next.run } : e));
  }
  // Moving a run onto an occupied slot drops the run that was there.
  row.runs = row.runs.filter(r => r.id === runId || !(r.sacch === next.sacch && r.run === next.run)).map(r => (r.id === runId ? next : r));
  // Its visibility goes with it (and replaces the dropped run's).
  const vis = { ...store.vis }, from = slotKey(rowId, old.sacch, old.run), to = slotKey(rowId, next.sacch, next.run);
  if (from !== to) { const v = vis[from]; delete vis[from]; delete vis[to]; if (v) vis[to] = v; }
  return { ...store, seqs, vis };
}

export function deleteRun(store: Store, rowId: string, runId: string): Store {
  const seqs = store.seqs.map(s => (s.id === rowId ? { ...s, runs: s.runs.filter(r => r.id !== runId) } : s)).filter(alive);
  const run = store.seqs.find(s => s.id === rowId)?.runs.find(r => r.id === runId), row = seqs.find(s => s.id === rowId);
  // A slot left empty forgets its visibility, so the next run uploaded there starts shown.
  const vis = { ...store.vis };
  if (run && !(row && row.extras.some(e => e.sacch === run.sacch && e.run === run.run))) delete vis[slotKey(rowId, run.sacch, run.run)];
  return pruneCells({ ...store, seqs, vis });
}

export function deleteSeq(store: Store, rowId: string): Store {
  return pruneCells({ ...store, seqs: store.seqs.filter(s => s.id !== rowId) });
}

// --- structures (metadata; the original file is kept in the vault) ---------

export function addStructure(store: Store, rowId: string, meta: StructMeta): Store {
  return { ...store, seqs: store.seqs.map(s => (s.id === rowId ? { ...s, structures: s.structures.concat(meta) } : s)) };
}

export function updateStructure(store: Store, rowId: string, id: string, patch: Partial<StructMeta>): Store {
  return { ...store, seqs: store.seqs.map(s => (s.id === rowId ? { ...s, structures: s.structures.map(m => (m.id === id ? { ...m, ...patch } : m)) } : s)) };
}

export function removeStructure(store: Store, rowId: string, id: string): Store {
  const seqs = store.seqs.map(s => (s.id === rowId ? { ...s, structures: s.structures.filter(m => m.id !== id) } : s)).filter(alive);
  return pruneCells({ ...store, seqs });
}


export const litKey = cellKeyOf;

export function blankLit(): LitRef {
  return { id: uid('l'), title: '', authors: '', year: '', venue: '', doi: '', url: '', note: '', added: today() };
}

export function saveLit(store: Store, key: string, ref: LitRef): Store {
  const list = (store.lit[key] || []).slice(), i = list.findIndex(r => r.id === ref.id);
  if (i >= 0) list[i] = ref; else list.push(ref);
  return { ...store, lit: { ...store.lit, [key]: list } };
}

export function deleteLit(store: Store, key: string, id: string): Store {
  const list = (store.lit[key] || []).filter(r => r.id !== id), lit = { ...store.lit };
  if (list.length) lit[key] = list; else delete lit[key];
  return { ...store, lit };
}

export function moveLit(store: Store, key: string, id: string, dir: number): Store {
  const list = (store.lit[key] || []).slice(), i = list.findIndex(r => r.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return store;
  [list[i], list[j]] = [list[j], list[i]];
  return { ...store, lit: { ...store.lit, [key]: list } };
}

// "10.1038/nsmb1201", "https://doi.org/10.…", "doi:10.…" → bare DOI.
export function cleanDoi(s: string): string {
  const m = /(10\.\d{4,9}\/[^\s"<>]+)/i.exec(String(s || ''));
  return m ? m[1].replace(/[.,;)]+$/, '') : '';
}

export function litCite(r: LitRef): string {
  const au = r.authors.trim(), first = au.split(/[;,]| and /)[0].trim();
  const many = au.split(/;| and /).length > 1 || (au.match(/,/g) || []).length > 1;
  return [first ? first + (many ? ' et al.' : '') : '', r.year ? '(' + r.year + ')' : ''].filter(Boolean).join(' ');
}

// --- pages -------------------------------------------------------------------
// A page lists row ids in its own order. Rows stay in the project when they
// leave a page; deleting a sequence removes it from every page.

export const ALL_PAGE = 'all';

export function newPage(name: string, rows: string[] = [], cols: string[] | null = null): Page {
  return { id: uid('pg'), name: name.trim() || 'Untitled page', desc: '', rows: [...new Set(rows)], cols: cols && cols.length ? cols : null };
}

export const findPage = (store: Store, id: string | null) => (id && id !== ALL_PAGE ? store.pages.find(p => p.id === id) || null : null);

export function pageSeqs(store: Store, page: Page | null): Seq[] {
  if (!page) return store.seqs;
  const by = new Map(store.seqs.map(s => [s.id, s]));
  return page.rows.map(id => by.get(id)).filter((s): s is Seq => !!s);
}

export function pageCols(store: Store, page: Page | null): Column[] {
  const cols = getCols(store);
  if (!page || !page.cols) return cols;
  const shown = cols.filter(c => page.cols!.includes(c.k));
  return shown.length ? shown : cols;
}

const mapPage = (store: Store, id: string, f: (p: Page) => Page): Store => ({ ...store, pages: store.pages.map(p => (p.id === id ? f(p) : p)) });

export function addPage(store: Store, page: Page): Store { return { ...store, pages: store.pages.concat(page) }; }
export function updatePage(store: Store, id: string, patch: Partial<Page>): Store { return pruneCells(mapPage(store, id, p => ({ ...p, ...patch }))); }
export function deletePage(store: Store, id: string): Store { return { ...store, pages: store.pages.filter(p => p.id !== id) }; }

export function movePage(store: Store, id: string, to: number): Store {
  const pages = store.pages.slice(), i = pages.findIndex(p => p.id === id);
  if (i < 0 || to < 0 || to >= pages.length || i === to) return store;
  const [p] = pages.splice(i, 1);
  pages.splice(to, 0, p);
  return { ...store, pages };
}

/** Rows (and, for a page showing chosen columns only, the columns they use) join a page. */
export function addToPage(store: Store, id: string, rows: string[], cols: string[] = []): Store {
  return mapPage(store, id, p => ({
    ...p,
    rows: [...new Set(p.rows.concat(rows))],
    cols: p.cols ? [...new Set(p.cols.concat(cols))] : null,
  }));
}

export function removeFromPage(store: Store, id: string, row: string): Store {
  return mapPage(store, id, p => ({ ...p, rows: p.rows.filter(r => r !== row) }));
}

export function togglePageRow(store: Store, id: string, row: string): Store {
  const p = store.pages.find(q => q.id === id);
  if (!p) return store;
  return p.rows.includes(row) ? removeFromPage(store, id, row) : addToPage(store, id, [row]);
}

// Within a page: swap with the nearest row of the same method, as on the full list.
export function movePageRow(store: Store, id: string, row: string, dir: number): Store {
  return mapPage(store, id, p => {
    const by = new Map(store.seqs.map(s => [s.id, s]));
    const rows = p.rows.slice(), i = rows.indexOf(row);
    if (i < 0) return p;
    const g = gOf(by.get(row)!);
    let j = i + dir;
    while (j >= 0 && j < rows.length && gOf(by.get(rows[j])!) !== g) j += dir;
    if (j < 0 || j >= rows.length) return p;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    return { ...p, rows };
  });
}

export function movePageGroup(store: Store, id: string, g: string, dir: number): Store {
  return mapPage(store, id, p => {
    const seqs = pageSeqs(store, p), order = groupOrder(seqs), i = order.indexOf(g), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return p;
    [order[i], order[j]] = [order[j], order[i]];
    return { ...p, rows: order.flatMap(k => seqs.filter(s => gOf(s) === k).map(s => s.id)) };
  });
}

/** Pages a row appears on (besides "All sequences"). */
export const pagesOf = (store: Store, row: string) => store.pages.filter(p => p.rows.includes(row));

// --- dataset JSON ------------------------------------------------------------

// Original files (v4) and structure text (v3) are turned into uploads by
// storage/exchange.ts before these see the export.
function readExport(text: string) {
  const raw = JSON.parse(text);
  if (!raw || !Array.isArray(raw.seqs)) throw new Error('Not a PMF sequences export.');
  return { raw, store: normStore(raw) };
}

/** A whole export as a new, standalone project store (pages and settings included). */
export function importAsStore(text: string): { store: Store; name: string } {
  const { raw, store } = readExport(text);
  return { store, name: typeof raw.project === 'string' ? raw.project : '' };
}

export function importJSON(text: string, store: Store): { store: Store } {
  const { raw, store: v } = readExport(text);
  const seqs = store.seqs.slice();
  const cols = getCols(store).slice();
  for (const c of (Array.isArray(raw.cols) ? raw.cols as Column[] : [])) if (!cols.some(o => o.k === c.k)) cols.push(c);
  for (const r of v.seqs.flatMap(s => s.runs)) if (!cols.some(o => o.k === r.sacch)) cols.push(newColumn(cols, r.sacch, ''));
  const idMap: Record<string, string> = {};
  for (const s of v.seqs) {
    const hit = seqs.find(o => rowKey(o) === rowKey(s));
    if (hit) {
      idMap[s.id] = hit.id;
      const runs = hit.runs.slice(), extras = hit.extras.slice();
      for (const r of s.runs) {
        const i = runs.findIndex(o => o.sacch === r.sacch && o.run === r.run);
        if (i >= 0) runs[i] = r; else runs.push(r);
      }
      for (const e of s.extras) {
        const i = extras.findIndex(o => o.type === e.type && o.sacch === e.sacch && o.run === e.run);
        if (i >= 0) extras[i] = e; else extras.push(e);
      }
      const structures = hit.structures.concat(s.structures.filter(m => !hit.structures.some(o => o.id === m.id)));
      seqs[seqs.indexOf(hit)] = { ...hit, runs, extras, structures };
    } else { idMap[s.id] = s.id; seqs.push(s); }
  }
  // Cell-keyed data from the file is re-keyed onto the rows it merged into.
  const rekey = (key: string) => { const i = key.indexOf('_'); return key.slice(0, i) + '_' + (idMap[key.slice(i + 1)] || key.slice(i + 1)); };
  const cell = { ...store.notes.cell }, row = { ...store.notes.row }, lit = { ...store.lit };
  for (const [k, t] of Object.entries(v.notes.cell)) cell[rekey(k)] = t;
  for (const [k, t] of Object.entries(v.notes.row)) row[idMap[k] || k] = t;
  for (const [k, list] of Object.entries(v.lit)) {
    const nk = rekey(k), cur = lit[nk] || [];
    lit[nk] = cur.concat(list.filter(r => !cur.some(o => o.id === r.id)));
  }
  const vis = { ...store.vis };
  for (const [k, val] of Object.entries(v.vis)) { const [id, ...rest] = k.split('|'); vis[[idMap[id] || id, ...rest].join('|')] = val; }
  // Pages from the file join this project; a page it already has gains the rows.
  const pages = store.pages.slice();
  for (const p of v.pages) {
    const rows = p.rows.map(id => idMap[id] || id), i = pages.findIndex(o => o.id === p.id);
    if (i >= 0) pages[i] = { ...pages[i], rows: [...new Set(pages[i].rows.concat(rows))] };
    else pages.push({ ...p, rows });
  }
  return { store: pruneCells({ ...store, seqs, cols, notes: { cell, row }, vis, lit, pages }) };
}

// --- plot geometry (per-series x grids) ------------------------------------

export interface PlotSeries { x: (number | null)[]; y: (number | null)[] }
export interface PlotOpts {
  w: number; h: number;
  pad?: { l: number; r: number; t: number; b: number };
  domain?: { lo: number; hi: number } | null;
  yStep?: number | null;
}

/** A tick's exact value: as many decimals as its step needs (one more for 2.5 × 10ⁿ), trailing zeros trimmed, never -0. */
export function tickLabel(v: number, step: number): string {
  const e = Math.floor(Math.log10(step) + 1e-9), m = step / Math.pow(10, e);
  const t = v.toFixed(Math.max(0, -e + (Math.abs(m - 2.5) < 1e-9 ? 1 : 0)));
  const s = t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t;
  return s === '-0' ? '0' : s;
}

export function buildPlotMulti(series: PlotSeries[], opts: PlotOpts) {
  const w = opts.w, h = opts.h;
  const pad = opts.pad || { l: 58, r: 14, t: 14, b: 36 };
  let lo: number, hi: number;
  if (opts.domain) { lo = opts.domain.lo; hi = opts.domain.hi; }
  else {
    lo = Infinity; hi = -Infinity;
    for (const s of series) for (const v of s.y) { if (v == null || !isFinite(v)) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!isFinite(lo)) { lo = -1; hi = 1; }
    const pv = (hi - lo) * 0.08 || 1;
    lo -= pv; hi += pv;
  }
  let x0 = Infinity, x1 = -Infinity;
  for (const s of series) for (const v of s.x) { if (v == null || !isFinite(v)) continue; if (v < x0) x0 = v; if (v > x1) x1 = v; }
  if (!isFinite(x0)) { x0 = 0; x1 = 1; }
  const sx = (v: number) => pad.l + (v - x0) / (x1 - x0 || 1) * (w - pad.l - pad.r);
  const sy = (v: number) => pad.t + (hi - v) / (hi - lo || 1) * (h - pad.t - pad.b);
  const path = (s: PlotSeries) => {
    let d = '', open = false;
    for (let i = 0; i < s.y.length; i++) {
      const v = s.y[i], xv = s.x[i];
      if (v == null || xv == null || !(v >= lo && v <= hi)) { open = false; continue; }
      d += (open ? 'L' : 'M') + sx(xv).toFixed(1) + ' ' + sy(v).toFixed(1);
      open = true;
    }
    return d;
  };
  const ticks = (a: number, b: number, step: number) => {
    const out: number[] = [];
    for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(+v.toFixed(6));
    return { vals: out, step };
  };
  const nice = (a: number, b: number, n: number) => {
    const step = Math.pow(10, Math.floor(Math.log10((b - a) / n || 1)));
    return ticks(a, b, [1, 2, 2.5, 5, 10].map(m => m * step).find(s => (b - a) / s <= n) || step * 10);
  };
  const yt = opts.yStep ? ticks(lo, hi, opts.yStep) : nice(lo, hi, 5), xt = nice(x0, x1, 6);
  return {
    paths: series.map(path), lo, hi,
    zeroY: sy(0), inRangeZero: 0 >= lo && 0 <= hi,
    xticks: xt.vals.map(v => ({ x: sx(v), label: tickLabel(v, xt.step) })),
    yticks: yt.vals.map(v => ({ y: sy(v), label: tickLabel(v, yt.step) })),
    plotL: pad.l, plotR: w - pad.r, plotT: pad.t, plotB: h - pad.b,
    sx, sy,
  };
}
