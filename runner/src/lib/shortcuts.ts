// The keys (R8b, contract §3): every action that has a key, rebindable in settings → keyboard (a browser preference,
// like the theme, never data), and the keys that are not rebound. Every key handler reads its key here; nothing else
// writes one. A key is one key with any modifiers, or none at all. Every open page follows a change at once.

import * as React from 'react'
import { KEYS, type KeyAction } from '../core/contract'
import { browserPlatform, isApple } from './platform'

export interface Binding { key: string; shift?: boolean; alt?: boolean; ctrl?: boolean; meta?: boolean }
export type Bindings = Record<KeyAction, Binding | null>

const STORE = 'gmx-cypher-keys', EVENT = 'gmx-cypher-keys'
export const DEFAULT_BINDINGS = Object.fromEntries(KEYS.map(k => [k.action, { key: k.key }])) as Bindings
const MODIFIERS = new Set(['Shift', 'Alt', 'Control', 'Meta', 'CapsLock', 'AltGraph', 'Fn', 'OS'])

/** The keys that are not rebound: Enter submits a field (and marks a chart's point), Esc backs out or closes, Space held pans a 3D view. */
const FIXED = { enter: 'Enter', escape: 'Escape', space: ' ' } as const
export const pressed = (e: { key: string }, k: keyof typeof FIXED) => e.key === FIXED[k]
const FIXED_WORDS: Record<string, string> = { Escape: 'backs out or closes', Enter: 'submits a field and marks a point on a chart', ' ': 'pans a 3D view while held', Tab: 'moves between controls' }

/** A letter or a named key (F2, ArrowUp): Shift makes another key of it. A character such as ? or [ is the same key whatever made it. */
const shiftCounts = (key: string) => key.length > 1 || /^[a-z]$/i.test(key)
const norm = (key: string) => (key.length === 1 ? key.toLowerCase() : key)

/** A key as the keyboard in front of you prints it: D, ⇧D, ⌃⌥R or Ctrl+Alt+R, Space. */
export function keyLabel(b: Binding | null, platform: string = browserPlatform()): string {
  if (!b) return 'none'
  const name = b.key === ' ' ? 'Space' : b.key.length === 1 ? b.key.toUpperCase() : b.key
  return isApple(platform)
    ? (b.ctrl ? '⌃' : '') + (b.alt ? '⌥' : '') + (b.shift ? '⇧' : '') + (b.meta ? '⌘' : '') + name
    : (b.ctrl ? 'Ctrl+' : '') + (b.meta ? 'Meta+' : '') + (b.alt ? 'Alt+' : '') + (b.shift ? 'Shift+' : '') + name
}

type Press = { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }
/** The binding a key press makes; null for a modifier alone (still waiting for the key). */
export function bindingOf(e: Press): Binding | null {
  if (MODIFIERS.has(e.key)) return null
  const key = norm(e.key)
  return { key, ...(e.shiftKey && shiftCounts(key) ? { shift: true } : {}), ...(e.altKey ? { alt: true } : {}), ...(e.ctrlKey ? { ctrl: true } : {}), ...(e.metaKey ? { meta: true } : {}) }
}

/** Whether a key press is this binding (Shift may turn d into D: the letter is compared either way). */
export function matches(b: Binding | null, e: Press): boolean {
  if (!b) return false
  const key = norm(e.key)
  return key === b.key && (!shiftCounts(key) || !!b.shift === e.shiftKey) && !!b.alt === e.altKey && !!b.ctrl === e.ctrlKey && !!b.meta === e.metaKey
}
/** Whether a key press or release is this held key (C held), whatever else is held with it. */
export const holds = (b: Binding | null, e: { key: string }) => !!b && norm(e.key) === b.key

const same = (a: Binding | null, b: Binding | null) => !!a && !!b && a.key === b.key && !!a.shift === !!b.shift && !!a.alt === !!b.alt && !!a.ctrl === !!b.ctrl && !!a.meta === !!b.meta

/** What a key for `action` would get in the way of, in words; '' when nothing. */
export function keyProblem(b: Binding | null, action: KeyAction, bindings: Bindings, platform: string = browserPlatform()): string {
  if (!b) return ''
  const label = keyLabel(b, platform), other = KEYS.find(k => k.action !== action && same(bindings[k.action], b))
  if (other) return label + ' already ' + other.words + (other.where === 'anywhere' ? '' : ' (' + other.where + ')')
  const fixed = FIXED_WORDS[b.key] ?? (/^Arrow/.test(b.key) || b.key === 'Home' || b.key === 'End' ? 'steps along a chart' : '')
  if (fixed) return (b.key === 'Escape' ? 'Esc' : label) + ' already ' + fixed + ': it can\'t be rebound'
  if (b.ctrl || b.meta) return 'the browser may keep ' + label + ' for itself'
  if (KEYS.find(k => k.action === action)?.held && (b.alt || b.shift)) return 'a key held while clicking can\'t take a modifier: ' + label + ' would change the click'
  return ''
}

/** A key press inside a field is typing, never a shortcut. */
export const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)
}

const binding = (b: unknown): Binding | null | undefined => {
  if (b === null) return null
  const x = b as Binding | undefined
  return x && typeof x === 'object' && typeof x.key === 'string' && x.key.length > 0 && x.key.length <= 20
    ? { key: x.key, ...(x.shift ? { shift: true } : {}), ...(x.alt ? { alt: true } : {}), ...(x.ctrl ? { ctrl: true } : {}), ...(x.meta ? { meta: true } : {}) } : undefined
}
/** Stored bindings, each checked; a key stored before the registry (the compare key, as `decypher`) is kept as the compare key. */
export function cleanBindings(v: unknown): Bindings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const raw: Record<string, unknown> = { ...o, ...('decypher' in o && !('compare' in o) ? { compare: o.decypher } : {}) }
  return Object.fromEntries(KEYS.map(k => { const b = binding(raw[k.action]); return [k.action, b === undefined ? DEFAULT_BINDINGS[k.action] : b] })) as Bindings
}

export function readBindings(): Bindings {
  try { const v = localStorage.getItem(STORE); return v ? cleanBindings(JSON.parse(v)) : DEFAULT_BINDINGS } catch { return DEFAULT_BINDINGS }
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

/** Whether a key press, outside a field, is the key of `action`. */
export const isKey = (bindings: Bindings, action: KeyAction, e: Press & { target: EventTarget | null }) => !typing(e.target) && matches(bindings[action], e)
