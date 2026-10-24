// One gesture scheme (R8a, contract §3): what a click or a key means, with the keys held, the same on every surface.
// Pure: an event's keys in, an action out; the views only apply it. The structure and legend rules live in the kit,
// so compare's exported page follows them too; they are named here for the app.

import { kit } from './index'

export const { legendPick, pickGroups, clickScope, pans, scopeAtoms } = kit

/** The keys held with a click: ⌘ on macOS and Ctrl elsewhere are both "add". */
export interface Mods { shift?: boolean; alt?: boolean; add?: boolean }
export const modsOf = (e: { shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean }): Mods => ({ shift: e.shiftKey, alt: e.altKey, add: e.metaKey || e.ctrlKey })

/** A list's selection after a click on `id`: that one alone; with ⌘/Ctrl, it added or removed; with Shift, the range from the anchor. */
export function pickInList(order: string[], selected: string[], anchor: string | null, id: string, m: Mods): string[] {
  if (m.shift && anchor && order.includes(anchor)) { const [a, b] = [order.indexOf(anchor), order.indexOf(id)].sort((x, y) => x - y); return order.slice(a, b + 1) }
  if (m.add) return selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
  return [id]
}

/** What a key does on a focused chart (as in the Matrix): step along the curve (Shift: ten), change curve, jump to an end, mark, draw a line, hide. */
export type ChartAction = { step: number } | { curve: number } | { to: 'first' | 'last' } | 'mark' | { line: 'x' | 'y' } | 'hide'
const CHART_KEYS: Record<string, (shift: boolean, mod: boolean) => ChartAction> = {
  ArrowRight: sh => ({ step: sh ? 10 : 1 }), ArrowLeft: sh => ({ step: sh ? -10 : -1 }), ArrowUp: () => ({ curve: -1 }), ArrowDown: () => ({ curve: 1 }),
  Home: () => ({ to: 'first' }), End: () => ({ to: 'last' }), Enter: (sh, mod) => (mod ? { line: sh ? 'y' : 'x' } : 'mark'), Escape: () => 'hide',
}
export const chartKey = (e: { key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): ChartAction | null =>
  e.altKey ? null : CHART_KEYS[e.key]?.(e.shiftKey, e.metaKey || e.ctrlKey) ?? null
