import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { DASH as MATRIX_DASH, DASH_NAMES as MATRIX_DASH_NAMES } from '../../matrix/src/lib/graph'
import { elementOf, structFormat, toPdb } from '../../matrix/src/lib/structFile'
import { DASH, DASH_NAMES, fromRanges, kit, niceTicks, parseStructure, readStructure, toRanges, TONES } from '../src/core/index'
import type { Analysis } from '../src/core/kit'
import { themeTokens } from '../src/core/tokens'
import { RUNNER } from './helpers'

// The visualization core (R5): one copy of each shared rule, in src/core/, and the kit made from the Matrix's data.

/** Every .ts and .tsx file under a folder. */
const sources = (dir: string): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(n) && !n.endsWith('.d.ts') ? [p] : []
})

/** The names a file declares (variables, destructured names, functions), at any depth: read by TypeScript, so comments and strings don't count. */
function declared(file: string): string[] {
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: string[] = []
  const visit = (n: ts.Node) => {
    if ((ts.isVariableDeclaration(n) || ts.isBindingElement(n) || ts.isFunctionDeclaration(n)) && n.name && ts.isIdentifier(n.name)) out.push(n.name.text)
    ts.forEachChild(n, visit)
  }
  visit(src)
  return out
}

const SHARED = ['TONES', 'DASH', 'DASH_NAMES', 'niceTicks', 'toRanges', 'fromRanges', 'ranges', 'TONES_FOR_TERMS', 'parseStructure', 'readStructure', 'parseGro', 'parsePdb', 'parseStruct', 'atomCoords']

describe('one copy of each: tones, dashes, ticks, atom ranges (R5a) and the structure parser (R5b)', () => {
  it('defined only in src/core/, by the TypeScript scanner', () => {
    const files = [...sources(RUNNER + 'src'), ...sources(RUNNER + 'server')]
    const where = files.flatMap(f => declared(f).filter(n => SHARED.includes(n)).map(n => n + ' in ' + relative(RUNNER, f)))
    expect(where.filter(w => !w.includes(' in src/core/'))).toEqual([])
    // The scanner sees them where they are.
    expect(where.some(w => w.startsWith('TONES in src/core/'))).toBe(true)
  })

  it("the kit's dashes are the Matrix's ten, with their names", () => {
    expect(DASH).toEqual(MATRIX_DASH)
    expect(DASH_NAMES).toEqual(MATRIX_DASH_NAMES)
    expect(kit.DASH).toBe(DASH)
    expect(DASH).toHaveLength(10)
  })

  it('the tones are the eight of the tokens, in palette order', () => {
    const tokens = themeTokens(readFileSync(RUNNER + 'src/tokens.json', 'utf8'), readFileSync(RUNNER + 'src/roles.json', 'utf8'))
    expect(TONES).toEqual(['coral', 'sky', 'mint', 'butter', 'lilac', 'aqua', 'rose', 'stone'])
    for (const t of TONES) for (const k of ['', '-foreground', '-soft', '-strong']) expect(tokens.light[t + k]).toMatch(/^#/)
    expect(kit.TONES).toBe(TONES)
  })

  it('ticks and atom ranges as before', () => {
    expect(niceTicks(0, 2.4, 5)).toEqual({ ticks: [0, 0.5, 1, 1.5, 2], decimals: 1 })
    expect(toRanges([5, 43, 47, 51, 55])).toBe('5, 43-55:4')
    expect(fromRanges('43-55:4, 5')).toEqual([5, 43, 47, 51, 55])
    expect(() => fromRanges('1-x')).toThrow('not an atom number or range: 1-x')
  })
})

describe('with 1 to 14 RDFs on one graph, no two curves share both colour and dash', () => {
  const tokens = themeTokens(readFileSync(RUNNER + 'src/tokens.json', 'utf8'), readFileSync(RUNNER + 'src/roles.json', 'utf8'))
  const x = [0.1, 0.2, 0.3]
  const rdf = (i: number, groups: string[]): Analysis => ({
    id: 'a' + i, kind: 'file', title: 'rdf ' + i, label: 'rdf' + i, sub: '', x, xlabel: '', ylabel: '', ref: null, struct: null, structNote: '',
    sels: groups.map((name, k) => ({ name, atoms: [k + 1], tone: TONES[k % TONES.length], y: [0, 1 + i, 1], peak: null })),
  })
  for (const dark of [false, true]) for (const colorBy of ['group', 'job'] as const) for (const groups of [['O'], ['O', 'N', 'S']]) {
    it((dark ? 'dark' : 'light') + ', by ' + colorBy + ', ' + groups.length + ' group(s)', () => {
      const pal = kit.palette(dark, dark ? tokens.dark : tokens.light)
      for (let n = 1; n <= 14; n++) {
        const plotted = Array.from({ length: n }, (_, i) => rdf(i, groups))
        const tones = Object.fromEntries(plotted.map((a, i) => [a.id, TONES[i % TONES.length]]))
        const curves = kit.buildCurves({ focus: plotted[0], plotted, selected: groups, colorBy, pal, tones })
        expect(curves).toHaveLength(n * groups.length)
        const looks = curves.map(c => c.color + ' ' + c.dash)
        expect(new Set(looks).size, n + ' RDFs: ' + looks.join(' | ')).toBe(looks.length)
      }
    })
  }
})

describe('one structure model (R5b): one parser for .gro and .pdb, its elements decided by the Matrix', () => {
  const FILES: [string, string][] = [['../matrix/test/fixtures/', 'WTA.gro'], ['../matrix/test/fixtures/', 'cccccccc.gro'], ['../matrix/test/fixtures/', 'mmmmmmmm.gro'], ['../matrix/test/fixtures/', 'test.pdb'], ['test/fixtures/nvt/', 'nvt.gro'], ['test/fixtures/decypher/', '9.multiwalker.gro']]
  it.each(FILES)('%s%s: every atom, numbered; drawn exactly where toPdb keeps it, at its coordinates', (dir, f) => {
    const text = readFileSync(RUNNER + dir + f, 'utf8'), format = structFormat(f, text)!, s = parseStructure(text, format)
    expect(s.nr).toEqual(Array.from({ length: s.n }, (_, i) => i + 1))
    const drawn = s.nr.map((_, i) => i).filter(i => s.el[i] !== null && s.el[i] !== 'virtual')
    const lines = toPdb(text, format).pdb.split('\n').filter(l => /^(ATOM  |HETATM)/.test(l))
    expect(drawn.length).toBe(lines.length)
    drawn.forEach((i, k) => {
      expect(s.name[i]).toBe(lines[k].slice(12, 16).trim())
      expect(s.el[i]).toBe(lines[k].slice(76, 78).trim())
      for (let d = 0; d < 3; d++) expect(s.xyz[3 * i + d]).toBeCloseTo(Number(lines[k].slice(30 + 8 * d, 38 + 8 * d)) / 10, 3)
    })
    expect(readStructure(dir + f, text)).toEqual(s)
  })

  it('the box as the file writes it: a .gro line (3 or 9 numbers), a .pdb CRYST1 (a, b, c in nm, the angles)', () => {
    const gro = parseStructure(readFileSync(RUNNER + 'test/fixtures/nvt/nvt.gro', 'utf8'), 'gro')
    expect([gro.box, gro.cell]).toEqual([[3.5, 3.5, 3.5], [3.5, 3.5, 3.5]])
    const pdb = parseStructure('CRYST1   30.000   40.000   50.000  80.00  70.00  60.00 P 1\nATOM      1  N   MET A   1      -4.700  -2.470   5.000  1.00  0.00           N\n', 'pdb')
    expect([pdb.box, pdb.cell]).toEqual([[3, 4, 5], [3, 4, 5, 80, 70, 60]])
    expect(parseStructure('t\n    1\n    1MET      N    1   1.0   2.0   3.0\n', 'gro').cell).toBeNull()
  })

  it("a .pdb's four-letter residue keeps its name; its element is decided as toPdb decides it (on the first three)", () => {
    const line = (n: number, name: string, resn: string) => 'HETATM' + String(n).padStart(5) + ' ' + name.padEnd(4) + ' ' + resn.padEnd(4) + 'A   1       0.000   0.000   0.000  1.00  0.00\n'
    const s = parseStructure(line(1, 'OH2', 'TIP3') + line(2, 'MW', 'TIP4') + 'ENDMDL\n' + line(3, 'C1', 'XXX'), 'pdb')
    expect(s.resn).toEqual(['TIP3', 'TIP4'])
    expect(s.el).toEqual([elementOf('OH2', 'TIP'), elementOf('MW', 'TIP')])
  })

  it('a .gro written with more decimals is read at its width; a broken file is refused in words', () => {
    const s = parseStructure('t\n    1\n    1MET      N    1   1.00000   2.00000   3.00000\n 1 1 1\n', 'gro')
    expect(s.xyz).toEqual([1, 2, 3])
    expect(() => parseStructure('t\n    3\n    1MET      N    1   1.0   2.0   3.0\n', 'gro')).toThrow('it ends before its 3 atoms')
    expect(() => parseStructure('t\nnone\n', 'gro')).toThrow('no atom count on line 2')
    expect(() => parseStructure('REMARK nothing\n', 'pdb')).toThrow('no ATOM or HETATM lines')
    expect(() => readStructure('notes.txt', 'hello')).toThrow('notes.txt is not a .gro or .pdb')
  })
})
