import { existsSync, readFileSync } from 'node:fs';
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

describe('titles in Archivo 800 (T160)', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  it('from the self-hosted files only, latin and latin-ext, weight 800', () => {
    const faces = css.match(/@font-face\s*\{[^}]*Archivo[^}]*\}/g) ?? [];
    expect(faces).toHaveLength(2);
    for (const f of faces) { expect(f).toMatch(/src: url\("\/fonts\/archivo-latin(-ext)?-800-normal\.woff2"\)/); expect(f).toContain('font-weight: 800'); expect(f).toContain('unicode-range:'); }
    expect(css).not.toMatch(/https?:/);
    for (const f of ['archivo-latin-800-normal.woff2', 'archivo-latin-ext-800-normal.woff2', 'Archivo-LICENSE.txt']) expect(existsSync(new URL('../public/fonts/' + f, import.meta.url))).toBe(true);
  });
  it('for the title sizes only: the app name, page, dialog and card titles', () => {
    expect(css).toMatch(/\.text-title,\s*\.text-heading,\s*\.text-display\s*\{\s*font-family: var\(--font-title\);\s*font-weight: 800;/);
  });
});

