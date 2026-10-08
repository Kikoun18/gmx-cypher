import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tokensCss } from '../scripts/tokens';

const tokens = JSON.parse(readFileSync(new URL('../src/tokens.json', import.meta.url), 'utf8'));
const css = tokensCss(tokens);
const block = (selector: string) => css.slice(css.indexOf(selector + ' {'), css.indexOf('}', css.indexOf(selector + ' {')));

describe('tokens.css from Morpheus tokens.json', () => {
  it('puts every colour and shadow token in the light and the dark block', () => {
    const light = block(':root, [data-theme="light"]'), dark = block('[data-theme="dark"]');
    for (const t of [...tokens.color.tokens, ...tokens.shadow.tokens]) {
      expect(light).toContain('--' + t.name + ':');
      expect(dark).toContain('--' + t.name + ':');
    }
  });

  it('writes each theme its own value, and the first theme where one is missing', () => {
    expect(block(':root, [data-theme="light"]')).toContain('--background: #f3f2f2;');
    expect(block('[data-theme="dark"]')).toContain('--background: #141312;');
    expect(block('[data-theme="dark"]')).toContain('--primary: var(--coral);');
  });

  it('turns aliases into variables', () => {
    expect(css).toContain('--ring: var(--coral-strong);');
    expect(css).not.toMatch(/\{[a-z-]+\}/);
  });

  it('has radii, spacing and the mono family, unthemed', () => {
    const root = css.slice(css.lastIndexOf(':root {'));
    expect(root).toContain('--radius-md: 10px;');
    expect(root).toContain('--space-4: 16px;');
    expect(root).toContain('--font-mono: mononoki, ui-monospace');
  });

  it('declares one @font-face per self-hosted file, never a remote URL', () => {
    for (const f of tokens.type.fonts) expect(css).toContain('src: url("/' + f.file + '") format("woff2"); font-weight: ' + f.weight + '; font-style: ' + f.style);
    expect(css.match(/@font-face/g)).toHaveLength(4);
    expect(css).not.toMatch(/https?:/);
  });
});
