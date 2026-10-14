// Shared visual + PMF geometry helpers.

import type { Column } from './types';

/** What a new project starts with: one column, to rename, replace or add to. */
export const DEFAULT_COLS: Column[] = [
  { k: 'col1', label: 'COL1', short: 'COL1', name: 'COL1', dark: '#ff6a4d', light: '#c62410' },
];

/** The three columns every project started with before DEFAULT_COLS: what a dataset saved without columns of its own refers to. */
export const FORMER_COLS: Column[] = [
  { k: 'o26', label: 'O26', short: 'O-antigen', name: 'O-antigen · E. coli', dark: '#ff6a4d', light: '#c62410' },
  { k: 'pg', label: 'PG', short: 'Peptidoglycan', name: 'Peptidoglycan', dark: '#6aa9ff', light: '#1a5fb4' },
  { k: 'ha', label: 'HA', short: 'Hyaluronan', name: 'Hyaluronan', dark: '#5fc08a', light: '#1a7a4c' },
];

// Both ramps stay inside one lightness half, so a single ink always clears 4.5:1.
const RAMP_DARK = ['#1b1918', '#3d0d04', '#6d1508', '#a81d08'];
const RAMP_LIGHT = ['#f3f2f2', '#ffd8cf', '#ffb09c', '#ff8f79'];

function hex2rgb(h: string): number[] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

const SKY_DARK = ['#1b1918', '#0b2a40', '#123f63', '#1b5a8c'];
const SKY_LIGHT = ['#f3f2f2', '#d7e8f6', '#acd0ef', '#84b8e6'];
/** The cool ramp for values below a diverging scale's centre (R4b), from the same page colour. */
export function rampSky(t: number, dark: boolean): string { return between(dark ? SKY_DARK : SKY_LIGHT, t); }
export function ramp(t: number, dark: boolean): string { return between(dark ? RAMP_DARK : RAMP_LIGHT, t); }
function between(hexes: string[], t: number): string {
  const stops = hexes.map(hex2rgb);
  const u = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(u));
  const f = u - i;
  const c = stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function relLum(rgb: number[]): number {
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

export function contrast(a: number[], b: number[]): number {
  const l1 = relLum(a), l2 = relLum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Pick whichever ink actually clears more contrast on this exact swatch,
// rather than flipping at a fixed point on the ramp.
export function inkOn(t: number, dark: boolean): string { return inkFor(ramp(t, dark), dark); }
/** The ink (near white or near black) with more contrast on a swatch given as rgb(r,g,b). */
export function inkFor(swatch: string, dark: boolean): string {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(swatch)!;
  const bg = [+m[1], +m[2], +m[3]];
  const light = dark ? [239, 237, 236] : [255, 242, 239];
  const dk = dark ? [23, 21, 20] : [32, 30, 29];
  return contrast(bg, light) >= contrast(bg, dk)
    ? `rgb(${light[0]},${light[1]},${light[2]})`
    : `rgb(${dk[0]},${dk[1]},${dk[2]})`;
}

// Perceptual spread: low-magnitude cells stay distinguishable.
export function norm(v: number, max: number): number { return Math.pow(Math.abs(v) / max, 0.55); }

export function fmt(v: number): string {
  const a = Math.abs(v);
  return a < 0.01 ? v.toFixed(3) : a < 10 ? v.toFixed(2) : v.toFixed(1);
}

// The xvg PMF is normalised by gmx awh (its own minimum sits at 0) and still
// carries the r^2 shell entropy, so it decays instead of plateauing. Adding
// 2kT·ln r flattens the tail; referencing that tail to zero exposes the well.
// Matches the analysis script: +2kT ln r with kB = 0.008314463 kJ/(mol K),
// then the mean of the last 10 % of points subtracted so the tail sits at zero.
export const BOLTZMANN = 0.008314463;
export const CORRECTION = { temperature: 310.15, f: 2, plateauFraction: 0.1 };

export function correctCurve(x: number[], ys: number[], o?: Partial<typeof CORRECTION>): number[] {
  const { temperature, f, plateauFraction } = { ...CORRECTION, ...o };
  const kT = BOLTZMANN * temperature;
  const c = ys.map((v, i) => (x[i] > 0 ? v + f * kT * Math.log(x[i]) : v));
  const tail = Math.max(1, Math.round(c.length * plateauFraction));
  let sum = 0;
  for (let i = c.length - tail; i < c.length; i++) sum += c[i];
  const ref = sum / tail;
  return c.map(v => v - ref);
}

export function wellArea(x: number[], ys: number[]): number {
  let a = 0;
  for (let i = 1; i < ys.length; i++) {
    const m = (ys[i] + ys[i - 1]) / 2;
    if (m < 0) a += m * (x[i] - x[i - 1]);
  }
  return a;
}

export function runStats(ys: (number | null)[]): { min: number; at: number } {
  let mi = 0;
  for (let i = 1; i < ys.length; i++) if ((ys[i] ?? Infinity) < (ys[mi] ?? Infinity)) mi = i;
  return { min: ys[mi] ?? 0, at: mi };
}
