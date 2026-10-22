// Review finding 8: text on the rows the views mark (a selected job, a picked file, hover) keeps 4.5:1 in
// both themes. Morpheus' `secondary` (= `accent`) is too dark for its muted and status colours in light.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tokensCss } from '../scripts/tokens';
import { ROLES, TONES, UI_STATE } from '../src/core/contract';

const css = tokensCss(JSON.parse(readFileSync(new URL('../src/tokens.json', import.meta.url), 'utf8')), JSON.parse(readFileSync(new URL('../src/roles.json', import.meta.url), 'utf8')));
const block = (selector: string) => css.slice(css.indexOf(selector + ' {'), css.indexOf('}', css.indexOf(selector + ' {')));
const THEMES = { light: block(':root, [data-theme="light"]'), dark: block('[data-theme="dark"]') };

function colour(theme: string, name: string): string {
  const v = new RegExp('--' + name + ': ([^;]+);').exec(theme)![1], alias = /^var\(--([\w-]+)\)$/.exec(v);
  return alias ? colour(theme, alias[1]) : v;
}
function luminance(hex: string) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

const TEXT = ['foreground', 'muted-foreground', 'mint-strong', 'butter-strong', 'destructive'];
const ROWS = [
  { view: 'src/views/Jobs.tsx', background: 'muted', what: 'the selected job (on the page)' },
  { view: 'src/views/Inputs.tsx', background: 'background', what: 'a picked file (in a card)' },
];

describe('marked rows keep their text readable (4.5:1)', () => {
  it.each(ROWS)('$what: bg-$background, not secondary or accent', ({ view, background }) => {
    const src = readFileSync(new URL('../' + view, import.meta.url), 'utf8');
    expect(src).not.toMatch(/bg-(secondary|accent)\b/);
    expect(src).toContain('bg-' + background);
    for (const [name, theme] of Object.entries(THEMES)) {
      for (const t of TEXT) expect([name, t, ratio(colour(theme, t), colour(theme, background)) >= 4.5]).toEqual([name, t, true]);
    }
  });
});

/** OKLab of an sRGB hex (Björn Ottosson's matrices). */
function oklab(hex: string): number[] {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const distance = (a: string, b: string) => Math.hypot(...oklab(a).map((v, i) => v - oklab(b)[i]));
/** About five just-noticeable differences (≈ 0.02 each in OKLab): an error never passes for a group, the focus or the primary action. */
const APART = 0.1;

describe('colour roles (R4a, T159)', () => {
  it.each(Object.entries(THEMES))('%s: every tone\'s -strong is at least 3:1 on background and card; <tone>-foreground on <tone> at least 4.5:1', (_, theme) => {
    for (const t of TONES) {
      for (const g of ['background', 'card']) expect([t, g, ratio(colour(theme, t + '-strong'), colour(theme, g)) >= 3]).toEqual([t, g, true]);
      expect([t, ratio(colour(theme, t + '-foreground'), colour(theme, t)) >= 4.5]).toEqual([t, true]);
    }
  });

  it.each(Object.entries(THEMES))('%s: destructive is apart from every tone, ring and primary, and readable', (_, theme) => {
    const d = colour(theme, 'destructive');
    for (const other of [...TONES.flatMap(t => [t, t + '-strong', t + '-soft']), 'ring', 'primary']) expect([other, distance(d, colour(theme, other)) > APART]).toEqual([other, true]);
    for (const g of ['background', 'card']) expect(ratio(d, colour(theme, g))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(colour(theme, 'destructive-foreground'), d)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(THEMES))('%s: no UI-state token resolves to a data tone; the focus ring is at least 3:1 on every ground', (_, theme) => {
    const data = new Set(TONES.flatMap(t => [t, t + '-strong', t + '-soft', t + '-foreground']).map(n => colour(theme, n)));
    for (const n of UI_STATE) expect([n, data.has(colour(theme, n))]).toEqual([n, false]);
    for (const g of ['background', 'card', 'field']) expect(ratio(colour(theme, 'ring'), colour(theme, g))).toBeGreaterThanOrEqual(3);
  });

  it('every role has a token, and every token it names exists in both themes', () => {
    for (const [role, names] of Object.entries(ROLES)) {
      expect([role, names.length > 0]).toEqual([role, true]);
      for (const n of names) for (const theme of Object.values(THEMES)) expect([role, n, theme.includes('--' + n + ':')]).toEqual([role, n, true]);
    }
  });
});


describe('compare\'s group and reference chips keep their text readable (4.5:1), on the page and in the export (QA)', () => {
  it('every tone, picked, not picked, greyed and not plotted, in both themes; no state is drawn by opacity', async () => {
    const { kit } = await import('../src/core/index');
    const { themeTokens } = await import('../src/core/tokens');
    const T = themeTokens(readFileSync(new URL('../src/tokens.json', import.meta.url), 'utf8'), readFileSync(new URL('../src/roles.json', import.meta.url), 'utf8'));
    for (const dark of [false, true]) {
      const pal = kit.palette(dark, dark ? T.dark : T.light), low: string[] = [];
      const pair = (what: string, text: string, bg: string) => { const r = kit.contrast(text, bg); if (r < 4.5) low.push(what + ' ' + r.toFixed(2)); };
      for (const tone of kit.TONES) {
        const t = pal.hues[tone];
        pair(tone + ' picked', t.fg, t.base); pair(tone + ' not picked', pal.fg, t.soft); pair(tone + ' not picked, export', t.strong, t.soft);
      }
      pair('greyed (the rest grey)', pal.muted, pal.card); pair('reference not plotted', pal.muted, pal.card);
      expect([dark ? 'dark' : 'light', low]).toEqual([dark ? 'dark' : 'light', []]);
    }
    const panels = readFileSync(new URL('../src/decypher/panels.tsx', import.meta.url), 'utf8'), page = readFileSync(new URL('../src/decypher/export.ts', import.meta.url), 'utf8');
    expect(panels).toContain('grey ? pal.card');
    expect(panels).not.toMatch(/opacity-(45|70|75)/);
    expect(page).not.toMatch(/\.dc-(n|off)\{[^}]*opacity/);
  });
});
