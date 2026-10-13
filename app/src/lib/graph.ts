// The graph of one cell or row (G-0): a pure function of the store and the view. The detail dialog
// draws it and exports write it, so a cell can be exported without opening it.

import * as lib from './seq';
import { graphShades } from './shade';
import { scriptProvenance, scriptResult } from './scriptRuns';
import { pinY, unitText } from './interact';
import type { GraphData } from './export';
import type { AnalysisType, Column, Curve, Extra, Run, Seq, Settings, Slot, Store, Transform, Vis } from './types';

/** Dash patterns by run (then curve) index, or as chosen (R6), with their names. */
export const DASH = ['none', '5 4', '2 3', '8 3 2 3', '1 3', '10 4', '4 2 1 2', '6 6', '3 5', '12 3 3 3'];
export const DASH_NAMES = ['solid', 'dashed', 'dotted', 'dash-dot', 'fine dots', 'long dash', 'short dash-dot', 'even dash', 'spaced dots', 'long dash-dot'];
export const GRAPH_W = 720, GRAPH_H = 450;

export interface SlotRec { sacch: string; run: Slot; pmf: Run | null; ex: Record<string, Extra>; key: string; vis: Vis; i: number }
export interface Series {
  /** The run or curve it draws (marks belong to it, F100). */
  src: string;
  k: string; label: string; color: string; ex: string; width: number; dash: string; op: number; dim?: boolean;
  x: (number | null)[]; y: (number | null)[]; rx: (number | null)[]; ry: (number | null)[]; mark?: lib.Mark; names?: (string | null)[];
  style?: 'line' | 'step' | 'points' | 'bars'; shape?: number;
  /** With smoothing on: y before smoothing, for the readout (F101). */
  uy?: (number | null)[];
  /** Its dash was chosen (R6), not taken from its place. */
  picked?: boolean;
}
/** A curve's marks that sit on its data, with y read there (Compare draws these, R5d). */
export function marksOn(row: Seq, src: string, x: (number | null)[], y: (number | null)[]) {
  return (row.marks || []).flatMap(m => { if (m.curve !== src) return []; const v = pinY(x, y, m.x); return v == null ? [] : [{ x: m.x, y: v, label: lib.fmtValue(v) }]; });
}
/** The graph a reference line belongs to (R5c, F100): a cell and its type, or the row view and its type. */
export const lineKey = (sel: { mode: 'cell' | 'row'; s: string; id?: string }, tab: string) => (sel.mode === 'row' ? '*' : sel.s) + '|' + tab;
/** A reference line as the graph draws it: its place in the graph's list, the axis it crosses, its value and label. */
export interface GraphRefLine { at: number; axis: 'x' | 'y'; v: number; label: string }
/** A mark as the graph draws it (R5b): its place in the row's list, its curve's series, y from the data, or why not. */
/** `y`: where it is drawn (on the drawn, maybe smoothed, curve); `v`: its value, from the data before smoothing (F138). */
export interface GraphMark { at: number; curve: string; series: number; x: number; y?: number; v?: number; color?: string; label?: string; flagged?: string }
export interface GraphLine { d: string; k: string; color: string; width: number; dash: string; op: number; shape?: number }

export interface GraphView {
  store: Store;
  sel: { mode: 'row' | 'cell'; id: string; s: string };
  /** The page's columns, in order. */
  cols: Column[];
  st: Settings;
  /** The tab asked for; the graph falls back to one that has data. */
  tab: string;
  /** The temporary "show raw" view (F88): the graph only, without the type's transform. */
  raw: boolean;
  fitWell: boolean;
  dark: boolean;
  /** The shared y-axis (sharedDomain with the PMF transform shown), used when fitWell. */
  domain: { lo: number; hi: number };
  /** Row view: the columns whose stat tiles were clicked; the other columns go grey. */
  focus?: string[] | null;
  /** An export's theme (R8a): its data takes the dark screen's colours, or black and white for print; absent = light. */
  theme?: 'light' | 'dark' | 'print';
}

/** A script transform's state on these curves: how it was made, or why it isn't drawn (computing, not trusted, its error). */
export function scriptNote(t: Extract<Transform, { kind: 'script' }>, src: { x: (number | null)[]; y: (number | null)[] }[]): string {
  const reqs = src.map(c => ({ script: t.script, fn: t.fn, role: 'transform' as const, params: t.params, x: c.x, y: c.y })), res = reqs.map(scriptResult);
  const bad = res.find(r => r.state === 'done' && !r.ok);
  if (res.some(r => r.state === 'untrusted')) return 'not transformed: the script isn’t trusted in this browser yet (Settings → Functions)';
  if (bad && bad.state === 'done' && !bad.ok) return 'not transformed: ' + t.fn + '() ' + bad.error;
  if (res.some(r => r.state === 'pending')) return 'transforming with ' + t.fn + '()…';
  return res.length ? 'transformed by ' + scriptProvenance(reqs[0], res[0]) : 'transformed by ' + t.fn + '()';
}

/** One y-axis across every PMF in the store, so wells compare between cells. */
export function sharedDomain(seqs: Seq[], t: Transform) {
  let lo = Infinity, hi = -Infinity;
  for (const s of seqs) for (const r of s.runs) {
    for (const v of lib.runCurve(r, t)) { if (v == null) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
  }
  if (!isFinite(lo)) return { lo: -15, hi: 15 };
  const round = (v: number, s: number) => Math.sign(v) * Math.ceil(Math.abs(v) / s) * s;
  if (t.kind !== 'entropy') return { lo: round(lo, 2), hi: round(hi, 2) };
  return { lo: Math.min(-15, round(lo, 5)), hi: Math.max(15, round(Math.min(hi, 40), 5)) };
}

function stepXY(x: (number | null)[], y: (number | null)[]) {
  const X: (number | null)[] = [], Y: (number | null)[] = [];
  for (let i = 0; i < x.length; i++) {
    const xi = x[i] ?? 0, prev = i ? (x[i - 1] ?? xi) : xi;
    const nx = i + 1 < x.length ? x[i + 1] : xi + (xi - prev);
    X.push(x[i], nx); Y.push(y[i], y[i]);
  }
  return { x: X, y: Y };
}

export function buildGraph(v: GraphView) {
  const { store, sel, cols, st, fitWell, domain } = v, dark = v.theme ? v.theme === 'dark' : v.dark, bw = !!st.bw || v.theme === 'print';
  const row = store.seqs.find(s => s.id === sel.id);
  if (!row) return null;
  const types = lib.getAnalyses(st), all = lib.getCols(store), vis = store.vis;
  const colOf = (k: string): Column => all.find(c => c.k === k) || { k, label: k, name: k, short: k, light: '#5c5550', dark: '#b0a79f' };
  const sc = colOf(sel.s);
  const shown = sel.mode === 'row' ? row.runs : row.runs.filter(r => r.sacch === sel.s);

  const tOf = (k: string): AnalysisType => types.find(t => t.k === k) || { k, label: k, name: 'analysis no longer defined', xLabel: 'x', yLabel: 'y', style: 'line', match: '' };
  const scopeEx = row.extras.filter(e => sel.mode === 'row' || e.sacch === sel.s);
  const tabKeys = ['pmf'].concat(types.filter(t => t.k !== 'pmf' && scopeEx.some(e => e.type === t.k)).map(t => t.k));
  for (const e of scopeEx) if (!tabKeys.includes(e.type)) tabKeys.push(e.type);
  const tab = v.tab, curTab = tabKeys.includes(tab) && (tab !== 'pmf' || shown.length || tabKeys.length === 1) ? tab : (shown.length || tabKeys.length === 1 ? 'pmf' : tabKeys[1]);
  const T = tOf(curTab), isPmf = curTab === 'pmf';
  const colIdx = (k: string) => cols.findIndex(c => c.k === k);

  const sm = new Map<string, SlotRec>();
  const slotOf = (sacch: string, run: Slot) => {
    const k = sacch + '|' + run;
    if (!sm.has(k)) sm.set(k, { sacch, run, pmf: null, ex: {}, key: lib.slotKey(row.id, sacch, run), vis: vis[lib.slotKey(row.id, sacch, run)] || 'on', i: Math.max(0, lib.SLOTS.indexOf(run)) });
    return sm.get(k)!;
  };
  for (const r of shown) slotOf(r.sacch, r.run).pmf = r;
  for (const e of scopeEx) slotOf(e.sacch, e.run).ex[e.type] = e;
  const slots = [...sm.values()].sort((a, b) => colIdx(a.sacch) - colIdx(b.sacch) || lib.SLOTS.indexOf(a.run) - lib.SLOTS.indexOf(b.run));
  const dataOf = (q: SlotRec) => (isPmf ? q.pmf : q.ex[curTab]);
  const withData = slots.filter(dataOf);
  // Curve shades (R4): each column's curves in run, then curve order, hidden ones included so hiding never recolours the rest.
  const curveIds = (q: SlotRec) => (isPmf ? [q.key] : q.ex[curTab].curves.map(c => c.id));
  const adjust = new Map(isPmf ? [] : withData.flatMap(q => q.ex[curTab].curves.map(c => [c.id, c.shade || 0] as const)));
  const shades = graphShades([...new Set(withData.map(q => q.sacch))].map(k => ({ base: colOf(k), ids: withData.filter(q => q.sacch === k).flatMap(curveIds) })), dark, bw, id => adjust.get(id) || 0);
  // An analysis without curves (only from a hand-edited file) gets a plain swatch rather than a crash.
  // A chosen dash (R6) wins over the one from its place.
  const look = (id?: string, dash?: number) => { const s = id ? shades.get(id) : undefined; return s ? { color: s.color, ex: s.ex, dash: DASH[(dash ?? s.i) % DASH.length] } : { color: 'var(--mut)', ex: '#b8b3b0', dash: DASH[(dash ?? 0) % DASH.length] }; };

  // --- series ----------------------------------------------------------------
  // The type's transform (R2) unless the raw view is on (it only means something with a transform); analyses take the project's temperature.
  const tSet = lib.transformOf(T, st), raw = v.raw && tSet.kind !== 'none', tf = raw ? lib.NONE : tSet, temp = Number(st.temp) || lib.DEFAULT_TEMP;
  const smooth = isPmf ? 0 : lib.smoothOf(T);
  const shownXY = (c: Curve) => { const t = lib.transformXY(tf, c.x, c.y, temp); return { x: t.x, y: smooth ? lib.smoothY(t.y, smooth) : t.y, uy: t.y }; };
  const series: Series[] = [], drawn: Curve[] = [];
  const pushData = (q: SlotRec, base: Omit<Series, 'src' | 'x' | 'y' | 'rx' | 'ry' | 'color' | 'ex' | 'dash'>) => {
    if (isPmf) {
      const r = q.pmf!;
      if (r.state === 'missing') return;
      const { x, y } = lib.runXY(r, tf);
      series.push({ ...base, src: r.id, ...look(q.key, r.dash), picked: r.dash != null, x, y, rx: x, ry: y, mark: lib.curveMark(x, y, 'min', 'none', false) });
      return;
    }
    const d = q.ex[curTab], many = d.curves.length > 1;
    for (const { c, vis: cv } of lib.shownCurves(d, q.vis)) {
      const j = d.curves.indexOf(c);
      // Smoothed curves are drawn as lines (a smoothed staircase reads as noise).
      const { x: cx, y, uy } = shownXY(c);
      const xy = T.style === 'step' && !smooth ? stepXY(cx, y) : { x: cx, y };
      drawn.push(c);
      // The mark sits on the drawn curve at the stored x (a histogram bin, not a staircase corner).
      series.push({
        ...base, src: c.id, ...look(c.id, c.dash), picked: c.dash != null, ...xy, rx: cx, ry: y, ...(smooth ? { uy } : {}), mark: lib.curveMark(cx, y, lib.markerOf(T), lib.markerLabelOf(T)), names: c.names, shape: shades.get(c.id)?.i ?? 0,
        width: many ? 1.3 : base.width, op: cv === 'dim' ? 0.3 : 1, dim: cv === 'dim',
        label: base.label + (many || c.custom ? ' · ' + (c.label || 'col ' + (j + 2)) : ''),
      });
    }
  };
  if (sel.mode === 'row') {
    for (const c of cols) {
      let ss = withData.filter(q => q.sacch === c.k && q.vis !== 'off');
      if (!st.rowAll) ss = ss.slice(0, 1);
      for (const q of ss) pushData(q, {
        k: c.k, label: c.label + ' · ' + c.name + (st.rowAll ? ' · ' + lib.runLabel(q.run) : ''),
        width: st.rowAll && q.i > 0 ? 1.6 : 2.2,
        op: q.vis === 'dim' ? 0.3 : 1, dim: q.vis === 'dim',
      });
    }
  } else {
    const vs = withData.filter(q => q.vis !== 'off');
    for (const q of vs) pushData(q, {
      k: q.sacch, label: lib.runLabel(q.run) + (isPmf ? ' · ' + lib.tagLabel(q.pmf!.tags, lib.getTags(st)) : ''),
      width: q.i === 0 ? 2.4 : 1.8, op: q.vis === 'dim' ? 0.3 : 1, dim: q.vis === 'dim',
    });
  }

  // Display style (R1c): the type's; auto draws points when every x is a consecutive whole number (F85).
  const whole = (c: Curve) => c.x.every((x, i) => x != null && Number.isInteger(x) && (!i || x - (c.x[i - 1] ?? NaN) === 1));
  const style = isPmf ? 'line' : T.style === 'auto' ? (drawn.length && drawn.every(whole) ? 'points' : 'line') : T.style;
  for (const s of series) s.style = style;

  // --- plot ----------------------------------------------------------------------
  const fk = sel.mode === 'row' && v.focus && v.focus.length ? v.focus : null;
  const dom = isPmf && fitWell ? domain : null;
  const yStep = isPmf && fitWell && tf.kind === 'entropy' ? 5 : null;
  // Axis labels (F82): an analysis takes its files' label when every drawn curve's file gives the same one; PMF keeps Settings'.
  const fileLabel = (k: 'x' | 'y') => { const ls = new Set(drawn.map(c => c.axis?.[k] || '')), [l] = ls; return ls.size === 1 && l ? l : null; };
  const xLabel = isPmf ? st.xLabel : fileLabel('x') ?? T.xLabel, yLabel = isPmf ? st.yLabel : fileLabel('y') ?? T.yLabel;
  const g = lib.buildPlotMulti(series.length ? series : [{ x: [0, 1], y: [0, 0] }], { w: GRAPH_W, h: GRAPH_H, domain: dom, yStep, pad: { l: 58, r: 14, t: 14, b: 36 } });
  // Row names as x ticks (F113), when every drawn curve names its rows: thinned to fit, a first word all share ("Atom") dropped.
  let xTicks: { v: number; label: string }[] | undefined;
  if (drawn.length && drawn.every(c => c.names)) {
    const pts = drawn[0].x.map((x, i) => [x, drawn[0].names![i]] as const).filter((p): p is [number, string] => p[0] != null && !!p[1]);
    const w0 = pts.length ? pts[0][1].split(' ')[0] + ' ' : '', cut = pts.every(([, n]) => n.startsWith(w0) && n.length > w0.length) ? w0.length : 0;
    const every = Math.ceil(pts.length / Math.floor((g.plotR - g.plotL) / 36));
    xTicks = pts.filter((_, i) => i % every === 0).map(([v, n]) => ({ v, label: n.slice(cut) }));
    g.xticks = xTicks.map(t => ({ x: g.sx(t.v), label: t.label }));
  }
  const dimF = (k: string) => !!fk && !fk.includes(k);
  const lines: GraphLine[] = g.paths.slice(0, series.length).map((d, i) => {
    const s = series[i];
    return { d, k: s.k, shape: s.shape, ...(dimF(s.k) ? { color: 'var(--mut)', width: 1.4, dash: '4 4', op: 0.45 } : { color: s.color, width: s.width, dash: s.dash, op: s.op }) };
  });
  // Marks (R5b, F100): on their curve, with y from the data; flagged when the curve or its data point is gone.
  const ids = new Set([...row.runs.map(r => r.id), ...row.extras.flatMap(e => e.curves.map(c => c.id))]);
  const marks: GraphMark[] = (row.marks || []).flatMap((mk, at): GraphMark[] => {
    const k = series.findIndex(q => q.src === mk.curve);
    if (k < 0) return ids.has(mk.curve) ? [] : [{ at, curve: mk.curve, series: -1, x: mk.x, flagged: 'its curve is no longer here' }];
    const q = series[k], y = pinY(q.rx, q.ry, mk.x), v = q.uy ? pinY(q.rx, q.uy, mk.x) : y;
    if (y == null || v == null) return [{ at, curve: mk.curve, series: k, x: mk.x, flagged: 'no data point at x = ' + lib.fmtValue(mk.x) }];
    return [{ at, curve: mk.curve, series: k, x: mk.x, y, v, color: q.color, label: lib.fmtValue(v) }];
  });
  const markers = lib.plotMarkers(series.map(x => (dimF(x.k) ? { ...x, color: 'var(--mut)', op: 0.45 } : x)), g)
    .concat(marks.flatMap(mk => (mk.y != null && mk.y >= g.lo && mk.y <= g.hi ? [{ k: 'mark' + mk.at, x: g.sx(mk.x), y: g.sy(mk.y), color: mk.color!, op: 1, halo: true, label: mk.label }] : [])));
  // The transform is named on every graph (R2); the raw view says it isn't what the matrix uses (F88).
  const RAW = 'raw — not what the matrix uses', tName = lib.TRANSFORMS[tSet.kind];
  // A script transform (R3c) says how it was made, or why nothing is drawn yet.
  const tNote = tf.kind === 'script' ? scriptNote(tf, isPmf ? withData.flatMap(q => (q.pmf!.state === 'missing' ? [] : [q.pmf!])) : drawn) : tName.note;
  let note = isPmf
    ? (raw ? 'raw gmx awh output — not what the matrix uses' : tNote) + (dom ? ' · shared scale ' + dom.lo + ' to ' + dom.hi : ' · autoscaled')
    : (T.name || T.label) + ' · autoscaled' + (tSet.kind !== 'none' ? ' · ' + (raw ? RAW : tNote) : '') + (smooth ? ' · smoothed (' + lib.smoothLabel(smooth) + ')' : '');
  if (series.length > 1) note += bw ? ' · black and white' : ' · shade and dash: run, then curve';
  const anyPending = !isPmf && withData.some(q => q.ex[curTab].curves.some(c => c.state === 'pending'));
  const anyMissing = withData.some(q => (isPmf ? q.pmf!.state === 'missing' : q.ex[curTab].curves.some(c => c.state === 'missing')));
  if (!series.length) note = anyPending ? 'loading curves…' : anyMissing ? 'original file missing — see Vault' : withData.length ? (withData.some(q => q.vis !== 'off') ? 'every curve is hidden' : 'every run is hidden') : 'no curve for this cell yet';
  else if (anyMissing) note += ' · some originals are missing';
  // A chosen line style that another curve also has, where colour can't tell them apart (a column's shades, or black and
  // white), is allowed with a warning (F103). Automatic dashes repeat only past ten curves, and say nothing.
  const dupDash = series.filter((s, i) => series.some((o, j) => j !== i && o.dash === s.dash && (bw || o.k === s.k) && (s.picked || o.picked))).map(s => s.label);
  const legend = sel.mode === 'row' || (!isPmf && series.length > 1) ? series.map(s => ({ label: s.label, color: s.color, dash: s.dash, style, shape: s.shape })) : [];

  // Reference lines of this graph (R5c), labelled with their value and unit.
  const lKey = lineKey(sel, curTab), xu = unitText(xLabel), yu = unitText(yLabel);
  const refLines: GraphRefLine[] = (row.lines?.[lKey] || []).map((l, at) => ({ at, axis: l.axis, v: l.v, label: l.axis + ' = ' + lib.fmtValue(l.v) + ((l.axis === 'x' ? xu : yu) ? ' ' + (l.axis === 'x' ? xu : yu) : '') }));
  const nEx = scopeEx.length;
  const sub = (row.group ? row.group + ' · ' : '') + (sel.mode === 'row'
    ? row.runs.length + ' runs across ' + new Set(row.runs.map(r => r.sacch)).size + ' column(s)'
    : sc.name + ' — ' + lib.plural(shown.length, 'run')) + (nEx ? ' · ' + lib.plural(nEx, 'analysis curve') : '');

  // What an export draws: the export colours (light, or the dark screen's for a dark export).
  const exOf = (x: { color: string; ex: string }) => (v.theme !== 'dark' ? x.ex : x.color.startsWith('var(') ? '#938d89' : x.color);
  const parts = { column: sel.mode === 'row' ? 'all-columns' : sc.label, sequence: row.name, tab: isPmf ? (raw ? 'raw' : tName.file) : T.label };
  const data: GraphData = {
    file: parts.column + '_' + parts.sequence + '_' + parts.tab, parts,
    // Column first, then the sequence: "PG × WRWYCR".
    kicker: (isPmf ? 'PMF · ' + (raw ? 'raw' : tName.word) : T.label + (T.name ? ' · ' + T.name : '')) + (row.seq && row.seq !== row.name ? ' · ' + row.seq : ''),
    title: sel.mode === 'row' ? row.name + ' · all columns' : sc.label + ' × ' + row.name, sub,
    xLabel, yLabel, domain: dom, yStep, note, xTicks,
    // Marks and lines go into exports too (R5d); a graph without any exports exactly as before.
    ...(marks.some(mk => mk.y != null) || refLines.length ? { pins: {
      marks: marks.flatMap(mk => (mk.y != null ? [{ x: mk.x, y: mk.y, color: exOf(series[mk.series]), label: mk.label!, curve: series[mk.series].label }] : [])),
      lines: refLines.map(({ axis, v, label }) => ({ axis, v, label })),
    } } : {}),
    series: series.map(x => {
      const fd = dimF(x.k), dim = fd || x.dim;
      return { x: x.x, y: x.y, rx: x.rx, ry: x.ry, mark: x.mark && dim ? { ...x.mark, dim: true } : x.mark, label: x.label, color: dim ? (v.theme === 'dark' ? '#6f6964' : '#b8b3b0') : exOf(x), width: dim ? 1.4 : x.width, dash: fd ? '4 4' : x.dash, ...(x.names ? { names: x.names } : {}), ...(style === 'points' || style === 'bars' ? { style, shape: x.shape } : {}) };
    }),
  };
  return { row, sc, shown, scopeEx, tabKeys, curTab, T, tOf, isPmf, tSet, tf, smooth, shownXY, marks, lineKey: lKey, refLines, slots, withData, curveIds, look, series, g, lines, markers, xLabel, yLabel, note, legend, dupDash, sub, data };
}

/**
 * The graphs a batch export makes (R8c, question 26): each pick's PMF, or its first analysis when it has no runs; with
 * `all` (Shift), every analysis too, in the tabs' order. A picked sequence gives its all-columns graphs; an empty cell, none.
 */
export function batchGraphs(store: Store, picks: { id: string; col: string | null }[], all: boolean, types: AnalysisType[]): { sel: GraphView['sel']; tab: string }[] {
  return picks.flatMap(p => {
    const row = store.seqs.find(s => s.id === p.id);
    if (!row) return [];
    const runs = row.runs.filter(r => p.col == null || r.sacch === p.col), ex = row.extras.filter(e => p.col == null || e.sacch === p.col);
    const kinds = [...new Set(ex.map(e => e.type))].sort((a, b) => ((types.findIndex(t => t.k === a) + 1) || 1e9) - ((types.findIndex(t => t.k === b) + 1) || 1e9));
    const tabs = (runs.length ? ['pmf'] : []).concat(all || !runs.length ? kinds.slice(0, all ? undefined : 1) : []);
    const sel = { mode: p.col == null ? 'row' as const : 'cell' as const, id: row.id, s: p.col ?? (runs[0] || ex[0])?.sacch ?? '' };
    return tabs.map(tab => ({ sel, tab }));
  });
}
