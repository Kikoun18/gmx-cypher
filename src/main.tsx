import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './tokens.css'
import { App } from './App'
import { readThemePref, themeOf } from './lib/theme'

// The page's theme before the first render. Set later (App's layout effect runs after its children's), a child that
// measures itself first is styled in the light theme and then animates into the dark one, and a chart drawn in that
// render takes the light palette (the backlog's theme race; an axe contrast check caught a toggle mid-transition).
document.documentElement.dataset.theme = themeOf(readThemePref(), window.matchMedia('(prefers-color-scheme: dark)').matches)

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
