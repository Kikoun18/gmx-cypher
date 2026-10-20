// Morpheus tokens.json → tokens.css, as its README ("Building with shadcn/ui", step 3) describes:
// colours and shadows per theme, radii, spacing and the mono family under :root, one @font-face per file.
// gmx-cypher's role layer (roles.json, T159) comes over it: its tokens replace Morpheus's of the same name or are
// added, so tokens.json stays a verbatim copy. The generated file is never edited by hand: `npm run tokens`.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type Value = string | Record<string, string>;
interface Token { name: string; value: Value }
interface Tokens {
  name: string;
  color: { themes: { id: string }[]; tokens: Token[] };
  shadow?: { tokens: Token[] };
  radius: { tokens: Token[] };
  spacing: { tokens: Token[] };
  type: { fonts: { family: string; file: string; weight: string; style: string }[]; families: { mono: string } };
}

/** The role layer: colour tokens only, each replacing Morpheus's of its name or added after them. */
export interface Roles { name: string; color: { tokens: Token[] } }

/** Morpheus's colour tokens with the role layer's in their place (or added). */
export function withRoles(t: Token[], roles?: Roles): Token[] {
  if (!roles) return t;
  const by = new Map(roles.color.tokens.map(r => [r.name, r]));
  return [...t.map(x => by.get(x.name) ?? x), ...roles.color.tokens.filter(r => !t.some(x => x.name === r.name))];
}

export function tokensCss(t: Tokens, roles?: Roles): string {
  const themes = t.color.themes.map(x => x.id), first = themes[0];
  // An alias "{other-token}" is that token's variable; a token without a theme's value keeps the first theme's.
  const css = (v: string) => v.replace(/^\{([A-Za-z0-9_.-]+)\}$/, 'var(--$1)');
  const pick = (v: Value, theme: string) => css(typeof v === 'string' ? v : (v[theme] ?? v[first]));
  const themed = [...withRoles(t.color.tokens, roles), ...(t.shadow?.tokens || [])];
  const block = (selector: string, theme: string) => selector + ' {\n' + themed.map(x => '  --' + x.name + ': ' + pick(x.value, theme) + ';').join('\n') + '\n}\n';
  const plain = [...t.radius.tokens, ...t.spacing.tokens].map(x => '  --' + x.name + ': ' + x.value + ';');
  return [
    '/* ' + t.name + (roles ? ' with ' + roles.name : '') + ' — generated from tokens.json' + (roles ? ' and roles.json' : '') + ' by scripts/tokens.ts */',
    block(':root, [data-theme="' + first + '"]', first),
    ...themes.slice(1).map(theme => block('[data-theme="' + theme + '"]', theme)),
    ':root {\n' + plain.join('\n') + '\n  --font-mono: ' + t.type.families.mono + ';\n}\n',
    ...t.type.fonts.map(f => '@font-face { font-family: "' + f.family + '"; src: url("/' + f.file + '") format("woff2"); font-weight: ' + f.weight + '; font-style: ' + f.style + '; font-display: swap; }'),
  ].join('\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [from, to, roles] = process.argv.slice(2);
  writeFileSync(to, tokensCss(JSON.parse(readFileSync(from, 'utf8')), roles ? JSON.parse(readFileSync(roles, 'utf8')) : undefined));
}
