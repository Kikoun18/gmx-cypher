// Export: xvg writers, plus a tiny scene graph rendered to SVG → PNG and to a
// hand-written vector PDF, in the export settings' theme (light by default; dark or print, R8a).

import { buildPlotMulti, fmtValue, labelLeft, labelParts, shapeAt, symbolLetter, toGrace, type Mark } from './seq';
import { ramp, rampSky, inkOn, norm, fmt } from './pmf';
import { exportLayout, exportName, fileBase, type ExportFormatAll, type ExportPrefs, type SceneOpts } from './exportPrefs';
import { unitText } from './interact';

export { fileBase };
const C = { bg: '#ffffff', ink: '#201e1d', mut: '#6b6663', line: '#dcd8d6', rule: '#201e1d', acc: '#ec3013' };
type Pal = typeof C;
/** The export themes (R8a): today's light page, the dark screen's, and black and white for print. */
const THEMES: Record<NonNullable<SceneOpts['theme']>, Pal> = {
  light: C,
  dark: { bg: '#141312', ink: '#f0eeec', mut: '#938d89', line: '#35312f', rule: '#f0eeec', acc: '#ff563c' },
  print: { bg: '#ffffff', ink: '#000000', mut: '#555555', line: '#cccccc', rule: '#000000', acc: '#000000' },
};
/** A colour as the grey of the same lightness (print). */
export function grey(c: string): string {
  const [r, g, b] = rgb(c), h = Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) * 255).toString(16).padStart(2, '0');
  return '#' + h + h + h;
}
/** A palette colour in an export theme: its light or dark variant, or its grey. */
export const themeColor = (light: string, dark: string, theme?: SceneOpts['theme']) => (theme === 'dark' ? dark : theme === 'print' ? grey(light) : light);
const FONT = 'Helvetica, Arial, sans-serif';

export interface GraphSeries {
  x: (number | null)[];
  y: (number | null)[];
  rx?: (number | null)[];
  ry?: (number | null)[];
  /** The marked point, the same one the screen draws. */
  mark?: Mark;
  label: string;
  color: string;
  width?: number;
  dash?: string;
  /** Row names, aligned with rx (F113); the xvg writes each above its row. */
  names?: (string | null)[];
  /** Drawn as marker shapes or grouped bars instead of a line (R1c). */
  style?: 'points' | 'bars';
  shape?: number;
}

export interface GraphData {
  file: string;
  /** Small letter-spaced line above the title, e.g. "PMF · CORRECTED". */
  kicker?: string;
  title: string;
  sub?: string;
  xLabel: string;
  yLabel: string;
  domain?: { lo: number; hi: number } | null;
  yStep?: number | null;
  note?: string;
  series: GraphSeries[];
  /** x ticks named by row (F113), in place of numbers. */
  xTicks?: { v: number; label: string }[];
  /** The file-name template's fields (R8a). */
  parts?: { column: string; sequence: string; tab: string };
  /** The cell's matrix value, one line per column (R8d): set when the export settings ask for it. */
  values?: string[];
  /** Marks (on their curve) and reference lines (R5d). */
  pins?: { marks: { x: number; y: number; color: string; label: string; curve: string }[]; lines: { axis: 'x' | 'y'; v: number; label: string }[] };
}

export interface MatrixData {
  file: string;
  kicker?: string;
  title: string;
  sub: string;
  metricLabel: string;
  unit: string;
  max: number;
  /** The metric's colour scale and legend (R4b); without it, magnitude from zero as before. */
  scale?: { color(v: number, dark: boolean): string; ink(v: number, dark: boolean): string; kind: string; legend(unit: string): { title: string; range: string } };
  cols: { label: string; name: string; short: string; color: string; dk?: string }[];
  groups: { label: string; hasLabel: boolean; rows: { name: string; seq: string; group: string; cells: ({ v: number; n: number; text?: string; spread?: string } | null)[] }[] }[];
}

type Item =
  | { t: 'text'; x: number; y: number; s: string; size: number; fill: string; anchor: 'start' | 'middle' | 'end'; bold: boolean; ls?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number; dash?: string }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number; dash?: string }
  | { t: 'poly'; segs: number[][][]; stroke: string; sw: number; dash?: string }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string }
  | { t: 'shape'; pts: number[][]; fill: string };

/** `k`: output points per drawing unit (R8a; absent = 1). */
export interface Scene { w: number; h: number; bg: string; items: Item[]; k?: number }

// Approximate Helvetica advance widths (em) — enough for anchoring and wrapping.
const NARROW: Record<string, number> = { ' ': .278, '.': .278, ',': .278, ':': .278, ';': .278, '·': .278, '|': .26, '/': .278, '(': .333, ')': .333, '-': .333, '−': .584, '×': .584, '+': .584, '=': .584, '→': 1, '…': 1, i: .222, l: .222, j: .222, t: .278, f: .278, r: .333, I: .278, m: .833, w: .722, M: .833, W: .944 };
/** Width of a label; ^{…} and _{…} count at SUP × size. */
export function textW(s: string, size: number, bold?: boolean, ls = 0): number {
  return labelParts(String(s)).reduce((w, p) => w + runW(p.t, p.v ? size * SUP : size, bold, ls), 0);
}
const SUP = 0.7, RISE = 0.35;
function runW(s: string, size: number, bold?: boolean, ls = 0): number {
  let w = 0;
  for (const ch of String(s)) {
    if (NARROW[ch] != null) w += NARROW[ch] + (bold ? .02 : 0);
    else if (ch >= '0' && ch <= '9') w += .556;
    else if (ch >= 'A' && ch <= 'Z') w += bold ? .722 : .667;
    else if (ch >= 'a' && ch <= 'z') w += bold ? .611 : .556;
    else w += .6;
  }
  return w * size + ls * Array.from(String(s)).length;
}
function clip(s: string, size: number, bold: boolean, max: number, ls = 0): string {
  let t = String(s || '');
  if (textW(t, size, bold, ls) <= max) return t;
  while (t.length > 1 && textW(t + '…', size, bold, ls) > max) t = t.slice(0, -1);
  return t + '…';
}
/** A line broken at spaces to fit `max` (a word too long for a line is clipped). */
function wrap(s: string, size: number, max: number): string[] {
  const out: string[] = [];
  for (const w of s.split(' ')) { const t = out.length ? out[out.length - 1] + ' ' + w : w; if (out.length && textW(t, size) <= max) out[out.length - 1] = t; else out.push(clip(w, size, false, max)); }
  return out;
}
const text = (x: number, y: number, s: unknown, size: number, fill: string, anchor?: 'start' | 'middle' | 'end', bold?: boolean): Item =>
  ({ t: 'text', x, y, s: String(s == null ? '' : s), size, fill, anchor: anchor || 'start', bold: !!bold });
/**
 * Title block shared by every export: a red tick and a letter-spaced kicker,
 * the title in bold capitals, a quiet subtitle, then a hairline. Returns its bottom.
 */
function header(it: Item[], W: number, L: number, kicker: string | undefined, title: string, sub: string | undefined, c: Pal): number {
  const max = W - 2 * L;
  it.push({ t: 'rect', x: L, y: 22, w: 18, h: 3, fill: c.acc });
  if (kicker) it.push({ ...text(L + 28, 27, clip(kicker.toUpperCase(), 9, true, max - 28, 1.6), 9, c.acc, 'start', true), ls: 1.6 } as Item);
  it.push({ ...text(L, 60, clip(String(title || '').toUpperCase(), 24, true, max, 0.6), 24, c.ink, 'start', true), ls: 0.6 } as Item);
  let y = 60;
  if (sub) { y = 80; it.push(text(L, y, clip(sub, 11, false, max), 11, c.mut)); }
  y += 14;
  it.push(line(L, y, W - L, y, c.line, 1));
  return y;
}
const scaled = (sc: Scene, k?: number): Scene => (k && k !== 1 ? { ...sc, k } : sc);
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw: number, dash?: string): Item => ({ t: 'line', x1, y1, x2, y2, stroke, sw, dash });

function parseD(d: string): number[][][] {
  const segs: number[][][] = [];
  let cur: number[][] | null = null;
  for (const tok of (d || '').match(/[ML][^ML]*/g) || []) {
    const [x, y] = tok.slice(1).trim().split(/\s+/).map(Number);
    if (tok[0] === 'M') { cur = [[x, y]]; segs.push(cur); } else if (cur) cur.push([x, y]);
  }
  return segs.filter(s => s.length > 1);
}

// --- scenes ----------------------------------------------------------------

/** A graph as drawn for export; `o` (R8a) sets the size, theme, title block and grid; without it, as before. */
export function graphScene(g: GraphData, o: SceneOpts = {}): Scene {
  const first = drawGraph(g, o, 420);
  // A height asked for: the plot takes up the difference.
  return scaled(o.h ? drawGraph(g, o, Math.max(80, 420 + o.h - first.h)) : first, o.k);
}
function drawGraph(g: GraphData, o: SceneOpts, plotH: number): Scene {
  const W = o.w ?? 820, L = 28, C = THEMES[o.theme || 'light'], grid = o.grid !== false;
  const it: Item[] = [];
  const top = (o.title === false ? 0 : header(it, W, L, g.kicker, g.title, g.sub, C)) + 40;
  const ser = g.series.length ? g.series : [{ x: [0, 1], y: [0, 0] }];
  // The legend (R8d): the curves, then each mark's value and the matrix value; below (as before), right of the plot, or inside it.
  const at = o.legend?.at || 'below', extra = legendExtra(g, !!o.legend?.marks), curves = g.series.slice(0, 16);
  const extraW = (e: { s: string; color?: string }) => (e.color ? 14 : 0) + textW(e.s, 10);
  const LW = at === 'right' ? Math.min(240, Math.max(60, ...curves.map(s => 26 + textW(s.label, 11)), ...extra.map(extraW))) : 0;
  const p = buildPlotMulti(ser, { w: W, h: top + plotH, domain: g.domain, yStep: g.yStep, pad: { l: 74, r: 28 + (LW ? LW + 20 : 0), t: top, b: 0 } });
  it.push(text(L, top - 16, g.yLabel, 10, C.mut));
  // Without the grid, ticks are short marks on the axes.
  for (const t of p.yticks) { it.push(grid ? line(p.plotL, t.y, p.plotR, t.y, C.line, 1) : line(p.plotL - 5, t.y, p.plotL, t.y, C.rule, 1)); it.push(text(p.plotL - 8, t.y + 4, t.label, 11, C.mut, 'end')); }
  for (const t of g.xTicks ? g.xTicks.map(k => ({ x: p.sx(k.v), label: k.label })) : p.xticks) { it.push(line(t.x, grid ? p.plotT : p.plotB, t.x, p.plotB + 5, grid ? C.line : C.rule, 1)); it.push(text(t.x, p.plotB + 20, t.label, 11, C.mut, 'middle')); }
  if (p.inRangeZero) it.push(line(p.plotL, p.zeroY, p.plotR, p.zeroY, C.mut, 1, '2 3'));
  // Reference lines (R5d): like the zero line, with their label.
  for (const l of g.pins?.lines || []) {
    if (l.axis === 'x' ? l.v < Math.min(p.x0, p.x1) || l.v > Math.max(p.x0, p.x1) : l.v < p.lo || l.v > p.hi) continue;
    const at = l.axis === 'x' ? p.sx(l.v) : p.sy(l.v);
    it.push(l.axis === 'x' ? line(at, p.plotT, at, p.plotB, C.mut, 1, '2 3') : line(p.plotL, at, p.plotR, at, C.mut, 1, '2 3'));
    it.push(l.axis === 'x' ? text(at + 5, p.plotT + 10, l.label, 10, C.mut) : text(p.plotR - 4, at - 4, l.label, 10, C.mut, 'end'));
  }
  it.push(line(p.plotL, p.plotT, p.plotL, p.plotB, C.rule, 2), line(p.plotL, p.plotB, p.plotR, p.plotB, C.rule, 2));
  const dot = (k: number, x: number, y: number, fill: string): Item => { const pts = shapeAt(k, x, y); return pts ? { t: 'shape', pts, fill } : { t: 'circle', cx: x, cy: y, r: 3.2, fill }; };
  g.series.forEach((s, i) => {
    if (s.style === 'points') for (const [x, y] of p.points[i]) it.push(dot(s.shape || 0, x, y, s.color));
    else if (s.style === 'bars') for (const b of p.bars[i]) it.push({ t: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, fill: s.color });
    else it.push({ t: 'poly', segs: parseD(p.paths[i]), stroke: s.color, sw: s.width || 2, dash: s.dash });
  });
  for (const s of g.series) {
    const m = s.mark;
    if (!m || m.y < p.lo || m.y > p.hi) continue;
    const cx = p.sx(m.x), cy = p.sy(m.y);
    if (m.halo) it.push({ t: 'circle', cx, cy, r: 6, fill: C.bg }, { t: 'circle', cx, cy, r: 4.5, fill: s.color });
    else it.push({ t: 'circle', cx, cy, r: 3.5, fill: s.color });
    const ink = m.dim ? s.color : C.ink;
    if (m.label) it.push(labelLeft(cx, p.plotR) ? text(cx - 8, cy - 7, m.label, 10, ink, 'end') : text(cx + 8, cy - 7, m.label, 10, ink));
  }
  // Marks (R5d): a dot on the curve with its value.
  for (const m of g.pins?.marks || []) {
    if (m.y < p.lo || m.y > p.hi) continue;
    const cx = p.sx(m.x), cy = p.sy(m.y);
    it.push({ t: 'circle', cx, cy, r: 6, fill: C.bg }, { t: 'circle', cx, cy, r: 4.5, fill: m.color });
    it.push(labelLeft(cx, p.plotR) ? text(cx - 8, cy - 7, m.label, 10, C.ink, 'end') : text(cx + 8, cy - 7, m.label, 10, C.ink));
  }
  it.push(text(p.plotR, p.plotB + 40, g.xLabel, 10, C.mut, 'end'));
  const swatch = (s: GraphSeries, x: number, y: number) => (s.style === 'points' ? dot(s.shape || 0, x + 9, y - 4, s.color) : s.style === 'bars' ? line(x + 3, y - 4, x + 15, y - 4, s.color, 8) : line(x, y - 4, x + 18, y - 4, s.color, 3, s.dash));
  // A mark or value line, wrapped to fit; returns how many lines it took.
  const rowsOf = (e: { s: string; color?: string }, max: number) => wrap(e.s, 10, max - (e.color ? 14 : 0));
  const extraLine = (e: { s: string; color?: string }, x: number, y: number, max: number, lh: number) => {
    const rows = rowsOf(e, max);
    if (e.color) it.push({ t: 'circle', cx: x + 4, cy: y - 4, r: 3.5, fill: e.color });
    rows.forEach((r, i) => it.push(text(x + (e.color ? 14 : 0), y + i * lh, r, 10, C.ink)));
    return rows.length;
  };
  // A legend in one column (right of the plot, or in a box inside it); returns its bottom.
  const column = (x: number, y: number, max: number) => {
    for (const s of curves) { it.push(swatch(s, x, y), text(x + 26, y, clip(s.label, 11, false, max - 26), 11, C.ink)); y += 18; }
    for (const e of extra) y += 16 * extraLine(e, x, y, max, 16);
    return y;
  };
  let x = L, y = p.plotB + 72, side = 0;
  if (at === 'below') {
    for (const s of curves) {
      const w = 26 + textW(s.label, 11);
      if (x > L && x + w > W - L) { x = L; y += 20; }
      it.push(swatch(s, x, y));
      it.push(text(x + 26, y, s.label, 11, C.ink));
      x += w + 22;
    }
    for (const e of extra) { y += 18; y += 14 * (extraLine(e, L, y, W - 2 * L, 14) - 1); }
  } else {
    y = p.plotB + 44;
    if (at === 'right') side = column(p.plotR + 20, p.plotT + 10, LW);
    else if (curves.length || extra.length) {
      const bw = Math.min(p.plotR - p.plotL - 16, 20 + Math.max(...curves.map(s => 26 + textW(s.label, 11)), ...extra.map(extraW))), bx = p.plotR - bw - 8;
      it.push({ t: 'rect', x: bx, y: p.plotT + 8, w: bw, h: curves.length * 18 + extra.reduce((n, e) => n + rowsOf(e, bw - 20).length, 0) * 16 + 10, fill: C.bg, stroke: C.line, sw: 1 });
      column(bx + 10, p.plotT + 24, bw - 20);
    }
  }
  if (g.note) { y += 28; it.push(text(L, y, g.note, 9, C.mut)); }
  return { w: W, h: Math.max(y, side) + 28, bg: C.bg, items: it };
}

/** The legend's lines after the curves (R8d): each mark's value with its units (when asked), then the matrix value. */
export function legendExtra(g: GraphData, marks: boolean): { s: string; color?: string }[] {
  const xu = unitText(g.xLabel), yu = unitText(g.yLabel), u = (v: string, unit: string) => v + (unit ? ' ' + unit : '');
  return [...(marks ? (g.pins?.marks || []).map(m => ({ s: m.curve + ': ' + u(m.label, yu) + ' at x = ' + u(fmtValue(m.x), xu), color: m.color })) : []), ...(g.values || []).map(s => ({ s }))];
}

/** Several graphs as one figure (R8d): `cols` per row, columns as wide as the widest, each row as tall as its tallest. */
export function gridPlace(sizes: { w: number; h: number }[], cols: number, gap: number) {
  const colW = Math.max(...sizes.map(s => s.w)), rows: number[] = [];
  sizes.forEach((s, i) => { rows[Math.floor(i / cols)] = Math.max(rows[Math.floor(i / cols)] || 0, s.h); });
  const top = rows.map((_, r) => rows.slice(0, r).reduce((a, h) => a + h + gap, 0));
  return { at: sizes.map((_, i) => ({ x: (i % cols) * (colW + gap), y: top[Math.floor(i / cols)] })), w: Math.min(cols, sizes.length) * (colW + gap) - gap, h: top[top.length - 1] + rows[rows.length - 1] };
}
const shift = (i: Item, dx: number, dy: number): Item => (i.t === 'text' || i.t === 'rect' ? { ...i, x: i.x + dx, y: i.y + dy }
  : i.t === 'line' ? { ...i, x1: i.x1 + dx, x2: i.x2 + dx, y1: i.y1 + dy, y2: i.y2 + dy } : i.t === 'circle' ? { ...i, cx: i.cx + dx, cy: i.cy + dy }
  : i.t === 'poly' ? { ...i, segs: i.segs.map(s => s.map(([x, y]) => [x + dx, y + dy])) } : { ...i, pts: i.pts.map(([x, y]) => [x + dx, y + dy]) });
export function gridScene(scenes: Scene[], cols: number): Scene {
  const g = gridPlace(scenes, cols, 24);
  return scaled({ w: g.w, h: g.h, bg: scenes[0].bg, items: scenes.flatMap((sc, i) => sc.items.map(it => shift(it, g.at[i].x, g.at[i].y))) }, scenes[0].k);
}

/** The matrix as drawn for export; `o` (R8a) sets the theme and title block, and scales it to a width (or by the font size). */
export function matrixScene(m: MatrixData, o: SceneOpts = {}): Scene {
  const L = 28, nameW = 230, cell = 56, gap = 6, nc = m.cols.length;
  const gridR = L + nameW + nc * (cell + gap) - gap;
  const W = Math.max(560, gridR + L);
  const cx = (j: number) => L + nameW + j * (cell + gap);
  const C = THEMES[o.theme || 'light'], dark = o.theme === 'dark', print = o.theme === 'print';
  // Print: each tile in the grey of its light colour, its value in black or white, whichever reads better.
  const fillOf = (v: number, t: number) => { const f = m.scale ? m.scale.color(v, dark) : ramp(t, dark); return print ? grey(f) : f; };
  const inkOf = (v: number, t: number, fill: string) => (print ? (parseInt(fill.slice(1, 3), 16) > 118 ? '#000000' : '#ffffff') : m.scale ? m.scale.ink(v, dark) : inkOn(t, dark));
  const colColor = (c: MatrixData['cols'][number]) => (print ? C.ink : dark ? c.dk || c.color : c.color);
  const it: Item[] = [];
  let y = (o.title === false ? 0 : header(it, W, L, m.kicker, m.title, m.sub, C)) + 30;
  it.push(text(L, y + 16, 'SEQUENCE', 9, C.mut));
  m.cols.forEach((c, j) => {
    it.push(text(cx(j) + cell / 2, y, clip(c.label, 15, true, cell + gap - 4), 15, colColor(c), 'middle', true));
    it.push(text(cx(j) + cell / 2, y + 16, clip(c.short || c.name, 9, false, cell + gap - 4), 9, C.mut, 'middle'));
  });
  y += 28;
  it.push(line(L, y, gridR, y, C.rule, 2));
  y += 10;
  for (const g of m.groups) {
    if (g.hasLabel) {
      y += 16;
      const lb = g.label.toUpperCase(), cnt = String(g.rows.length).padStart(2, '0');
      it.push(text(L, y, lb, 9, C.mut), text(gridR, y, cnt, 9, C.mut, 'end'));
      it.push(line(L + textW(lb, 9) + 10, y - 3, gridR - textW(cnt, 9) - 10, y - 3, C.line, 1));
      y += 12;
    }
    for (const r of g.rows) {
      it.push(text(L, y + 25, clip(r.name, 14, true, nameW - 14), 14, C.ink, 'start', true));
      if (r.seq) it.push(text(L, y + 41, clip(r.seq, 9, false, nameW - 14), 9, C.mut));
      r.cells.forEach((c, j) => {
        if (!c) { it.push({ t: 'rect', x: cx(j) + 0.5, y: y + 0.5, w: cell - 1, h: cell - 1, stroke: C.line, sw: 1, dash: '3 3' }); return; }
        const t = norm(c.v, m.max), fill = fillOf(c.v, t), ink = inkOf(c.v, t, fill);
        it.push({ t: 'rect', x: cx(j), y, w: cell, h: cell, fill });
        it.push(text(cx(j) + cell / 2, y + cell / 2 + 4, c.text ?? fmt(c.v), 12, ink, 'middle', true));
        if (c.spread) it.push(text(cx(j) + cell / 2, y + cell / 2 + 15, clip(c.spread, 8, false, cell - 6), 8, ink, 'middle'));
        if (c.n > 1) {
          const tot = c.n * 3 + (c.n - 1) * 2;
          for (let k = 0; k < c.n; k++) it.push({ t: 'rect', x: cx(j) + cell / 2 - tot / 2 + k * 5, y: y + cell - 7, w: 3, h: 2, fill: ink });
        }
      });
      y += cell + gap;
    }
  }
  y += 22;
  const lg = m.scale ? m.scale.legend(m.unit) : { title: m.metricLabel + ' magnitude', range: '0 → ' + m.max.toFixed(1) + ' ' + m.unit };
  const ttl = lg.title.toUpperCase();
  it.push(text(L, y, ttl, 9, C.mut));
  const sx = L + textW(ttl, 9) + 14, sw = legendSwatches(m.scale?.kind, dark).map(f => (print ? grey(f) : f));
  sw.forEach((fill, i) => it.push({ t: 'rect', x: sx + i * 14, y: y - 8, w: 14, h: 8, fill }));
  it.push(text(sx + 14 * sw.length + 12, y, lg.range, 10, C.mut));
  y += 22;
  let x = L;
  for (const c of m.cols) {
    const s1 = c.label, s2 = ' ' + (c.name || ''), w = textW(s1, 10, true) + textW(s2, 10) + 18;
    if (x > L && x + w > W - L) { x = L; y += 16; }
    it.push(text(x, y, s1, 10, colColor(c), 'start', true), text(x + textW(s1, 10, true), y, s2, 10, C.mut));
    x += w;
  }
  return scaled({ w: W, h: y + 28, bg: C.bg, items: it }, o.fit ? o.fit / W : o.k);
}

// --- renderers -------------------------------------------------------------

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Super- and subscripts as smaller tspans shifted by RISE × the font size, and back. */
function svgRuns(s: string, size: number): string {
  let o = '', at = 0;
  for (const p of labelParts(s)) {
    const to = -p.v * size * RISE;
    o += to === at ? esc(p.t) : '<tspan dy="' + n2(to - at) + '"' + (p.v ? ' font-size="' + n2(size * SUP) + '"' : '') + '>' + esc(p.t) + '</tspan>';
    at = to;
  }
  return o;
}
const dashAttr = (d?: string) => (d && d !== 'none' ? ' stroke-dasharray="' + d + '"' : '');

/** `bg` false: a transparent layer (toPNG draws a scene in layers). */
export function toSVG(sc: Scene, bg = true): string {
  const k = sc.k || 1, o = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + (k === 1 ? sc.w : n2(sc.w * k)) + '" height="' + (k === 1 ? sc.h : n2(sc.h * k)) + '" viewBox="0 0 ' + sc.w + ' ' + sc.h + '">', ...(bg ? ['<rect width="100%" height="100%" fill="' + sc.bg + '"/>'] : [])];
  for (const i of sc.items) {
    if (i.t === 'rect') o.push('<rect x="' + i.x + '" y="' + i.y + '" width="' + i.w + '" height="' + i.h + '" fill="' + (i.fill || 'none') + '"' + (i.stroke ? ' stroke="' + i.stroke + '" stroke-width="' + (i.sw || 1) + '"' + dashAttr(i.dash) : '') + '/>');
    else if (i.t === 'line') o.push('<line x1="' + i.x1 + '" y1="' + i.y1 + '" x2="' + i.x2 + '" y2="' + i.y2 + '" stroke="' + i.stroke + '" stroke-width="' + i.sw + '"' + dashAttr(i.dash) + '/>');
    else if (i.t === 'poly') o.push('<path d="' + i.segs.map(s => 'M' + s.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L')).join('') + '" fill="none" stroke="' + i.stroke + '" stroke-width="' + i.sw + '" stroke-linejoin="round" stroke-linecap="round"' + dashAttr(i.dash) + '/>');
    else if (i.t === 'circle') o.push('<circle cx="' + i.cx + '" cy="' + i.cy + '" r="' + i.r + '" fill="' + i.fill + '"/>');
    else if (i.t === 'shape') o.push('<path d="M' + i.pts.map(p => p[0] + ' ' + p[1]).join('L') + 'Z" fill="' + i.fill + '"/>');
    else if (i.t === 'text') o.push('<text x="' + i.x + '" y="' + i.y + '" font-family="' + FONT + '" font-size="' + i.size + '"' + (i.bold ? ' font-weight="700"' : '') + ' fill="' + i.fill + '" text-anchor="' + i.anchor + '"' + (i.ls ? ' letter-spacing="' + i.ls + '"' : '') + '>' + svgRuns(i.s, i.size) + '</text>');
  }
  o.push('</svg>');
  return o.join('');
}

/**
 * The scene as a PNG, drawn in order a piece at a time so no task runs long (F110): each run of plain items as one SVG
 * layer, each curve stroked on the canvas in chunks of points, its dash pattern carried across chunks.
 */
export async function toPNG(sc: Scene, scale = 2): Promise<Blob> {
  const k = (sc.k || 1) * scale, cv = document.createElement('canvas');
  cv.width = Math.round(sc.w * k); cv.height = Math.round(sc.h * k);
  const ctx = cv.getContext('2d')!, pause = () => new Promise(r => setTimeout(r, 0));
  ctx.fillStyle = sc.bg; ctx.fillRect(0, 0, cv.width, cv.height);
  let run: Item[] = [];
  const layer = async () => {
    if (!run.length) return;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(toSVG({ ...sc, items: run }, false));
    await img.decode();
    ctx.drawImage(img, 0, 0, cv.width, cv.height); run = [];
    await pause();
  };
  for (const i of sc.items) {
    if (i.t !== 'poly') { run.push(i); continue; }
    await layer();
    ctx.setTransform(k, 0, 0, k, 0, 0); ctx.strokeStyle = i.stroke; ctx.lineWidth = i.sw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.setLineDash(i.dash && i.dash !== 'none' ? i.dash.trim().split(/[\s,]+/).map(Number) : []);
    for (const seg of i.segs) {
      let len = 0;
      for (let a = 0; a < seg.length - 1; a += 400) {
        const b = Math.min(seg.length - 1, a + 400);
        ctx.lineDashOffset = len; ctx.beginPath(); ctx.moveTo(seg[a][0], seg[a][1]);
        for (let j = a + 1; j <= b; j++) { ctx.lineTo(seg[j][0], seg[j][1]); len += Math.hypot(seg[j][0] - seg[j - 1][0], seg[j][1] - seg[j - 1][1]); }
        ctx.stroke(); await pause();
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  await layer();
  return new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('png encode failed'))), 'image/png'));
}

function rgb(c: string): number[] {
  const s = String(c || '#000').trim();
  if (s[0] === '#') {
    let h = s.slice(1);
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  const m = /rgba?\(([^)]+)\)/.exec(s);
  return m ? m[1].split(/[\s,]+/).slice(0, 3).map(v => +v / 255) : [0, 0, 0];
}
const n2 = (v: number) => { const s = (+v).toFixed(2).replace(/\.?0+$/, ''); return s === '-0' ? '0' : s; };
const col = (c: string) => rgb(c).map(n2).join(' ');
const WIN: Record<string, number> = { '—': 0x97, '–': 0x96, '…': 0x85, '’': 0x92, '‘': 0x91, '“': 0x93, '”': 0x94, '•': 0x95, '€': 0x80 };
const SUB: Record<string, string> = { '−': '-', '→': '->', '₁': '1', '₂': '2', '³': '3', 'ₙ': 'n' };
function pdfStr(s: string): string {
  let o = '';
  for (const ch of String(s)) {
    if (SUB[ch]) { o += SUB[ch]; continue; }
    const c = WIN[ch] != null ? WIN[ch] : ch.codePointAt(0)!;
    if (c > 255) { o += '?'; continue; }
    const cc = String.fromCharCode(c);
    o += cc === '(' || cc === ')' || cc === '\\' ? '\\' + cc : cc;
  }
  return o;
}

/** One page per scene (R8d: several graphs in one PDF); one scene gives the same bytes as before. */
export function toPDF(scenes: Scene | Scene[]): Blob {
  const pages = (Array.isArray(scenes) ? scenes : [scenes]).map(pageOps), n = pages.length, sym = pages.some(q => q.sym), f1 = 3 + 2 * n;
  const objs = [null,
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [' + pages.map((_, i) => 3 + 2 * i + ' 0 R').join(' ') + '] /Count ' + n + ' >>',
    ...pages.flatMap((q, i) => [
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + n2(q.w) + ' ' + n2(q.h) + '] /Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + (f1 + 1) + ' 0 R' + (sym ? ' /F3 ' + (f1 + 2) + ' 0 R' : '') + ' >> >> /Contents ' + (4 + 2 * i) + ' 0 R >>',
      '<< /Length ' + q.content.length + ' >>\nstream\n' + q.content + '\nendstream',
    ]),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    ...(sym ? ['<< /Type /Font /Subtype /Type1 /BaseFont /Symbol >>'] : []),
  ];
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const off: number[] = [];
  for (let i = 1; i < objs.length; i++) { off[i] = out.length; out += i + ' 0 obj\n' + objs[i] + '\nendobj\n'; }
  const xref = out.length;
  out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n' + off.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return new Blob([Uint8Array.from(out, c => c.charCodeAt(0) & 255)], { type: 'application/pdf' });
}

function pageOps(sc: Scene): { content: string; sym: boolean; w: number; h: number } {
  const H = sc.h, Y = (y: number) => n2(H - y), k = sc.k || 1;
  const dash = (d?: string) => (d && d !== 'none' ? '[' + String(d).trim().split(/[\s,]+/).join(' ') + '] 0 d' : '[] 0 d');
  // A scaled scene (R8a): the page has the output size and everything is drawn through one scale.
  const ops = [...(k === 1 ? [] : [+k.toFixed(6) + ' 0 0 ' + +k.toFixed(6) + ' 0 0 cm']), '1 j 1 J', col(sc.bg) + ' rg 0 0 ' + n2(sc.w) + ' ' + n2(H) + ' re f'];
  let sym = false, rise = false;
  for (const i of sc.items) {
    if (i.t === 'rect') {
      const box = n2(i.x) + ' ' + Y(i.y + i.h) + ' ' + n2(i.w) + ' ' + n2(i.h) + ' re';
      if (i.fill) ops.push(col(i.fill) + ' rg ' + box + ' f');
      if (i.stroke) ops.push(col(i.stroke) + ' RG ' + n2(i.sw || 1) + ' w ' + dash(i.dash) + ' ' + box + ' S');
    } else if (i.t === 'line') {
      ops.push(col(i.stroke) + ' RG ' + n2(i.sw) + ' w ' + dash(i.dash) + ' ' + n2(i.x1) + ' ' + Y(i.y1) + ' m ' + n2(i.x2) + ' ' + Y(i.y2) + ' l S');
    } else if (i.t === 'poly') {
      if (!i.segs.length) continue;
      ops.push(col(i.stroke) + ' RG ' + n2(i.sw) + ' w ' + dash(i.dash));
      for (const s of i.segs) ops.push(s.map((p, k) => n2(p[0]) + ' ' + Y(p[1]) + (k ? ' l' : ' m')).join(' ') + ' S');
    } else if (i.t === 'circle') {
      const r = i.r, k = r * 0.5523, x = i.cx, y = H - i.cy;
      ops.push(col(i.fill) + ' rg ' + [
        n2(x + r) + ' ' + n2(y) + ' m',
        n2(x + r) + ' ' + n2(y + k) + ' ' + n2(x + k) + ' ' + n2(y + r) + ' ' + n2(x) + ' ' + n2(y + r) + ' c',
        n2(x - k) + ' ' + n2(y + r) + ' ' + n2(x - r) + ' ' + n2(y + k) + ' ' + n2(x - r) + ' ' + n2(y) + ' c',
        n2(x - r) + ' ' + n2(y - k) + ' ' + n2(x - k) + ' ' + n2(y - r) + ' ' + n2(x) + ' ' + n2(y - r) + ' c',
        n2(x + k) + ' ' + n2(y - r) + ' ' + n2(x + r) + ' ' + n2(y - k) + ' ' + n2(x + r) + ' ' + n2(y) + ' c',
      ].join(' ') + ' f');
    } else if (i.t === 'shape') {
      ops.push(col(i.fill) + ' rg ' + i.pts.map((p, k) => n2(p[0]) + ' ' + Y(p[1]) + (k ? ' l' : ' m')).join(' ') + ' h f');
    } else if (i.t === 'text') {
      const w = textW(i.s, i.size, i.bold, i.ls || 0);
      const x = i.anchor === 'end' ? i.x - w : i.anchor === 'middle' ? i.x - w / 2 : i.x, f0 = i.bold ? 'F2' : 'F1';
      // Runs of one font, size and rise: super- and subscripts rise by RISE × the size; Greek letters use the Symbol font.
      // The rise is page state in PDF: a text after one that ended raised or lowered starts with its own 0 (F138).
      let cur = f0 + ' ' + n2(i.size) + ' Tf 0 Ts', body = rise ? ' 0 Ts' : '';
      for (const p of labelParts(i.s)) for (const m of p.t.match(/[α-ωΑ-Ω]+|[^α-ωΑ-Ω]+/g) || []) {
        const greek = symbolLetter(m[0]) != null, f = (greek ? 'F3' : f0) + ' ' + n2(p.v ? i.size * SUP : i.size) + ' Tf ' + n2(p.v * i.size * RISE) + ' Ts';
        if (greek) sym = true;
        if (f !== cur) body += ' /' + f;
        body += ' (' + pdfStr(greek ? [...m].map(c => symbolLetter(c) ?? c).join('') : m) + ') Tj';
        cur = f; rise = p.v !== 0;
      }
      ops.push('BT /' + f0 + ' ' + n2(i.size) + ' Tf ' + n2(i.ls || 0) + ' Tc ' + col(i.fill) + ' rg ' + n2(x) + ' ' + Y(i.y) + ' Td' + body + ' ET');
    }
  }
  return { content: ops.join('\n'), sym, w: sc.w * k, h: H * k };
}

// --- xvg -------------------------------------------------------------------

const q = (s: unknown) => String(s == null ? '' : s).replace(/"/g, "'");
const num = (v: number, w: number) => (Math.abs(v) >= 1e5 ? v.toExponential(5) : v.toFixed(4)).padStart(w);
function head(title: string, xl: string, yl: string, comments: (string | undefined)[]): string[] {
  return [
    '# Exported from PMF Sequences · ' + new Date().toISOString().slice(0, 19).replace('T', ' '),
    ...comments.filter(Boolean).map(c => '# ' + c),
    '@    title "' + q(toGrace(title)) + '"', '@    xaxis  label "' + q(toGrace(xl)) + '"', '@    yaxis  label "' + q(toGrace(yl)) + '"',
    '@TYPE xy', '@ view 0.15, 0.15, 0.75, 0.85', '@ legend on', '@ legend box on', '@ legend loctype view', '@ legend 0.78, 0.8', '@ legend length 2',
  ];
}

export function graphXvg(g: GraphData): string {
  const pins = [...(g.pins?.marks || []).map(m => 'mark: ' + m.curve + ' at x = ' + fmtValue(m.x) + ', y = ' + m.label), ...(g.pins?.lines || []).map(l => 'line: ' + l.label), ...(g.values || []).map(v => 'value: ' + v)];
  const L = head(String(g.title).toUpperCase(), g.xLabel, g.yLabel, [g.kicker, g.sub, g.note, ...pins]);
  g.series.forEach((s, i) => L.push('@ s' + i + ' legend "' + q(toGrace(s.label)) + '"'));
  for (const s of g.series) {
    const X = s.rx || s.x, Y = s.ry || s.y;
    // A row's name goes on the line above it, as the parser reads it back (F113).
    for (let i = 0; i < X.length; i++) { const xv = X[i], yv = Y[i]; if (xv != null && yv != null && isFinite(yv)) L.push(...(s.names?.[i] ? ['# ' + s.names[i]] : []), num(xv, 12) + ' ' + num(yv, 14)); }
    L.push('&');
  }
  return L.join('\n') + '\n';
}

// One set per column; x = row index (listed in the header comments).
/** The legend's swatches: the warm ramp, or for a diverging scale the cool ramp (reversed) then the warm one. */
export function legendSwatches(kind: string | undefined, dark: boolean): string[] {
  const warm = Array.from({ length: 14 }, (_, i) => ramp(i / 13, dark));
  return kind === 'diverging' ? Array.from({ length: 7 }, (_, i) => rampSky(1 - i / 7, dark)).concat(Array.from({ length: 7 }, (_, i) => ramp(i / 6, dark))) : warm;
}

export function matrixXvg(m: MatrixData): string {
  const rows = m.groups.flatMap(g => g.rows);
  const L = head(String(m.title).toUpperCase(), 'Sequence (row index)', m.metricLabel + ' (' + m.unit + ')', [m.sub, 'row index -> method | name | sequence']);
  rows.forEach((r, i) => L.push('#  ' + String(i + 1).padStart(3) + '  ' + (r.group || '-') + ' | ' + r.name + ' | ' + (r.seq || '-')));
  m.cols.forEach((c, j) => L.push('@ s' + j + ' legend "' + q(c.label + (c.name && c.name !== c.label ? ' · ' + c.name : '')) + '"', '@ s' + j + ' symbol 1', '@ s' + j + ' line type 0'));
  m.cols.forEach((_, j) => {
    rows.forEach((r, i) => { const cell = r.cells[j]; if (cell) L.push(String(i + 1).padStart(6) + ' ' + num(cell.v, 14)); });
    L.push('&');
  });
  return L.join('\n') + '\n';
}

/** A graph or the matrix as a file in the format asked for, laid out by the export settings (R8a). */
export async function renderExport(d: { graph: GraphData } | { matrix: MatrixData }, f: ExportFormatAll, p: ExportPrefs): Promise<Blob> {
  if (f === 'xvg') return new Blob(['graph' in d ? graphXvg(d.graph) : matrixXvg(d.matrix)], { type: 'text/plain' });
  const o = exportLayout(p);
  return sceneFile('graph' in d ? graphScene(d.graph, o) : matrixScene(d.matrix, o), f, p);
}
const sceneFile = async (sc: Scene, f: ExportFormatAll, p: ExportPrefs) => (f === 'png' ? toPNG(sc, p.scale) : f === 'svg' ? new Blob([toSVG(sc)], { type: 'image/svg+xml' }) : toPDF(sc));

/**
 * Several graphs in the settings' layout (R8d): one file each (named by the caller), or one multi-page PDF, or one grid
 * figure in the default format, named `base`. Graphs are drawn one at a time, yielding between them; xvg is always one file each.
 */
export async function renderBatch(gs: { data: GraphData; name: string }[], p: ExportPrefs, base: string): Promise<{ name: string; blob: Blob; note?: string }[]> {
  const pause = () => new Promise(r => setTimeout(r, 0)), out: { name: string; blob: Blob }[] = [], scenes: Scene[] = [], o = exportLayout(p);
  const each = gs.length < 2 || p.layout === 'each' || p.format === 'xvg';
  for (const g of gs) { if (each) out.push({ name: g.name, blob: await renderExport({ graph: g.data }, p.format, p) }); else scenes.push(graphScene(g.data, o)); await pause(); }
  if (each) return out;
  if (p.layout === 'pdf') return [{ name: base + '.pdf', blob: toPDF(scenes), note: scenes.length + ' pages' }];
  return [{ name: base + '.' + p.format, blob: await sceneFile(gridScene(scenes, p.gridCols), p.format, p), note: scenes.length + ' graphs, ' + Math.min(p.gridCols, scenes.length) + ' columns' }];
}

/** A graph's file name from the settings' template; a graph without the template's fields (Compare) keeps its own. */
export function graphName(d: GraphData, p: ExportPrefs, ext: string, taken: Set<string>, f: { project: string; page: string }): string {
  const t = new Date(), date = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  return exportName(d.parts ? p.name : '{file}', { ...f, date, ...d.parts, file: d.file }, ext, taken);
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
