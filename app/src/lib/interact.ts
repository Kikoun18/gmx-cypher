// Graph interaction (batch 3, R5): the nearest data point on the full data (never the decimated drawing, F101),
// pixels ↔ data on the plot's linear axes, and the hover / keyboard readout.

import { fmtValue, labelParts, splitUnit, type buildPlotMulti } from './seq';

type Geo = ReturnType<typeof buildPlotMulti>;
const fin = (v: number | null | undefined): v is number => typeof v === 'number' && isFinite(v);

// Whether an x array is sorted (either way), once per array.
const order = new WeakMap<object, 1 | -1 | 0>();
function sortedWay(xs: (number | null)[]): 1 | -1 | 0 {
  let o = order.get(xs);
  if (o === undefined) {
    const v = xs.filter(fin);
    o = v.every((q, i) => !i || q >= v[i - 1]) ? 1 : v.every((q, i) => !i || q <= v[i - 1]) ? -1 : 0;
    order.set(xs, o);
  }
  return o;
}

/** The index of the data point nearest to x that has a value (gaps are skipped); -1 if there is none. */
export function nearestIndex(xs: (number | null)[], ys: (number | null)[], x: number): number {
  const ok = (i: number) => fin(xs[i]) && fin(ys[i]), d = (i: number) => Math.abs((xs[i] as number) - x);
  const way = sortedWay(xs);
  if (!way) { let best = -1; for (let i = 0; i < xs.length; i++) if (ok(i) && (best < 0 || d(i) < d(best))) best = i; return best; }
  // Binary search for the first index at or past x (in the array's own direction), then the nearest valid point on each side.
  let lo = 0, hi = xs.length;
  while (lo < hi) { const mid = (lo + hi) >> 1, v = xs[mid]; if (fin(v) && way * v < way * x) lo = mid + 1; else if (!fin(v)) { let k = mid; while (k < hi && !fin(xs[k])) k++; if (k < hi && way * (xs[k] as number) < way * x) lo = k + 1; else hi = mid; } else hi = mid; }
  let l = lo - 1, r = lo;
  while (l >= 0 && !ok(l)) l--;
  while (r < xs.length && !ok(r)) r++;
  if (l < 0) return r < xs.length ? r : -1;
  if (r >= xs.length) return l;
  return d(r) < d(l) ? r : l;
}

/** The next point with a value in a direction (keyboard stepping); stays put at either end. */
export function stepIndex(ys: (number | null)[], i: number, dir: 1 | -1): number {
  for (let k = i + dir; k >= 0 && k < ys.length; k += dir) if (fin(ys[k])) return k;
  return i;
}

export const dataToPx = (g: Geo, x: number, y: number) => ({ px: g.sx(x), py: g.sy(y) });
export const pxToData = (g: Geo, px: number, py: number) => ({
  x: g.x0 + ((px - g.plotL) / (g.plotR - g.plotL)) * (g.x1 - g.x0),
  y: g.hi - ((py - g.plotT) / (g.plotB - g.plotT)) * (g.hi - g.lo),
});

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ⁿ', SUB = '₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎', KEYS = '0123456789+-−=()n';
/** A label as plain text (for announcements): ^{…} and _{…} as Unicode super- and subscripts where they exist. */
export const plainText = (label: string) => labelParts(label).map(p => (p.v ? [...p.t].map(c => { const k = KEYS.indexOf(c), t = p.v > 0 ? SUP : SUB; return k >= 0 && t[k] ? t[k] : c; }).join('') : p.t)).join('');
/** A label's unit as plain text ("kg m⁻³"), or ''. */
export const unitText = (label: string) => plainText(splitUnit(label)[1].slice(1, -1));
const unitOf = unitText;
export interface Reading { label: string; color: string; series: number; i: number; x: number; y: number; raw?: number; xUnit: string; yUnit: string; text: string }

/** Each curve at its point nearest to x, with units; a smoothed curve gives its value before smoothing too (F101). */
export function readout(series: { label: string; color: string; rx: (number | null)[]; ry: (number | null)[]; uy?: (number | null)[] }[], x: number, xLabel: string, yLabel: string): Reading[] {
  const xUnit = unitOf(xLabel), yUnit = unitOf(yLabel), u = (v: number, unit: string) => fmtValue(v) + (unit ? ' ' + unit : '');
  return series.flatMap((s, k) => {
    const i = nearestIndex(s.rx, s.ry, x);
    if (i < 0) return [];
    const xv = s.rx[i] as number, yv = s.ry[i] as number, raw = s.uy && fin(s.uy[i]) ? (s.uy[i] as number) : undefined;
    return [{ label: s.label, color: s.color, series: k, i, x: xv, y: yv, ...(raw !== undefined ? { raw } : {}), xUnit, yUnit,
      text: s.label + ': x = ' + u(xv, xUnit) + ', y = ' + u(yv, yUnit) + (raw !== undefined ? ' (smoothed; ' + fmtValue(raw) + ' before smoothing)' : '') }];
  });
}

/**
 * The data point a click marks (R5b): among the drawn curves, the point nearest the pointer on screen, within `maxPx`
 * pixels; points without a value never count. Searches only the points whose x is within reach, on the full data.
 */
export function snapPoint(series: { rx: (number | null)[]; ry: (number | null)[] }[], g: Geo, px: number, py: number, maxPx = 12): { series: number; i: number } | null {
  const a = pxToData(g, px - maxPx, py).x, b = pxToData(g, px + maxPx, py).x, lo = Math.min(a, b), hi = Math.max(a, b);
  let best: { series: number; i: number; d: number } | null = null;
  series.forEach((s, k) => {
    const way = sortedWay(s.rx);
    // The run of indices whose x can be within reach: from the nearest point to lo, walking towards hi.
    let start = 0, end = s.rx.length - 1;
    if (way) {
      const i0 = nearestIndex(s.rx, s.rx.map(() => 0), way > 0 ? lo : hi);
      start = Math.max(0, i0 - 1);
    }
    for (let i = start; i <= end; i++) {
      const x = s.rx[i], y = s.ry[i];
      if (!fin(x)) continue;
      if (way && (way > 0 ? x > hi : x < lo)) break;
      if (!fin(y) || x < lo || x > hi) continue;
      const d = Math.hypot(g.sx(x) - px, g.sy(y) - py);
      if (d <= maxPx && (!best || d < best.d)) best = { series: k, i, d };
    }
  });
  return best ? { series: (best as { series: number }).series, i: (best as { i: number }).i } : null;
}

/** A value picked with the pointer, rounded to a thousandth of the axis (so a line reads "x = 1.99", not "x = 1.98734"). */
export function roundToAxis(v: number, lo: number, hi: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.abs(hi - lo) / 1000 || 1)));
  return Number((Math.round(v / p) * p).toPrecision(12));
}

/** The modifier key's name: ⌘ on macOS, Ctrl elsewhere (R5c). */
export const modKeyLabel = (platform = typeof navigator === 'undefined' ? '' : ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || '')) => (/mac|iphone|ipad/i.test(platform) ? '⌘' : 'Ctrl');

/** A mark's y (F100): the value at exactly its x, or null when x is no longer a data point there. */
export function pinY(rx: (number | null)[], ry: (number | null)[], x: number): number | null {
  const i = rx.findIndex(v => v != null && Math.abs(v - x) <= 1e-9 * Math.max(1, Math.abs(x))), y = i >= 0 ? ry[i] : null;
  return fin(y) ? y : null;
}
/** An x typed for a mark, moved to its curve's nearest data point (a mark always sits on data). */
export const snapX = (rx: (number | null)[], ry: (number | null)[], x: number) => { const i = nearestIndex(rx, ry, x); return i < 0 ? x : (rx[i] as number); };
