import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compactStruct, exportData, exportHtml, exportName } from '../src/decypher/export'
import { fromFiles, parseGro } from '../src/decypher/parse'
import { themeTokens } from '../src/decypher/tokens'
import { RUNNER } from './helpers'

const F = RUNNER + 'test/fixtures/decypher/'
const NAMES = ['9.multiwalker.gro', 'rdf_o111_Methionine_H.ndx', 'rdf_o111_Methionine_H.run.json', 'rdf_o111_Methionine_H.xvg', 'rdf_o111_Methionine_S.ndx', 'rdf_o111_Methionine_S.run.json', 'rdf_o111_Methionine_S.xvg']
const loaded = () => fromFiles(NAMES.map(n => ({ path: '/home/me/sims/o111/' + n, text: readFileSync(F + n, 'utf8') })))
const tokens = themeTokens(readFileSync(RUNNER + 'src/tokens.json', 'utf8'), readFileSync(RUNNER + 'src/roles.json', 'utf8'))
const view = { rep: 'ball & stick' as const, rest: 'grey' as const, labels: true, hydrogens: true, arrange: 'side by side' as const }

describe('the HTML export: one file, nothing fetched, each job still interactive', () => {
  it('structures go without water and ions, at a .gro\'s precision, keeping the atom numbers', () => {
    const g = parseGro(readFileSync(F + '9.multiwalker.gro', 'utf8')), c = compactStruct(g, new Set())
    expect(c.n).toBe(249)
    expect(c.nr[248]).toBe(249)
    expect(c.resn).not.toContain('SOL')
    expect(c.xyz.slice(0, 3)).toEqual([4.086, 2.162, 0.492])
    // Over the limit, the groups' atoms are kept first.
    const few = compactStruct(g, new Set([200, 240]), 10)
    expect(few.nr).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 200, 240])
  })

  it('the data: jobs and structures renamed (no path of this machine), atoms as ranges, the comparison as it was', () => {
    const { analyses, structs } = loaded(), [h, s] = analyses
    const d = exportData({ analyses, structs, selected: a => (a === h ? ['O5...S', 'CH...S'] : ['O5...S']), tones: { [h.id]: 'sky', [s.id]: 'rose' }, compare: { ids: [h.id, s.id], focus: h.id, selected: ['O5...S'], colorBy: 'job' }, view, theme: 'dark', tokens, structures: true, by: 'gmx-cypher 0.1.0', made: '2026-10-13T10:00:00.000Z' })
    expect(d.analyses.map(a => [a.id, a.struct, a.tone, a.selected])).toEqual([['a1', 's1', 'sky', ['O5...S', 'CH...S']], ['a2', 's1', 'rose', ['O5...S']]])
    expect(Object.keys(d.structs)).toEqual(['s1'])
    expect(d.analyses[0].sels[2]).toMatchObject({ name: 'O5...S', atoms: '7, 34, 55-95:20', tone: h.sels[2].tone })
    expect(d.analyses[0].ref).toMatchObject({ name: 'H_Met', atoms: '125-127, 142-144, 159-161, 176-178, 193-195, 210-212, 227-229, 244-246' })
    expect(d.compare).toEqual({ ids: ['a1', 'a2'], focus: 'a1', selected: ['O5...S'], colorBy: 'job' })
    expect(JSON.stringify(d)).not.toContain('/home/me')
    expect(d.tokens.dark.background).toBe('#141312')
    const bare = exportData({ analyses: [h], structs, selected: () => [], tones: {}, compare: { ids: [h.id], focus: h.id, selected: [], colorBy: 'group' }, view, theme: 'light', tokens, structures: false, by: 'x' })
    expect(bare.structs).toEqual({})
    expect(bare.analyses[0].struct).toBeNull()
    // One RDF has nothing to compare with.
    expect(bare.compare).toBeNull()
  })

  it('the page: both themes, the kit\'s own code, the data inline and safe, mononoki when given', () => {
    const { analyses, structs } = loaded()
    const a = { ...analyses[0], title: 'evil </script><script>alert(1)</script>' }
    const d = exportData({ analyses: [a], structs, selected: () => ['O5...S'], tones: {}, compare: null, view, theme: 'light', tokens, structures: true, by: 'gmx-cypher 0.1.0' })
    const html = exportHtml(d, { regular: 'AAAA', bold: 'BBBB' })
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<html lang="en" data-theme="light">')
    expect(html).toContain('[data-theme="dark"]{--background:#141312')
    expect(html).toContain('src:url(data:font/woff2;base64,AAAA)')
    expect(html).toContain('kit.mount(document.getElementById("app")')
    expect(html.match(/<\/script>/g)).toHaveLength(2)
    const json = /<script type="application\/json" id="dc-data">(.*?)<\/script>/s.exec(html)![1]
    expect(JSON.parse(json).analyses[0].title).toBe(a.title)
    expect(html).toContain('<title>(de)Cypher · evil &lt;/script&gt;')
    expect(exportName(analyses, new Date('2026-10-13T10:00:00Z'))).toBe('decypher_2-RDFs_2026-10-13.html')
    expect(exportName([analyses[0]], new Date('2026-10-13T10:00:00Z'))).toBe('decypher_rdf_o111_Methionine_H_2026-10-13.html')
  })
})
