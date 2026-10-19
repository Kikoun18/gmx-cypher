import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { cardsOf, cardTitle, exportData, exportHtml } from '../src/decypher/export'
import { kit } from '../src/core/index'
import type { SceneState } from '../src/core/kit'
import { fromFiles, parseGro } from '../src/decypher/parse'
import { activeMorphs, joinMorph, setMorphRefs, splitMorph } from '../src/decypher/state'
import { themeTokens } from '../src/decypher/tokens'
import { RUNNER } from './helpers'

// RDFs that differ only in their reference: your Methionine runs (the same peptide structure and groups, the
// references the hydrogens in one and the sulfurs in the other), shown as one card.
const F = RUNNER + 'test/fixtures/decypher/'
const NAMES = ['9.multiwalker.gro', 'rdf_o111_Methionine_H.ndx', 'rdf_o111_Methionine_H.run.json', 'rdf_o111_Methionine_H.xvg', 'rdf_o111_Methionine_S.ndx', 'rdf_o111_Methionine_S.run.json', 'rdf_o111_Methionine_S.xvg']
const loaded = () => fromFiles(NAMES.map(n => ({ path: 'o111/' + n, text: readFileSync(F + n, 'utf8') })))
const tokens = themeTokens(readFileSync(RUNNER + 'src/tokens.json', 'utf8'), readFileSync(RUNNER + 'src/roles.json', 'utf8'))
const view = { rep: 'ball & stick' as const, rest: 'grey' as const, labels: true, hydrogens: true, arrange: 'side by side' as const }

describe('which RDFs can be morphed: those that have the same groups', () => {
  it('the same groups, by their atoms on one structure: your two Methionine runs', () => {
    const { analyses: [h, s] } = loaded()
    expect(kit.sameButReference(h, s)).toBe(true)
    expect(kit.sameButReference(s, h)).toBe(true)
    expect(kit.sameButReference(h, h)).toBe(false)
    expect(kit.morphWhy(h, s)).toBeNull()
    expect(kit.morphWhy(h, h)).toBe('the same RDF')
    // Other names, but the same atoms of the same structure: the same groups.
    const renamed = { ...s, sels: s.sels.map((g, i) => ({ ...g, name: 'other' + i })) }
    expect(kit.sameButReference(h, renamed)).toBe(true)
  })

  it('without the same structure or any atoms (an RDF of the vault from a run this gmx-cypher doesn\'t know), by their names', () => {
    const { analyses: [h, s] } = loaded()
    expect(kit.sameButReference(h, { ...s, struct: 'other' })).toBe(true)
    expect(kit.sameButReference(h, { ...s, struct: null })).toBe(true)
    const bare = (a: typeof h) => ({ ...a, struct: null, ref: null, sels: a.sels.map(g => ({ ...g, atoms: [] })) })
    expect(kit.sameButReference(bare(h), bare(s))).toBe(true)
    // Atoms that differ on one structure and names that differ: not the same groups.
    const other = { ...s, sels: s.sels.map((g, i) => ({ ...g, name: 'other' + i, atoms: [...g.atoms, 9999] })) }
    expect(kit.sameButReference(h, other)).toBe(false)
    expect(kit.sameButReference(bare(h), { ...bare(s), sels: bare(s).sels.map((g, i) => ({ ...g, name: 'x' + i })) })).toBe(false)
  })

  it('names are compared loosely: case, punctuation, and a trailing "...x" that only says which reference', () => {
    expect(kit.looseName('NH_N...S')).toBe('nhn')
    expect(kit.looseName('nh n…H')).toBe('nhn')
    expect(kit.looseName('CH2OH_CH2...S')).toBe('ch2ohch2')
    expect(kit.looseName('CH...S')).not.toBe(kit.looseName('CH2...S'))
    const g = (name: string) => ({ name, atoms: [], tone: 'coral' as const })
    const a = { struct: null, sels: [g('NH_N...S'), g('CH...S')] }
    expect(kit.sameButReference(a, { struct: null, sels: [g('NH_N...H'), g('ch...h'), g('extra')] })).toBe(true)
    // Two groups that read alike are no match for either.
    expect(kit.sameButReference(a, { struct: null, sels: [g('NH_N...H'), g('CH...H'), g('ch'), g('Ch...x')] })).toBe(false)
    expect(kit.matchGroup(a.sels[1], { struct: null, sels: [g('a'), g('CH...H')] }, a)!.name).toBe('CH...H')
  })

  it('b may have more groups than a; a group of a that b lacks is the reason it can\'t, in words', () => {
    const g = (name: string) => ({ name, atoms: [], tone: 'coral' as const })
    const a = { struct: null, sels: [g('A'), g('B'), g('C')] }
    expect(kit.sameButReference(a, { struct: null, sels: [g('A'), g('B'), g('C'), g('D')] })).toBe(true)
    expect(kit.morphWhy(a, { struct: null, sels: [g('A'), g('B')] })).toBe('1 of the 3 groups here have no match there, e.g. "C"')
    expect(kit.morphWhy(a, { struct: null, sels: [g('X'), g('Y'), g('Z')] })).toBe('none of its groups match: "A" is not among its 3 ("X", "Y", …)')
    expect(kit.morphWhy(a, { struct: null, sels: [] })).toBe('it has no groups')
    expect(kit.morphWhy({ struct: null, sels: [] }, a)).toBe('no groups here')
    expect(kit.sameButReference({ struct: null, sels: [] }, a)).toBe(false)
  })

  it('names the RDFs of a morph: a reference by its name (the RDF after it when two are alike), one without by its label', () => {
    const { analyses: [h, s] } = loaded()
    // Your S run's reference is the sulfurs under the name H_Met: both are called H_Met.
    expect(h.ref!.name).toBe(s.ref!.name)
    expect(kit.refLabels([h, s])).toEqual({ [h.id]: 'H_Met · ' + h.label, [s.id]: 'H_Met · ' + s.label })
    const renamed = { ...s, ref: { ...s.ref!, name: 'S_Met' } }
    expect(kit.refLabels([h, renamed])).toEqual({ [h.id]: 'H_Met', [s.id]: 'S_Met' })
    expect(kit.refLabels([{ id: 'x', label: 'Methionine × PG · a', ref: null }, h])).toEqual({ x: 'Methionine × PG · a', [h.id]: 'H_Met' })
  })
})

describe('choosing the references that are plotted: one, the other or both', () => {
  const all = ['a', 'b']
  it('a click plots that one alone; a second click on it brings both back', () => {
    expect(kit.pickRefs(all, ['a', 'b'], 'a', false)).toEqual(['a'])
    expect(kit.pickRefs(all, ['a'], 'b', false)).toEqual(['b'])
    expect(kit.pickRefs(all, ['a'], 'a', false)).toEqual(['a', 'b'])
  })
  it('⌘, ctrl or shift adds or takes one, in the order of the RDFs, and never leaves none', () => {
    expect(kit.pickRefs(all, ['b'], 'a', true)).toEqual(['a', 'b'])
    expect(kit.pickRefs(all, ['a', 'b'], 'a', true)).toEqual(['b'])
    expect(kit.pickRefs(all, ['a'], 'a', true)).toEqual(['a', 'b'])
    expect(kit.pickRefs(['a', 'b', 'c'], ['a'], 'c', true)).toEqual(['a', 'c'])
  })
})

describe('the morphs a view keeps', () => {
  it('joining makes a card, adds to it, and moves an RDF out of another', () => {
    const one = joinMorph([], 'a', 'b')
    expect(one).toEqual([{ ids: ['a', 'b'], off: [] }])
    expect(joinMorph(one, 'a', 'c')).toEqual([{ ids: ['a', 'b', 'c'], off: [] }])
    expect(joinMorph(one, 'b', 'c')).toEqual([{ ids: ['a', 'b', 'c'], off: [] }])
    expect(joinMorph(one, 'c', 'b')).toEqual([{ ids: ['c', 'b'], off: [] }])
    expect(joinMorph(one, 'a', 'a')).toEqual(one)
    expect(splitMorph(joinMorph(one, 'a', 'c'), 'b')).toEqual([])
  })
  it('as shown: only RDFs that are shown, two make a card, all plotted when none is', () => {
    const list = [{ ids: ['a', 'b', 'c'], off: ['b'] }, { ids: ['d', 'e'], off: [] }]
    expect(activeMorphs(list, ['a', 'b', 'c', 'd', 'e'])).toEqual([{ ids: ['a', 'b', 'c'], on: ['a', 'c'] }, { ids: ['d', 'e'], on: ['d', 'e'] }])
    expect(activeMorphs(list, ['a', 'c', 'd'])).toEqual([{ ids: ['a', 'c'], on: ['a', 'c'] }])
    expect(activeMorphs(list, ['a', 'e'])).toEqual([])
    expect(activeMorphs([{ ids: ['a', 'b'], off: ['a', 'b'] }], ['a', 'b'])).toEqual([{ ids: ['a', 'b'], on: ['a', 'b'] }])
    // An RDF in two cards is in the first only.
    expect(activeMorphs([{ ids: ['a', 'b'], off: [] }, { ids: ['b', 'c'], off: [] }], ['a', 'b', 'c'])).toEqual([{ ids: ['a', 'b'], on: ['a', 'b'] }])
  })
  it('the references plotted are kept as the ones that are off, so an RDF that comes back is plotted', () => {
    const list = joinMorph([], 'a', 'b')
    expect(setMorphRefs(list, 'a', ['b'])).toEqual([{ ids: ['a', 'b'], off: ['a'] }])
    const later = joinMorph(setMorphRefs(list, 'a', ['b']), 'a', 'c')
    expect(activeMorphs(later, ['a', 'b', 'c'])).toEqual([{ ids: ['a', 'b', 'c'], on: ['b', 'c'] }])
  })
})

describe('the export: headings of your choosing, and morphed RDFs as one card', () => {
  const input = () => {
    const { analyses, structs } = loaded(), [h, s] = analyses
    return { h, s, o: { analyses, structs, selected: () => ['O5...S'], tones: {}, compare: null, view, theme: 'dark' as const, tokens, structures: true, by: 'gmx-cypher 0.1.0', made: '2026-10-14T10:00:00.000Z' } }
  }
  it('the page heading and each card\'s heading, as chosen; empty ones stay as they are', () => {
    const { h, s, o } = input()
    const plain = exportData(o)
    expect(plain.header).toBe('(de)Cypher')
    expect(plain.analyses.map(a => a.title)).toEqual([h.title, s.title])
    const d = exportData({ ...o, header: '  Methionine, two references  ', titles: { [h.id]: 'Hydrogens as reference', [s.id]: '   ' } })
    expect(d.header).toBe('Methionine, two references')
    expect(d.analyses.map(a => a.title)).toEqual(['Hydrogens as reference', s.title])
    const html = exportHtml(d)
    expect(html).toContain('<title>Methionine, two references</title>')
    expect(html).toContain('"header":"Methionine, two references"')
    expect(exportHtml(plain)).toContain('<title>(de)Cypher · 2 RDFs</title>')
  })
  it('a morph keeps the RDFs in the export, under the heading chosen for its first; with one left it is none', () => {
    const { h, s, o } = input()
    const d = exportData({ ...o, morphs: [{ ids: [h.id, s.id], on: [s.id] }] })
    expect(d.morphs).toEqual([{ ids: ['a1', 'a2'], on: ['a2'], title: cardTitle([h, s]) }])
    expect(cardTitle([h, s])).toBe(h.label + ' + ' + s.label)
    expect(exportData({ ...o, titles: { [h.id]: 'Both references' }, morphs: [{ ids: [h.id, s.id], on: [] }] }).morphs).toEqual([{ ids: ['a1', 'a2'], on: ['a1', 'a2'], title: 'Both references' }])
    expect(exportData({ ...o, analyses: [h], morphs: [{ ids: [h.id, s.id], on: [s.id] }] }).morphs).toBeUndefined()
    expect(exportData(o).morphs).toBeUndefined()
  })
  it('cards: morphed RDFs stand as one, where the first is', () => {
    const { h, s } = input(), t = { ...h, id: 'job:third', label: 'third' }
    expect(cardsOf([t, h, s], [{ ids: [h.id, s.id], on: [h.id] }]).map(c => [c.lead.id, c.members.map(m => m.id), c.on])).toEqual([[t.id, [t.id], [t.id]], [h.id, [h.id, s.id], [h.id]]])
    expect(cardsOf([h, s], []).map(c => c.members.length)).toEqual([1, 1])
    expect(cardsOf([h], [{ ids: [h.id, s.id], on: [] }]).map(c => c.members.length)).toEqual([1])
  })
})

// A canvas without a browser: enough of it for the view to draw and answer the pointer.
describe('clicking a reference atom, in the structure view', () => {
  const g = globalThis as unknown as Record<string, unknown>
  const saved = { window: g.window, raf: g.requestAnimationFrame, caf: g.cancelAnimationFrame }
  afterEach(() => { g.window = saved.window; g.requestAnimationFrame = saved.raf; g.cancelAnimationFrame = saved.caf })
  const ctx = new Proxy({}, { get: (_t, p) => (p === 'measureText' ? () => ({ width: 40 }) : p === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => undefined), set: () => true })

  function open(pickRef?: (ref: number, add: boolean) => void) {
    g.window = { devicePixelRatio: 1 }; g.requestAnimationFrame = () => 0; g.cancelAnimationFrame = () => {}
    const handlers: Record<string, ((e: unknown) => void)[]> = {}
    const canvas = { width: 0, height: 0, style: {} as Record<string, string>, getContext: () => ctx, addEventListener: (t: string, f: (e: unknown) => void) => { (handlers[t] ||= []).push(f) }, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture() {} }
    const picked: [number, boolean][] = [], hovered: unknown[] = []
    const { analyses: [h, s] } = loaded()
    const sels = h.sels, struct = parseGro(readFileSync(F + '9.multiwalker.gro', 'utf8'))
    const mol = kit.buildMol(struct, new Set(sels.flatMap(x => x.atoms)), new Set([...h.ref!.atoms, ...s.ref!.atoms]), 'side by side')
    const view = kit.structureView(canvas as unknown as HTMLCanvasElement, { clientWidth: 700, clientHeight: 560 } as HTMLElement, { hover: x => hovered.push(x), pick: () => {}, pickRef: pickRef && ((i, add) => { pickRef(i, add); picked.push([i, add]) }) })
    const pal = kit.palette(false, themeTokens(readFileSync(RUNNER + 'src/tokens.json', 'utf8'), readFileSync(RUNNER + 'src/roles.json', 'utf8')).light)
    const state = (on: boolean[]): SceneState => ({ mol, pal, rep: 'ball & stick', rest: 'grey', labels: true, hydrogens: true, sels, selected: [0], refs: [{ label: 'S', atoms: s.ref!.atoms, on: on[0] }, { label: 'H', atoms: h.ref!.atoms, on: on[1] }], hoverSel: -1, hoverRef: -1 })
    const click = (x: number, y: number, add = false) => {
      const e = { clientX: x, clientY: y, button: 0, pointerId: 1, altKey: false, metaKey: add, ctrlKey: false, shiftKey: false }
      handlers.pointerdown.forEach(f => f(e)); handlers.pointerup.forEach(f => f(e))
    }
    return { view, state, click, picked, h, s }
  }

  it('picks that reference, ⌘-click adds it; both references draw, plotted or not, without a fault', () => {
    const calls: string[] = []
    const t = open((i, add) => calls.push(i + (add ? '+' : '')))
    for (const on of [[true, true], [true, false], [false, true]]) t.view.set(t.state(on))
    t.view.set(t.state([true, false]))
    const own = t.h.ref!.atoms.filter(a => !t.s.ref!.atoms.includes(a))
    expect(own.length).toBeGreaterThan(0)
    // Some atom of H's reference sits where nothing in front of it takes the click.
    const tries = own.map(a => t.view.where(a)).filter((p): p is { x: number; y: number } => !!p)
    expect(tries.length).toBeGreaterThan(0)
    for (const p of tries) t.click(p.x, p.y)
    for (const p of tries) t.click(p.x, p.y, true)
    expect(calls).toContain('1')
    expect(calls).toContain('1+')
    expect(t.picked.every(([i]) => i === 0 || i === 1)).toBe(true)
  })

  it('without pickRef, a click on a reference atom does nothing (a single RDF)', () => {
    const t = open()
    t.view.set(t.state([true, true]))
    const p = t.view.where(t.s.ref!.atoms[0])!
    t.click(p.x, p.y)
    expect(t.picked).toEqual([])
    expect(t.view.where(999999)).toBeNull()
  })
})
