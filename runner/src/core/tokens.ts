// Morpheus's tokens with gmx-cypher's role layer, resolved per theme (aliases followed): for the canvas and chart colours, and for the exported
// page, which carries both themes.

interface TokenFile { color: { tokens: { name: string; value: string | Record<string, string> }[] }; shadow?: { tokens: { name: string; value: string | Record<string, string> }[] } }
export type ThemeTokens = { light: Record<string, string>; dark: Record<string, string> }

/** Every colour and shadow token per theme, the role layer's (T159) in place of Morpheus's, with "{other}" aliases replaced by the other token's value. */
export function themeTokens(json: string, rolesJson?: string): ThemeTokens {
  const t = JSON.parse(json) as TokenFile, roles = rolesJson ? (JSON.parse(rolesJson) as TokenFile).color.tokens : []
  const all = [...t.color.tokens.filter(x => !roles.some(r => r.name === x.name)), ...roles, ...(t.shadow?.tokens || [])]
  const one = (theme: 'light' | 'dark') => {
    const raw: Record<string, string> = Object.fromEntries(all.map(x => [x.name, typeof x.value === 'string' ? x.value : (x.value[theme] ?? x.value.light)]))
    const get = (v: string, depth = 0): string => { const m = /^\{([\w.-]+)\}$/.exec(v); return m && depth < 8 ? get(raw[m[1]] ?? v, depth + 1) : v }
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, get(v)]))
  }
  return { light: one('light'), dark: one('dark') }
}
