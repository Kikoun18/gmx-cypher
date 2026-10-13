// Keys you can rebind (a browser preference, like the theme, never data): (de)Cypher's, D by default. A key is
// one key with any modifiers; none at all is allowed. Every open page follows a change at once.

import * as React from 'react'

export interface Binding { key: string; shift?: boolean; alt?: boolean; ctrl?: boolean; meta?: boolean }
export type Bindings = { decypher: Binding | null }

const STORE = 'gmx-cypher-keys', EVENT = 'gmx-cypher-keys'
export const DEFAULT_BINDINGS: Bindings = { decypher: { key: 'd' } }
const MODIFIERS = new Set(['Shift', 'Alt', 'Control', 'Meta', 'CapsLock', 'AltGraph', 'Fn', 'OS'])

/** A key as the page shows it: D, ⇧D, Ctrl+Alt+R, Space. */
export function keyLabel(b: Binding | null): string {
  if (!b) return 'none'
  const name = b.key === ' ' ? 'Space' : b.key.length === 1 ? b.key.toUpperCase() : b.key
  return (b.ctrl ? 'Ctrl+' : '') + (b.meta ? '⌘' : '') + (b.alt ? 'Alt+' : '') + (b.shift ? '⇧' : '') + name
}

/** The binding a key press makes; null for a modifier alone (still waiting for the key). */
export function bindingOf(e: { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): Binding | null {
  if (MODIFIERS.has(e.key)) return null
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  return { key, ...(e.shiftKey ? { shift: true } : {}), ...(e.altKey ? { alt: true } : {}), ...(e.ctrlKey ? { ctrl: true } : {}), ...(e.metaKey ? { meta: true } : {}) }
}

/** Whether a key press is this binding (shift may turn d into D: the letter is compared either way). */
export function matches(b: Binding | null, e: { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): boolean {
  if (!b) return false
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  return key === b.key && !!b.shift === e.shiftKey && !!b.alt === e.altKey && !!b.ctrl === e.ctrlKey && !!b.meta === e.metaKey
}

/** What a key would get in the way of, in words; '' when nothing. */
export function keyProblem(b: Binding | null): string {
  if (!b) return ''
  const plain = !b.ctrl && !b.meta && !b.alt
  if (plain && (b.key === 'c' || b.key === 'b')) return 'held C centres the 3D view on a group, and B shows its box: ' + keyLabel(b) + ' would do both'
  if (plain && ['f', 'r', '[', ']'].includes(b.key)) return 'inside (de)Cypher, F fits, R resets and [ ] step: ' + keyLabel(b) + ' would close it instead'
  if (b.key === 'Escape' || b.key === 'Tab' || b.key === 'Enter') return keyLabel(b) + ' already moves or closes things'
  if (b.ctrl || b.meta) return 'the browser may keep ' + keyLabel(b) + ' for itself'
  return ''
}

/** A key press inside a field is typing, never a shortcut. */
export const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)
}

function check(v: unknown): Bindings {
  const b = (v as Partial<Bindings> | null)?.decypher
  const ok = b === null || (!!b && typeof b === 'object' && typeof b.key === 'string' && b.key.length > 0 && b.key.length <= 20)
  return { decypher: ok ? (b ? { key: b.key, ...(b.shift ? { shift: true } : {}), ...(b.alt ? { alt: true } : {}), ...(b.ctrl ? { ctrl: true } : {}), ...(b.meta ? { meta: true } : {}) } : null) : DEFAULT_BINDINGS.decypher }
}

export function readBindings(): Bindings {
  try { const v = localStorage.getItem(STORE); return v ? check(JSON.parse(v)) : DEFAULT_BINDINGS } catch { return DEFAULT_BINDINGS }
}

export function saveBindings(b: Bindings) {
  try { localStorage.setItem(STORE, JSON.stringify(b)) } catch { /* a preference only */ }
  window.dispatchEvent(new Event(EVENT))
}

/** The bindings, kept current when settings (or another tab) changes them. */
export function useBindings(): [Bindings, (b: Bindings) => void] {
  const [b, setB] = React.useState<Bindings>(readBindings)
  React.useEffect(() => {
    const on = () => setB(readBindings())
    window.addEventListener(EVENT, on)
    window.addEventListener('storage', on)
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener('storage', on) }
  }, [])
  return [b, saveBindings]
}
