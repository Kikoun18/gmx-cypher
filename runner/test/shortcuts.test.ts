import { describe, expect, it } from 'vitest'
import { bindingOf, DEFAULT_BINDINGS, keyLabel, keyProblem, matches } from '../src/lib/shortcuts'

const press = (key: string, mods: Partial<Record<'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey', boolean>> = {}) => ({ key, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...mods })

describe('the (de)Cypher key, rebindable in settings', () => {
  it('is D by default, shown as a key cap would show it', () => {
    expect(DEFAULT_BINDINGS.decypher).toEqual({ key: 'd' })
    expect(keyLabel(DEFAULT_BINDINGS.decypher)).toBe('D')
    expect(keyLabel({ key: 'r', ctrl: true, alt: true })).toBe('Ctrl+Alt+R')
    expect(keyLabel({ key: 'd', shift: true })).toBe('⇧D')
    expect(keyLabel({ key: ' ' })).toBe('Space')
    expect(keyLabel(null)).toBe('none')
  })

  it('a press makes a binding; a modifier alone waits for the key', () => {
    expect(bindingOf(press('K'))).toEqual({ key: 'k' })
    expect(bindingOf(press('K', { shiftKey: true }))).toEqual({ key: 'k', shift: true })
    expect(bindingOf(press('F2', { altKey: true }))).toEqual({ key: 'F2', alt: true })
    expect(bindingOf(press('Shift', { shiftKey: true }))).toBeNull()
  })

  it('matches only the same key with the same modifiers', () => {
    expect(matches({ key: 'd' }, press('d'))).toBe(true)
    expect(matches({ key: 'd' }, press('D'))).toBe(true)
    expect(matches({ key: 'd' }, press('D', { shiftKey: true }))).toBe(false)
    expect(matches({ key: 'd' }, press('d', { metaKey: true }))).toBe(false)
    expect(matches({ key: 'd', shift: true }, press('D', { shiftKey: true }))).toBe(true)
    expect(matches(null, press('d'))).toBe(false)
  })

  it('says what a key would get in the way of', () => {
    expect(keyProblem({ key: 'd' })).toBe('')
    expect(keyProblem({ key: 'c' })).toContain('centres the 3D view')
    expect(keyProblem({ key: 'f' })).toContain('inside (de)Cypher')
    expect(keyProblem({ key: 'c', alt: true })).toBe('')
    expect(keyProblem({ key: 'k', ctrl: true })).toContain('the browser may keep')
  })
})
