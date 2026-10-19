// The core's colours (R5c): Morpheus's tokens of this page (src/tokens.json, with the role layer src/roles.json) per
// theme, for every chart and structure view, and the page's theme, <html data-theme>, followed live.

import * as React from 'react'
import tokensText from '../tokens.json?raw'
import rolesText from '../roles.json?raw'
import { kit } from './index'
import type { Palette } from './kit'
import { themeTokens } from './tokens'

export { kit }
const TOKENS = themeTokens(tokensText, rolesText)
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
