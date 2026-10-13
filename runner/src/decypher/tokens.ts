// Morpheus's tokens resolved per theme (aliases followed): for the canvas and chart colours, and for the exported
// page, which carries both themes.

interface TokenFile { color: { tokens: { name: string; value: string | Record<string, string> }[] }; shadow?: { tokens: { name: string; value: string | Record<string, string> }[] } }
export type ThemeTokens = { light: Record<string, string>; dark: Record<string, string> }

/** Every colour and shadow token per theme, with "{other}" aliases replaced by the other token's value. */
export function themeTokens(json: string): ThemeTokens {
  const t = JSON.parse(json) as TokenFile, all = [...t.color.tokens, ...(t.shadow?.tokens || [])]
  const one = (theme: 'light' | 'dark') => {
    const raw: Record<string, string> = Object.fromEntries(all.map(x => [x.name, typeof x.value === 'string' ? x.value : (x.value[theme] ?? x.value.light)]))
    const get = (v: string, depth = 0): string => { const m = /^\{([\w.-]+)\}$/.exec(v); return m && depth < 8 ? get(raw[m[1]] ?? v, depth + 1) : v }
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, get(v)]))
  }
  return { light: one('light'), dark: one('dark') }
}
