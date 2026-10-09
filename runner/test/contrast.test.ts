// Review finding 8: text on the rows the views mark (a selected job, a picked file, hover) keeps 4.5:1 in
// both themes. Morpheus' `secondary` (= `accent`) is too dark for its muted and status colours in light.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tokensCss } from '../scripts/tokens';

const css = tokensCss(JSON.parse(readFileSync(new URL('../src/tokens.json', import.meta.url), 'utf8')));
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
