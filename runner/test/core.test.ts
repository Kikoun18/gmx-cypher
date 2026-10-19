import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { DASH as MATRIX_DASH, DASH_NAMES as MATRIX_DASH_NAMES } from '../../matrix/src/lib/graph'
import { DASH, DASH_NAMES, fromRanges, kit, niceTicks, toRanges, TONES } from '../src/core/index'
import type { Analysis } from '../src/core/kit'
import { themeTokens } from '../src/decypher/tokens'
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

const SHARED = ['TONES', 'DASH', 'DASH_NAMES', 'niceTicks', 'toRanges', 'fromRanges', 'ranges', 'TONES_FOR_TERMS']

describe('one copy of each: tones, dashes, ticks and atom ranges (R5a)', () => {
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
