// Export settings (R6b): the Matrix's ExportPrefs (size, theme, font, title, grid, legend, layout of several), kept in
// this browser under gmx-cypher's own key, and file names from a template with gmx-cypher's fields.

import * as React from 'react'
import { cleanExport, EXPORT_DEFAULTS, exportName, type ExportPrefs } from '../../../matrix/src/lib/exportPrefs'

export type { ExportPrefs }
export const PREFS_KEY = 'gmx-cypher-export'
/** gmx-cypher's file-name fields, as the settings list them. */
export const NAME_FIELDS = ['file', 'project', 'sequence', 'column', 'run', 'command', 'group', 'date'] as const
export type NameFields = Partial<Record<(typeof NAME_FIELDS)[number], string>>
/** The Matrix's defaults, a file named as the run names it. */
export const PREFS: ExportPrefs = { ...EXPORT_DEFAULTS, name: '{file}' }

/** Stored settings made valid: the Matrix's rules, gmx-cypher's name; xvg is not a format here (its CSV is, and the xvg stays in its folder). */
export function cleanPrefs(raw: unknown): ExportPrefs {
  const p = cleanExport(raw), name = (raw as { name?: unknown } | null)?.name
  return { ...p, format: p.format === 'xvg' ? PREFS.format : p.format, name: typeof name === 'string' && name.trim() ? p.name : PREFS.name }
}

/** A file name from the template: an empty field drops the separator before it; a name taken (any case) gets -2, -3. */
export function fileName(template: string, fields: NameFields, ext: string, taken = new Set<string>()): string {
  const d = new Date(), date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  return exportName(template, { date, ...fields }, ext, taken)
}

const read = (): ExportPrefs => { try { return cleanPrefs(JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null')) } catch { return PREFS } }
const listeners = new Set<() => void>()
let current: ExportPrefs | null = null

/** This browser's export settings, shared by every chart's menu and the settings dialog. */
export function useExportPrefs(): [ExportPrefs, (patch: Partial<ExportPrefs>) => void] {
  // Without a browser (the page-order test renders on the server), the defaults.
  const p = React.useSyncExternalStore(on => { listeners.add(on); return () => listeners.delete(on) }, () => (current ??= read()), () => PREFS)
  const set = React.useCallback((patch: Partial<ExportPrefs>) => {
    current = cleanPrefs({ ...(current ?? read()), ...patch })
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(current)) } catch { /* kept for this page only */ }
    listeners.forEach(l => l())
  }, [])
  return [p, set]
}
