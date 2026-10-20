// What differs between two runs (R13), from their records: only the differences, the equal fields counted.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { diffRecords, type DiffRecord } from '../src/lib/runDiff'
import { portableRecord } from '../src/lib/space'
import type { RunRecord } from '../src/lib/record'
import { RUNNER } from './helpers'

const read = (f: string) => JSON.parse(readFileSync(RUNNER + 'test/fixtures/' + f, 'utf8')) as DiffRecord
const H = read('decypher/rdf_o111_Methionine_H.run.json'), S = read('decypher/rdf_o111_Methionine_S.run.json'), V1 = read('formats/run-v1.run.json')
const copy = (r: DiffRecord): DiffRecord => JSON.parse(JSON.stringify(r))
const fields = (a: DiffRecord, b: DiffRecord) => diffRecords(a, b).rows.map(r => [r.section, r.field, r.a, r.b])

describe('run diff (R13)', () => {
  it('equal records: no differences, every field counted equal', () => {
    const d = diffRecords(H, copy(H))
    expect(d.rows).toEqual([])
    expect(d.equal).toBeGreaterThan(20)
  })
  it('an input moved, with the same SHA-256, is the same input', () => {
    const moved = copy(H)
    for (const slot of ['runInput', 'structure'] as const) moved.inputs![slot]!.path = '/elsewhere/' + moved.inputs![slot]!.path.split('/').pop()
    // The trajectory has no SHA-256: its size and time say it is the same.
    moved.inputs!.trajectory!.path = '/elsewhere/9.multiwalker.xtc'
    expect(diffRecords(H, moved).rows).toEqual([])
    const other = copy(H)
    other.inputs!.runInput!.sha256 = 'f'.repeat(64)
    expect(fields(H, other)).toEqual([['inputs', 'runInput', '9.multiwalker.tpr · sha256 4a5edc9a2e76', '9.multiwalker.tpr · sha256 ffffffffffff']])
  })
  it('one option changed: the flag, both values and its default', () => {
    const b = copy(H), bin = b.options!.find(o => o.flag === 'bin')!
    bin.value = '0.05'
    expect(diffRecords(H, b).rows).toEqual([{ section: 'options', field: '-bin', a: '0.03', b: '0.05', note: 'default 0.002' }])
  })
  it('a group with one atom added: the atoms added, as ranges', () => {
    const b = copy(H), g = b.groups.find(x => x.name === 'O5...S')!
    g.atoms += ', 300'
    expect(diffRecords(H, b).rows).toEqual([{ section: 'groups', field: 'group O5...S: atoms', a: '5 atoms', b: '6 atoms', note: '+1: 300' }])
  })
  it('every field in its order, the differences among the equal ones (shown on asking)', () => {
    const b = copy(H), g = b.groups.find(x => x.name === 'O5...S')!
    g.atoms += ', 300'
    const d = diffRecords(H, b), all = d.all.map(r => r.field)
    expect(all).toHaveLength(d.rows.length + d.same.length + d.unrecorded.length)
    expect(all.indexOf('reference')).toBeLessThan(all.indexOf('group O5...S: atoms'))
    expect(all.indexOf('group O5...S: atoms')).toBeLessThan(all.indexOf('gmx'))
  })
  it('the frames asked for and analysed', () => {
    const b = copy(H)
    b.options!.find(o => o.flag === 'dt')!.value = '1000'
    b.frames = { analysed: 26, lastTime: 200000 }
    expect(fields(H, b)).toEqual([['frames', 'every (-dt)', '0', '1000'], ['frames', 'analysed', '51 frames, to 200000 ps', '26 frames, to 200000 ps']])
  })
  it('two runs that differ only in their reference say so', () => {
    // Both references are named H_Met; only their atoms differ.
    const d = diffRecords(H, S)
    expect(d.rows.filter(r => r.section === 'groups').map(r => r.field)).toEqual(['reference H_Met: atoms', 'in short'])
    expect(d.rows.find(r => r.field === 'in short')?.note).toBe('the same groups: only the reference differs')
  })
  it('a v1 record against the new format: no analysis named is gmx rdf; only the format differs', () => {
    const v3 = { ...copy(V1), version: 3, analysis: 'rdf' }
    expect(fields(V1, v3)).toEqual([['command', 'record format', 'version 1', 'version 3']])
  })
  it('what one record does not hold (an older runner\'s) is not recorded, not a difference', () => {
    const b = copy(H)
    delete b.env; delete b.runner
    b.options = b.options!.filter(o => o.flag !== 'bin')
    const d = diffRecords(H, b)
    expect(d.rows).toEqual([])
    expect(d.unrecorded.map(r => [r.field, r.b])).toEqual(expect.arrayContaining([['-bin', 'not recorded'], ['gmx-cypher', 'not recorded'], ['GMX_MAXBACKUP', 'not recorded']]))
  })
  it('a record against its copy in the vault (R14c): paths relative, the environment\'s names only; no difference', () => {
    const roots = [H.inputs!.structure!.path.split('/').slice(0, -2).join('/')]
    const copied = portableRecord(H as unknown as RunRecord, roots, '/home/me') as unknown as DiffRecord
    const d = diffRecords(H, copied)
    expect(d.rows).toEqual([])
    expect(d.same.find(r => r.field === 'gmx')).toMatchObject({ a: 'gmx_mpi', b: 'gmx_mpi', note: 'by name: a record copied to the vault keeps its paths relative' })
    expect(d.unrecorded.map(r => r.field)).toEqual(Object.keys(H.env!).sort())
  })
  it('a group in one run only, and the gmx, runner and environment', () => {
    const b = copy(H)
    b.groups = b.groups.filter(g => g.name !== 'O5...S')
    b.gmx = { path: '/usr/bin/gmx', version: '2024.2' }
    b.env = { GMX_MAXBACKUP: '99', OMP_NUM_THREADS: '4' }
    expect(fields(H, b)).toEqual([
      ['groups', 'group O5...S', '5 atoms', '—'],
      ['gmx', 'gmx', H.gmx!.path, '/usr/bin/gmx'], ['gmx', 'gmx version', '2025.4-PLUMED_spack', '2024.2'], ['environment', 'OMP_NUM_THREADS', '—', '4'],
    ])
  })
})
