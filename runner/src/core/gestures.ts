// One gesture scheme (R8a): what a click means, with the keys held, the same on every surface. Pure: an event's
// keys in, an action out; the views only apply it.

/** The keys held with a click: ⌘ on macOS and Ctrl elsewhere are both "add". */
export interface Mods { shift?: boolean; alt?: boolean; add?: boolean }
export const modsOf = (e: { shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean }): Mods => ({ shift: e.shiftKey, alt: e.altKey, add: e.metaKey || e.ctrlKey })

/** A list's selection after a click on `id`: that one alone; with ⌘/Ctrl, it added or removed; with Shift, the range from the anchor. */
export function pickInList(order: string[], selected: string[], anchor: string | null, id: string, m: Mods): string[] {
  if (m.shift && anchor && order.includes(anchor)) { const [a, b] = [order.indexOf(anchor), order.indexOf(id)].sort((x, y) => x - y); return order.slice(a, b + 1) }
  if (m.add) return selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
  return [id]
}
