// (de)Cypher's colours: Morpheus's tokens of this page (src/tokens.json) per theme, and the page's theme,
// <html data-theme>, followed live.

import * as React from 'react'
import tokensText from '../tokens.json?raw'
import { decypherKit, type Palette } from './kit'
import { themeTokens } from './tokens'

export const kit = decypherKit()
const TOKENS = themeTokens(tokensText)
export const PALETTES: Record<'light' | 'dark', Palette> = { light: kit.palette(false, TOKENS.light), dark: kit.palette(true, TOKENS.dark) }
export const TOKENS_BY_THEME = TOKENS

const current = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

/** The page's theme, as the header's light/dark/auto switch sets it on <html>. */
export function usePageTheme(): 'light' | 'dark' {
  const [t, setT] = React.useState<'light' | 'dark'>(current)
  React.useEffect(() => {
    const mo = new MutationObserver(() => setT(current()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])
  return t
}
