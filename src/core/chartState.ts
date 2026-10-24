// What the charts of a page share, apart from the charts themselves: a result page's labels and figures, the export
// key's registry (R8b), and the marks of a chart that has none.

import * as React from 'react'
import type { NameFields } from './exportPrefs'
import type { Figure } from './export'
import type { Palette, Pins } from './kit'

export const NO_PINS: Pins = { points: [], lines: [] }
/** A result page's labels (R11d), by gmx name: a curve named for a renamed group shows its label. */
export const LabelsContext = React.createContext<Record<string, string>>({})

export interface ChartExport { file: string; fields?: NameFields; title: string; sub?: string; csv: () => string | Promise<string>; html?: (() => Promise<string>) | null; why?: string }

/** A page's charts, for its one export (R9b): each chart that exports is listed while it is drawn, in page order. */
export interface PageFigure { exp: ChartExport; figure: (pal: Palette) => Figure }
export const FiguresContext = React.createContext<Map<string, PageFigure> | null>(null)

/** The export key's charts (R8b): each export menu by its trigger, and the chart under the pointer. */
export const charts = { menus: new Map<HTMLElement, () => void>(), pointed: null as HTMLElement | null }
/** The export key: the focused chart, else the one under the pointer, in the default format; false when there is none. */
export function exportFocused(): boolean {
  let el = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-slot=chart]') ?? charts.pointed
  for (; el; el = el.parentElement) for (const [t, go] of charts.menus) if (el.contains(t)) { go(); return true }
  return false
}
