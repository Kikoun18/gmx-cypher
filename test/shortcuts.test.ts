// The key registry (R8b, contract §3): every key in one place, rebindable, with its conflicts in words; labels as the
// keyboard in front of you prints them; the sheet lists every action.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { KEYS } from '../src/core/contract'
import { bindingOf, cleanBindings, DEFAULT_BINDINGS, keyLabel, keyProblem, matches, type Bindings } from '../src/lib/shortcuts'
import { modName } from '../src/lib/platform'
import { SheetBody } from '../src/ui/shortcut-sheet'

const press = (key: string, mods: Partial<Record<'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey', boolean>> = {}) => ({ key, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...mods })

describe('the registry', () => {
  it('has the contract\'s keys, each by default as the contract says', () => {
    expect(KEYS.map(k => k.action)).toEqual(['compare', 'export', 'sheet', 'fit', 'reset', 'box', 'centre', 'hydrogens', 'labels', 'prev', 'next'])
    expect(KEYS.map(k => keyLabel(DEFAULT_BINDINGS[k.action], 'Linux'))).toEqual(['D', 'E', '?', 'F', 'R', 'B', 'C', 'H', 'L', '[', ']'])
  })
  it('a key stored before (the compare key alone, as "decypher") is kept as the compare key', () => {
    expect(cleanBindings({ decypher: { key: 'k' } }).compare).toEqual({ key: 'k' })
    expect(cleanBindings({ decypher: null }).compare).toBeNull()
    expect(cleanBindings({ export: { key: 'x', alt: true }, fit: 'nonsense' })).toEqual({ ...DEFAULT_BINDINGS, export: { key: 'x', alt: true } })
    expect(cleanBindings(null)).toEqual(DEFAULT_BINDINGS)
  })
})

describe('labels, as the keyboard prints them', () => {
  it.each([
    [{ key: 'd' }, 'D', 'D'],
    [{ key: 'd', shift: true }, '⇧D', 'Shift+D'],
    [{ key: 'r', ctrl: true, alt: true }, '⌃⌥R', 'Ctrl+Alt+R'],
    [{ key: 'k', meta: true }, '⌘K', 'Meta+K'],
    [{ key: ' ' }, 'Space', 'Space'],
    [{ key: 'F2' }, 'F2', 'F2'],
    [null, 'none', 'none'],
  ] as const)('%j', (b, apple, other) => {
    expect(keyLabel(b, 'MacIntel')).toBe(apple)
    expect(keyLabel(b, 'Linux x86_64')).toBe(other)
  })
  it('the modifier that adds: ⌘ on Apple, Ctrl elsewhere', () => {
    expect([modName('MacIntel'), modName('iPad'), modName('Win32'), modName('Linux x86_64'), modName('')]).toEqual(['⌘', '⌘', 'Ctrl', 'Ctrl', 'Ctrl'])
  })
})

describe('a press and a binding', () => {
  it('a press makes a binding; a modifier alone waits for the key', () => {
    expect(bindingOf(press('K'))).toEqual({ key: 'k' })
    expect(bindingOf(press('K', { shiftKey: true }))).toEqual({ key: 'k', shift: true })
    expect(bindingOf(press('F2', { altKey: true }))).toEqual({ key: 'F2', alt: true })
    expect(bindingOf(press('Shift', { shiftKey: true }))).toBeNull()
    // A character that needs Shift on some keyboards is the character: ? is ?, whatever made it.
    expect(bindingOf(press('?', { shiftKey: true }))).toEqual({ key: '?' })
  })
  it('matches only the same key with the same modifiers', () => {
    expect(matches({ key: 'd' }, press('d'))).toBe(true)
    expect(matches({ key: 'd' }, press('D'))).toBe(true)
    expect(matches({ key: 'd' }, press('D', { shiftKey: true }))).toBe(false)
    expect(matches({ key: 'd' }, press('d', { metaKey: true }))).toBe(false)
    expect(matches({ key: 'd', shift: true }, press('D', { shiftKey: true }))).toBe(true)
    expect(matches({ key: '?' }, press('?', { shiftKey: true }))).toBe(true)
    expect(matches({ key: '[' }, press('['))).toBe(true)
    expect(matches(null, press('d'))).toBe(false)
  })
})

describe('what a key would get in the way of, in words', () => {
  const with_ = (patch: Partial<Bindings>): Bindings => ({ ...DEFAULT_BINDINGS, ...patch })
  it.each([
    ['nothing', 'compare', { key: 'k' }, {}, ''],
    ['no key at all', 'compare', null, {}, ''],
    ['another action\'s key', 'compare', { key: 'f' }, {}, 'F already fits the plotted groups (structures)'],
    ['a key anywhere', 'fit', { key: 'e' }, {}, 'E already exports the focused chart, in the default format'],
    ['its own key is no conflict', 'fit', { key: 'f' }, {}, ''],
    ['a key given up by the other is free', 'compare', { key: 'f' }, { fit: { key: 'g' } }, ''],
    ['the same letter with Shift is another key', 'compare', { key: 'f', shift: true }, {}, ''],
    ['a fixed key', 'export', { key: 'Escape' }, {}, 'Esc already backs out or closes: it can\'t be rebound'],
    ['Enter', 'export', { key: 'Enter' }, {}, 'Enter already submits a field and marks a point on a chart: it can\'t be rebound'],
    ['an arrow', 'export', { key: 'ArrowLeft' }, {}, 'ArrowLeft already steps along a chart: it can\'t be rebound'],
    ['Space', 'export', { key: ' ' }, {}, 'Space already pans a 3D view while held: it can\'t be rebound'],
    ['a browser key', 'export', { key: 'k', ctrl: true }, {}, 'the browser may keep Ctrl+K for itself'],
    ['a held key with a modifier', 'centre', { key: 'c', alt: true }, {}, 'a key held while clicking can\'t take a modifier: Alt+C would change the click'],
  ] as const)('%s', (_, action, b, patch, want) => expect(keyProblem(b, action, with_(patch), 'Linux')).toBe(want))
})

describe('the shortcut sheet', () => {
  it('lists every registered action with its key now, and the fixed keys', () => {
    const bindings: Bindings = { ...DEFAULT_BINDINGS, compare: { key: 'k' }, labels: null }
    const html = renderToStaticMarkup(React.createElement(SheetBody, { bindings, platform: 'Linux' }))
    for (const k of KEYS) expect(html).toContain(k.words)
    expect(html).toContain('>K<')
    expect(html).toContain('>none<')
    for (const fixed of ['Esc', 'Space', 'Enter']) expect(html).toContain('>' + fixed + '<')
  })
})

describe('every key handler reads the registry', () => {
  it('no key is compared to a written key outside lib/shortcuts.ts', () => {
    const src = new URL('../src/', import.meta.url).pathname
    const files = (d: string): string[] => readdirSync(d).flatMap(f => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : /\.tsx?$/.test(f) ? [join(d, f)] : []))
    const hits = files(src).filter(f => !f.endsWith('lib/shortcuts.ts')).flatMap(f => readFileSync(f, 'utf8').split('\n').flatMap((l, i) =>
      /\.(key|code)(\.toLowerCase\(\)|\.toUpperCase\(\))?\s*[!=]==?\s*['"`]/.test(l) ? [f.slice(src.length) + ':' + (i + 1)] : []))
    expect(hits).toEqual([])
  })
})
