// Colour scales per metric (batch 3, R4b, section 1.3): from zero (magnitude, today's for Area and Min), min–max
// (the lowest value on the first tinted step, so no tile looks empty), and diverging around a value (the warm ramp
// above it, the cool one below). All values equal, or a single value, sit in the middle.

import { contrast, inkFor, norm, ramp, rampSky } from './pmf';
import type { MetricDef } from './types';
import { isPmfBuiltin } from './metrics';

const T0 = 0.15;
const num = (v: number) => String(Number(v.toPrecision(3))).replace('-', '−');
const rgb = (s: string) => (/rgb\((\d+),(\d+),(\d+)\)/.exec(s) || []).slice(1).map(Number);
export const contrastOn = (bg: string, ink: string) => contrast(rgb(bg), rgb(ink));

export interface Scale {
  kind: MetricDef['scale']['kind'];
  /** Where a value sits on its ramp, 0–1. */
  t(v: number): number;
  side(v: number): 'above' | 'below';
  color(v: number, dark: boolean): string;
  ink(v: number, dark: boolean): string;
  legend(unit: string): { title: string; range: string };
}

export function scaleFor(def: MetricDef, values: number[]): Scale {
  const kind = def.scale?.kind || 'zero', lo = Math.min(...values), hi = Math.max(...values), u = (s: string, unit: string) => s + (unit ? ' ' + unit : '');
  if (kind === 'diverging') {
    const c = def.scale.center ?? 0, dev = values.length ? Math.max(...values.map(v => Math.abs(v - c))) : 0;
    const t = (v: number) => (dev > 0 ? Math.min(1, Math.abs(v - c) / dev) : 0), side = (v: number) => (v < c ? 'below' as const : 'above' as const);
    const color = (v: number, dark: boolean) => (side(v) === 'below' ? rampSky : ramp)(t(v), dark);
    return { kind, t, side, color, ink: (v, dark) => inkFor(color(v, dark), dark), legend: unit => ({ title: def.label + ' · around ' + num(c), range: values.length ? u(num(Math.min(lo, c)) + ' ← ' + num(c) + ' → ' + num(Math.max(hi, c)), unit) : '' }) };
  }
  if (kind === 'minmax') {
    const t = (v: number) => (values.length && hi > lo ? T0 + ((v - lo) / (hi - lo)) * (1 - T0) : 0.5);
    return { kind, t, side: () => 'above', color: (v, dark) => ramp(t(v), dark), ink: (v, dark) => inkFor(ramp(t(v), dark), dark), legend: unit => ({ title: def.label + ' · lowest to highest', range: values.length ? u(num(lo) + ' → ' + num(hi), unit) : '' }) };
  }
  const max = values.length ? Math.max(...values.map(Math.abs)) : 0;
  const t = (v: number) => (max > 0 ? norm(v, max) : 0);
  return {
    kind: 'zero', t, side: () => 'above', color: (v, dark) => ramp(t(v), dark), ink: (v, dark) => inkFor(ramp(t(v), dark), dark),
    legend: unit => ({ title: def.label + ' magnitude', range: u('0 → ' + (isPmfBuiltin(def) ? max.toFixed(1) : num(max)), unit) }),
  };
}
