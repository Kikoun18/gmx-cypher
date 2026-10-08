// Export: xvg writers, plus a tiny scene graph rendered to SVG → PNG and to a
// hand-written vector PDF. Exports always use the light palette on white.

import { buildPlotMulti, labelLeft, type Mark } from './seq';
import { ramp, inkOn, norm, fmt } from './pmf';

const C = { bg: '#ffffff', ink: '#201e1d', mut: '#6b6663', line: '#dcd8d6', rule: '#201e1d', acc: '#ec3013' };
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
}

export interface MatrixData {
  file: string;
  kicker?: string;
  title: string;
  sub: string;
  metricLabel: string;
  unit: string;
  max: number;
  cols: { label: string; name: string; short: string; color: string }[];
  groups: { label: string; hasLabel: boolean; rows: { name: string; seq: string; group: string; cells: ({ v: number; n: number } | null)[] }[] }[];
}

type Item =
  | { t: 'text'; x: number; y: number; s: string; size: number; fill: string; anchor: 'start' | 'middle' | 'end'; bold: boolean; ls?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number; dash?: string }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number; dash?: string }
  | { t: 'poly'; segs: number[][][]; stroke: string; sw: number; dash?: string }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string };

export interface Scene { w: number; h: number; bg: string; items: Item[] }

export function fileBase(s: string): string {
  return String(s || 'export').trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'export';
}

// Approximate Helvetica advance widths (em) — enough for anchoring and wrapping.
const NARROW: Record<string, number> = { ' ': .278, '.': .278, ',': .278, ':': .278, ';': .278, '·': .278, '|': .26, '/': .278, '(': .333, ')': .333, '-': .333, '−': .584, '×': .584, '+': .584, '=': .584, '→': 1, '…': 1, i: .222, l: .222, j: .222, t: .278, f: .278, r: .333, I: .278, m: .833, w: .722, M: .833, W: .944 };
export function textW(s: string, size: number, bold?: boolean, ls = 0): number {
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
const text = (x: number, y: number, s: unknown, size: number, fill: string, anchor?: 'start' | 'middle' | 'end', bold?: boolean): Item =>
  ({ t: 'text', x, y, s: String(s == null ? '' : s), size, fill, anchor: anchor || 'start', bold: !!bold });
/**
 * Title block shared by every export: a red tick and a letter-spaced kicker,
 * the title in bold capitals, a quiet subtitle, then a hairline. Returns its bottom.
 */
function header(it: Item[], W: number, L: number, kicker: string | undefined, title: string, sub: string | undefined): number {
  const max = W - 2 * L;
  it.push({ t: 'rect', x: L, y: 22, w: 18, h: 3, fill: C.acc });
  if (kicker) it.push({ ...text(L + 28, 27, clip(kicker.toUpperCase(), 9, true, max - 28, 1.6), 9, C.acc, 'start', true), ls: 1.6 } as Item);
  it.push({ ...text(L, 60, clip(String(title || '').toUpperCase(), 24, true, max, 0.6), 24, C.ink, 'start', true), ls: 0.6 } as Item);
  let y = 60;
  if (sub) { y = 80; it.push(text(L, y, clip(sub, 11, false, max), 11, C.mut)); }
  y += 14;
  it.push(line(L, y, W - L, y, C.line, 1));
  return y;
}
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

export function graphScene(g: GraphData): Scene {
  const W = 820, L = 28, plotH = 420;
  const it: Item[] = [];
  const top = header(it, W, L, g.kicker, g.title, g.sub) + 40;
  const ser = g.series.length ? g.series : [{ x: [0, 1], y: [0, 0] }];
  const p = buildPlotMulti(ser, { w: W, h: top + plotH, domain: g.domain, yStep: g.yStep, pad: { l: 74, r: 28, t: top, b: 0 } });
  it.push(text(L, top - 16, g.yLabel, 10, C.mut));
  for (const t of p.yticks) { it.push(line(p.plotL, t.y, p.plotR, t.y, C.line, 1)); it.push(text(p.plotL - 8, t.y + 4, t.label, 11, C.mut, 'end')); }
  for (const t of p.xticks) { it.push(line(t.x, p.plotT, t.x, p.plotB + 5, C.line, 1)); it.push(text(t.x, p.plotB + 20, t.label, 11, C.mut, 'middle')); }
  if (p.inRangeZero) it.push(line(p.plotL, p.zeroY, p.plotR, p.zeroY, C.mut, 1, '2 3'));
  it.push(line(p.plotL, p.plotT, p.plotL, p.plotB, C.rule, 2), line(p.plotL, p.plotB, p.plotR, p.plotB, C.rule, 2));
  g.series.forEach((s, i) => it.push({ t: 'poly', segs: parseD(p.paths[i]), stroke: s.color, sw: s.width || 2, dash: s.dash }));
  for (const s of g.series) {
    const m = s.mark;
    if (!m || m.y < p.lo || m.y > p.hi) continue;
    const cx = p.sx(m.x), cy = p.sy(m.y);
    if (m.halo) it.push({ t: 'circle', cx, cy, r: 6, fill: C.bg }, { t: 'circle', cx, cy, r: 4.5, fill: s.color });
    else it.push({ t: 'circle', cx, cy, r: 3.5, fill: s.color });
    const ink = m.dim ? s.color : C.ink;
    if (m.label) it.push(labelLeft(cx, p.plotR) ? text(cx - 8, cy - 7, m.label, 10, ink, 'end') : text(cx + 8, cy - 7, m.label, 10, ink));
  }
  it.push(text(p.plotR, p.plotB + 40, g.xLabel, 10, C.mut, 'end'));
  let x = L, y = p.plotB + 72;
  for (const s of g.series.slice(0, 16)) {
    const w = 26 + textW(s.label, 11);
    if (x > L && x + w > W - L) { x = L; y += 20; }
    it.push(line(x, y - 4, x + 18, y - 4, s.color, 3, s.dash));
    it.push(text(x + 26, y, s.label, 11, C.ink));
    x += w + 22;
  }
  if (g.note) { y += 28; it.push(text(L, y, g.note, 9, C.mut)); }
  return { w: W, h: y + 28, bg: C.bg, items: it };
}

export function matrixScene(m: MatrixData): Scene {
  const L = 28, nameW = 230, cell = 56, gap = 6, nc = m.cols.length;
  const gridR = L + nameW + nc * (cell + gap) - gap;
  const W = Math.max(560, gridR + L);
  const cx = (j: number) => L + nameW + j * (cell + gap);
  const it: Item[] = [];
  let y = header(it, W, L, m.kicker, m.title, m.sub) + 30;
  it.push(text(L, y + 16, 'SEQUENCE', 9, C.mut));
  m.cols.forEach((c, j) => {
    it.push(text(cx(j) + cell / 2, y, clip(c.label, 15, true, cell + gap - 4), 15, c.color, 'middle', true));
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
        const t = norm(c.v, m.max), ink = inkOn(t, false);
        it.push({ t: 'rect', x: cx(j), y, w: cell, h: cell, fill: ramp(t, false) });
        it.push(text(cx(j) + cell / 2, y + cell / 2 + 4, fmt(c.v), 12, ink, 'middle', true));
        if (c.n > 1) {
          const tot = c.n * 3 + (c.n - 1) * 2;
          for (let k = 0; k < c.n; k++) it.push({ t: 'rect', x: cx(j) + cell / 2 - tot / 2 + k * 5, y: y + cell - 7, w: 3, h: 2, fill: ink });
        }
      });
      y += cell + gap;
    }
  }
  y += 22;
  const ttl = (m.metricLabel + ' magnitude').toUpperCase();
  it.push(text(L, y, ttl, 9, C.mut));
  const sx = L + textW(ttl, 9) + 14;
  for (let i = 0; i < 14; i++) it.push({ t: 'rect', x: sx + i * 14, y: y - 8, w: 14, h: 8, fill: ramp(i / 13, false) });
  it.push(text(sx + 14 * 14 + 12, y, '0 → ' + m.max.toFixed(1) + ' ' + m.unit, 10, C.mut));
  y += 22;
  let x = L;
  for (const c of m.cols) {
    const s1 = c.label, s2 = ' ' + (c.name || ''), w = textW(s1, 10, true) + textW(s2, 10) + 18;
    if (x > L && x + w > W - L) { x = L; y += 16; }
    it.push(text(x, y, s1, 10, c.color, 'start', true), text(x + textW(s1, 10, true), y, s2, 10, C.mut));
    x += w;
  }
  return { w: W, h: y + 28, bg: C.bg, items: it };
}

// --- renderers -------------------------------------------------------------

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dashAttr = (d?: string) => (d && d !== 'none' ? ' stroke-dasharray="' + d + '"' : '');

export function toSVG(sc: Scene): string {
  const o = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + sc.w + '" height="' + sc.h + '" viewBox="0 0 ' + sc.w + ' ' + sc.h + '">', '<rect width="100%" height="100%" fill="' + sc.bg + '"/>'];
  for (const i of sc.items) {
    if (i.t === 'rect') o.push('<rect x="' + i.x + '" y="' + i.y + '" width="' + i.w + '" height="' + i.h + '" fill="' + (i.fill || 'none') + '"' + (i.stroke ? ' stroke="' + i.stroke + '" stroke-width="' + (i.sw || 1) + '"' + dashAttr(i.dash) : '') + '/>');
    else if (i.t === 'line') o.push('<line x1="' + i.x1 + '" y1="' + i.y1 + '" x2="' + i.x2 + '" y2="' + i.y2 + '" stroke="' + i.stroke + '" stroke-width="' + i.sw + '"' + dashAttr(i.dash) + '/>');
    else if (i.t === 'poly') o.push('<path d="' + i.segs.map(s => 'M' + s.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L')).join('') + '" fill="none" stroke="' + i.stroke + '" stroke-width="' + i.sw + '" stroke-linejoin="round" stroke-linecap="round"' + dashAttr(i.dash) + '/>');
    else if (i.t === 'circle') o.push('<circle cx="' + i.cx + '" cy="' + i.cy + '" r="' + i.r + '" fill="' + i.fill + '"/>');
    else if (i.t === 'text') o.push('<text x="' + i.x + '" y="' + i.y + '" font-family="' + FONT + '" font-size="' + i.size + '"' + (i.bold ? ' font-weight="700"' : '') + ' fill="' + i.fill + '" text-anchor="' + i.anchor + '"' + (i.ls ? ' letter-spacing="' + i.ls + '"' : '') + '>' + esc(i.s) + '</text>');
  }
  o.push('</svg>');
  return o.join('');
}

export async function toPNG(sc: Scene, scale = 2): Promise<Blob> {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(toSVG(sc));
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = Math.round(sc.w * scale); cv.height = Math.round(sc.h * scale);
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = sc.bg; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
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

export function toPDF(sc: Scene): Blob {
  const H = sc.h, Y = (y: number) => n2(H - y);
  const dash = (d?: string) => (d && d !== 'none' ? '[' + String(d).trim().split(/[\s,]+/).join(' ') + '] 0 d' : '[] 0 d');
  const ops = ['1 j 1 J', col(sc.bg) + ' rg 0 0 ' + n2(sc.w) + ' ' + n2(H) + ' re f'];
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
    } else if (i.t === 'text') {
      const w = textW(i.s, i.size, i.bold, i.ls || 0);
      const x = i.anchor === 'end' ? i.x - w : i.anchor === 'middle' ? i.x - w / 2 : i.x;
      ops.push('BT /' + (i.bold ? 'F2' : 'F1') + ' ' + n2(i.size) + ' Tf ' + n2(i.ls || 0) + ' Tc ' + col(i.fill) + ' rg ' + n2(x) + ' ' + Y(i.y) + ' Td (' + pdfStr(i.s) + ') Tj ET');
    }
  }
  const content = ops.join('\n');
  const objs = [null,
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + n2(sc.w) + ' ' + n2(H) + '] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const off: number[] = [];
  for (let i = 1; i < objs.length; i++) { off[i] = out.length; out += i + ' 0 obj\n' + objs[i] + '\nendobj\n'; }
  const xref = out.length;
  out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n' + off.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return new Blob([Uint8Array.from(out, c => c.charCodeAt(0) & 255)], { type: 'application/pdf' });
}

// --- xvg -------------------------------------------------------------------

const q = (s: unknown) => String(s == null ? '' : s).replace(/"/g, "'");
const num = (v: number, w: number) => (Math.abs(v) >= 1e5 ? v.toExponential(5) : v.toFixed(4)).padStart(w);
function head(title: string, xl: string, yl: string, comments: (string | undefined)[]): string[] {
  return [
    '# Exported from PMF Sequences · ' + new Date().toISOString().slice(0, 19).replace('T', ' '),
    ...comments.filter(Boolean).map(c => '# ' + c),
    '@    title "' + q(title) + '"', '@    xaxis  label "' + q(xl) + '"', '@    yaxis  label "' + q(yl) + '"',
    '@TYPE xy', '@ view 0.15, 0.15, 0.75, 0.85', '@ legend on', '@ legend box on', '@ legend loctype view', '@ legend 0.78, 0.8', '@ legend length 2',
  ];
}

export function graphXvg(g: GraphData): string {
  const L = head(String(g.title).toUpperCase(), g.xLabel, g.yLabel, [g.kicker, g.sub, g.note]);
  g.series.forEach((s, i) => L.push('@ s' + i + ' legend "' + q(s.label) + '"'));
  for (const s of g.series) {
    const X = s.rx || s.x, Y = s.ry || s.y;
    for (let i = 0; i < X.length; i++) { const xv = X[i], yv = Y[i]; if (xv != null && yv != null && isFinite(yv)) L.push(num(xv, 12) + ' ' + num(yv, 14)); }
    L.push('&');
  }
  return L.join('\n') + '\n';
}

// One set per column; x = row index (listed in the header comments).
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

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
