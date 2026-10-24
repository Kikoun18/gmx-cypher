// Ramps for ordered curves (R7a): AWH's frames in time, WHAM's windows along ξ. The role layer's ramp-0…3 stops,
// interpolated in OKLCH (the Matrix's toOklch; its inverse here, as shade.ts keeps its own to itself), so lightness
// moves one way along the ramp and every step stays at least 3:1 on the page (test/ramp.test.ts).

import { grey } from '../../../matrix/src/lib/export'
import { toOklch } from '../../../matrix/src/lib/shade'

const gam = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
const hex = (rgb: number[]) => '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, gam(v))) * 255).toString(16).padStart(2, '0')).join('')
/** OKLCH → hex, lowering chroma until the colour fits in sRGB (as the Matrix's shade.ts does). */
function fromOklch(L: number, C: number, H: number): string {
  for (let c = C; ; c = Math.max(0, c - 0.002)) {
    const A = c * Math.cos(H), B = c * Math.sin(H)
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
    const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
    if (c === 0 || rgb.every(v => v >= -1e-4 && v <= 1 + 1e-4)) return hex(rgb)
  }
}

/** n colours along the stops, evenly in OKLCH (hue the short way round); the first and last are the stops themselves. */
export function ramp(stops: string[], n: number): string[] {
  if (n <= 1) return stops.slice(0, 1)
  const o = stops.map(toOklch), seg = stops.length - 1
  return Array.from({ length: n }, (_, i) => {
    if (i === 0) return stops[0]
    if (i === n - 1) return stops[seg]
    const t = (i / (n - 1)) * seg, k = Math.min(seg - 1, Math.floor(t)), f = t - k, a = o[k], b = o[k + 1]
    let dH = b.H - a.H
    if (dH > Math.PI) dH -= 2 * Math.PI
    if (dH < -Math.PI) dH += 2 * Math.PI
    return fromOklch(a.L + (b.L - a.L) * f, a.C + (b.C - a.C) * f, a.H + dH * f)
  })
}

/** A colour's grey level, as the Matrix's print theme draws it. */
const greyOf = (c: string) => parseInt(grey(c).slice(1, 3), 16)

/**
 * The ramp of n colours in each theme, from resolved tokens: what a curve carries to the page and to its exports.
 * Print gets even greys from the first stop's grey to the last's: the stops' own greys bunch up at the dark end.
 */
export function rampColors(n: number, tokens: { light: Record<string, string>; dark: Record<string, string> }): { light: string; dark: string; print: string }[] {
  const of = (t: Record<string, string>) => ramp([0, 1, 2, 3].map(i => t['ramp-' + i]), n)
  const light = of(tokens.light), dark = of(tokens.dark), g0 = greyOf(light[0]), g1 = greyOf(light[light.length - 1])
  return light.map((l, i) => { const v = Math.round(g0 + (g1 - g0) * (n > 1 ? i / (n - 1) : 0)).toString(16).padStart(2, '0'); return { light: l, dark: dark[i], print: '#' + v + v + v } })
}
