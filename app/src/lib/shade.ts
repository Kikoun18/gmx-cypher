// Curve shades (batch 2, R4): one column colour spread over the curves of a graph in OKLCH
// lightness, always at least 3:1 against the background it is drawn on. Returns hex for exports.

/** Shade adjustment range per curve, in steps of `STEP_L` OKLCH lightness (F63). */
export const SHADE_STEPS = 3;
const STEP_L = 0.04, MIN_CONTRAST = 3.2;

/** A curve's stored shade after one press: +1 lighter, −1 darker, 0 reset. 0 is stored as no value. */
export const nextShade = (cur: number | undefined, step: number) => {
  const v = step ? Math.max(-SHADE_STEPS, Math.min(SHADE_STEPS, (cur || 0) + step)) : 0;
  return v || undefined;
};

const hex2rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const rgb2hex = (c: number[]) => '#' + c.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gam = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const lum = (h: string) => { const [r, g, b] = hex2rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

/** WCAG contrast ratio of two hex colours. */
export const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

export function toOklch(h: string) {
  const [r, g, b] = hex2rgb(h).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), H: Math.atan2(B, A) };
}
function fromOklab(L: number, A: number, B: number) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
/** OKLCH → hex, lowering chroma until the colour fits in sRGB. */
function oklch(L: number, C: number, H: number) {
  for (let c = C; c > 0; c -= 0.002) { const rgb = fromOklab(L, c * Math.cos(H), c * Math.sin(H)); if (rgb.every(v => v >= -1e-4 && v <= 1 + 1e-4)) return rgb2hex(rgb.map(gam)); }
  return rgb2hex(fromOklab(L, 0, 0).map(gam));
}

/** Lightness range [lo, hi] where this hue keeps ≥ MIN_CONTRAST on bg, kept off black and white so the hue shows. */
const bands = new Map<string, { lo: number; hi: number }>();
function band(base: string, bg: string, dark: boolean) {
  const key = base + bg;
  if (!bands.has(key)) {
    const { C, H } = toOklch(base);
    const Ls = Array.from({ length: 101 }, (_, i) => i / 100).filter(L => contrast(oklch(L, C, H), bg) >= MIN_CONTRAST);
    const lo = Math.min(...Ls), hi = Math.max(...Ls);
    bands.set(key, dark ? { lo: lo + 0.01, hi: Math.min(hi, 0.9) } : { lo: Math.max(lo, 0.3), hi: hi - 0.01 });
  }
  return bands.get(key)!;
}

/**
 * The colour of curve `i` of `n` drawn from one column colour on background `bg` (both hex).
 * Curve 0 keeps the column colour; the others take evenly spaced lightness steps (≤ 0.08 apart),
 * darker first on a light background, lighter first on a dark one. `adjust` moves the curve by
 * whole steps (−SHADE_STEPS…SHADE_STEPS), clamped to the 3:1 range. `bw` gives greys, darkest
 * (lightest on dark) first.
 */
export function curveShade(base: string, bg: string, i: number, n: number, adjust = 0, bw = false): string {
  const dark = lum(bg) < 0.2;
  if (bw || !/^#[0-9a-f]{6}$/i.test(base)) base = dark ? '#ffffff' : '#000000';
  const o = toOklch(base), { lo, hi } = band(base, bg, dark);
  const L0 = Math.min(hi, Math.max(lo, o.L)), s = Math.min(0.08, (hi - lo) / Math.max(n, 1));
  const ks: number[] = [];
  for (let m = 0; ks.length < n && m < 40; m++) for (const k of m ? (dark ? [m, -m] : [-m, m]) : [0]) if (L0 + k * s >= lo - 1e-9 && L0 + k * s <= hi + 1e-9 && ks.length < n) ks.push(k);
  const a = Math.max(-SHADE_STEPS, Math.min(SHADE_STEPS, Math.round(adjust) || 0));
  const L = Math.min(hi, Math.max(lo, L0 + (ks[i] ?? 0) * s + a * STEP_L));
  return L === o.L ? base.toLowerCase() : oklch(L, o.C, o.H);
}

/** Backgrounds shades are made for: the theme's panel colour (the harder of page and panel in both themes), and the exports' white. */
export const SHADE_BG = { light: '#eae9e9', dark: '#1e1c1b', export: '#ffffff' };

export interface Shade { color: string; ex: string; i: number }

/**
 * The shade of every curve in one graph. Each group is a column's curves in run, then curve order,
 * hidden ones included, so hiding a curve never recolours the rest. `i` (the dash index) counts within
 * the column; in black and white it counts across the graph, since grey can't tell columns apart.
 */
export function graphShades(groups: { base: { light: string; dark: string }; ids: string[] }[], dark: boolean, bw: boolean, adjust: (id: string) => number = () => 0): Map<string, Shade> {
  const out = new Map<string, Shade>(), all = groups.flatMap(g => g.ids);
  for (const g of groups) g.ids.forEach((id, j) => {
    const i = bw ? all.indexOf(id) : j, n = bw ? all.length : g.ids.length, a = adjust(id);
    out.set(id, { i, color: curveShade(dark ? g.base.dark : g.base.light, dark ? SHADE_BG.dark : SHADE_BG.light, i, n, a, bw), ex: curveShade(g.base.light, SHADE_BG.export, i, n, a, bw) });
  });
  return out;
}
