import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NodeBackend } from '../../app/scripts/node-backend'
import { newVault, withAnalysis, withPmf, withStructure, fixture } from '../../app/test/helpers'
import { findRuns, readRun, runsBySha, vaultFile, vaultRdfs } from '../server/decypher'
import { Jobs } from '../server/jobs'
import { openVault } from '../server/vault'
import { apiServer, RUNNER, tmp } from './helpers'

const F = RUNNER + 'test/fixtures/decypher/'
const bytes = (n: string) => new Uint8Array(readFileSync(F + n))

/** Every file under a path with its size and mtime: equal before and after means nothing was written. */
function listing(root: string): string[] {
  const out: string[] = []
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = join(d, e.name), s = statSync(p); out.push(p.slice(root.length) + ' ' + s.size + ' ' + s.mtimeMs); if (e.isDirectory()) walk(p) } }
  walk(root)
  return out
}

/** PMF Sequences' own vault: WRWYCR with a PMF run, your H run's g(r) as its RDF on HA, and the peptide's structure. */
async function madeVault() {
  const dir = tmp('vault')
  const { svc, vault } = await newVault(new NodeBackend(dir))
  const a = withPmf(svc.store, { name: 'WRWYCR', col: 'ha', file: 'hmrfast6_ha_a_t200000.xvg', bytes: fixture('hmrfast6_ha_a_t200000.xvg') })
  const r = withAnalysis(a.store, { name: 'WRWYCR', col: 'ha', type: 'rdf', file: 'rdf_o111_Methionine_H.xvg', bytes: bytes('rdf_o111_Methionine_H.xvg') })
  const s = withStructure(r.store, r.rowId, 'mmmmmmmm.gro', bytes('mmmmmmmm.gro'), 'gro')
  svc.commit(s.store, new Map([...a.uploads, ...r.uploads, ...s.uploads]))
  await svc.flush()
  await vault.close()
  return dir
}

/** A finished RDF job of this runner, as its event log has it, whose record wrote the H run's .xvg. */
function jobsWithRun(home: string) {
  const out = tmp('out'), record = join(out, 'rdf_o111_Methionine_H.run.json'), rec = JSON.parse(readFileSync(F + 'rdf_o111_Methionine_H.run.json', 'utf8'))
  const sha = createHash('sha256').update(readFileSync(F + 'rdf_o111_Methionine_H.xvg')).digest('hex')
  writeFileSync(record, JSON.stringify({ ...rec, outputs: [{ kind: 'xvg', path: join(out, 'rdf_o111_Methionine_H.xvg'), size: 1, sha256: sha }] }))
  mkdirSync(join(home, 'jobs'), { recursive: true })
  const at = '2026-10-12T17:16:09.289Z', spec = { kind: 'rdf', title: 'rdf_o111_Methionine_H · H_Met → 13 groups', file: 'gmx', args: [], cwd: out, meta: { record, outDir: out } }
  writeFileSync(join(home, 'jobs', 'jmv5ik7gl0l8e.ndjson'), [{ t: 'created', at, spec }, { t: 'started', at, pid: 1 }, { t: 'ended', at, status: 'done', code: 0, signal: null }].map(e => JSON.stringify(e)).join('\n') + '\n')
  return new Jobs(join(home, 'jobs'))
}

describe('(de)Cypher reads the RDFs of PMF Sequences, with their structures (read only)', () => {
  it('lists each RDF with its curves, its row\'s structures and the run that wrote it; nothing written', async () => {
    const dir = await madeVault(), before = listing(dir), jobs = jobsWithRun(tmp('home'))
    expect([...runsBySha(jobs).values()].map(r => r.job)).toEqual(['jmv5ik7gl0l8e'])
    const v = await openVault(dir), all = await vaultRdfs(v, jobs)
    expect(all.projects).toHaveLength(1)
    const [row] = all.projects[0].rows
    expect(row).toMatchObject({ name: 'WRWYCR', structures: [expect.objectContaining({ format: 'gro' })] })
    expect(row.structures[0].file).toMatch(/mmmmmmmm\.gro$/)
    const [rdf] = row.rdfs
    expect(rdf).toMatchObject({ column: expect.any(String), slot: 'a' })
    expect(rdf.curves).toHaveLength(13)
    expect(rdf.curves[0]).toMatchObject({ label: 'NH_N...S', xCol: 1, yCol: 2, xScale: 1 })
    expect(rdf.run).toMatchObject({ job: 'jmv5ik7gl0l8e', bin: 0.03, frames: { analysed: 51, lastTime: 200000 } })
    expect(rdf.run!.groups[0]).toMatchObject({ role: 'reference', name: 'H_Met' })
    expect(rdf.run!.structure).toMatch(/9\.multiwalker\.gro$/)
    // The RDF's file and the row's structure are sent; nothing else of the vault.
    expect(await vaultFile(v, jobs, rdf.curves[0].file)).toBe(readFileSync(F + 'rdf_o111_Methionine_H.xvg', 'utf8'))
    expect((await vaultFile(v, jobs, row.structures[0].file)).split('\n')[1].trim()).toBe('139')
    await expect(vaultFile(v, jobs, '.matrix/manifest.json')).rejects.toThrow('is not an RDF or a structure of the vault')
    expect(listing(dir)).toEqual(before)
  })

  it('without a matching run, an RDF still comes with its curves, and no atoms', async () => {
    const dir = await madeVault(), all = await vaultRdfs(await openVault(dir), new Jobs(join(tmp('home'), 'jobs')))
    expect(all.projects[0].rows[0].rdfs[0].run).toBeNull()
  })

  it('the routes: no vault is said in words; with one, the list and its files', async () => {
    const s = await apiServer()
    try {
      expect(await s.call('/api/decypher/vault')).toEqual({ status: 409, json: { error: 'no vault set: choose the PMF Sequences vault in settings' } })
      s.ctx.config.vault = await madeVault()
      const r = await s.call<{ projects: { rows: { rdfs: { curves: { file: string }[] }[] }[] }[] }>('/api/decypher/vault')
      expect(r.status).toBe(200)
      const file = r.json.projects[0].rows[0].rdfs[0].curves[0].file
      const text = await fetch(s.base + '/api/decypher/vault/file?path=' + encodeURIComponent(file), { headers: s.headers })
      expect(text.status).toBe(200)
      expect(await text.text()).toContain('@    title "Radial distribution"')
      const no = await fetch(s.base + '/api/decypher/vault/file?path=.matrix/manifest.json', { headers: s.headers })
      expect(no.status).toBe(404)
    } finally { await s.close() }
  })
})

/** Your two runs as gmx-cypher left them in their folder: rdf/<stem>.xvg, .ndx and .run.json beside the structure. */
function runsOnDisk() {
  const root = tmp('runs'), sim = join(root, 'o111/m/9.multiwalker/3'), out = join(sim, 'rdf')
  mkdirSync(out, { recursive: true })
  copyFileSync(F + '9.multiwalker.gro', join(sim, '9.multiwalker.gro'))
  for (const k of ['H', 'S']) {
    const stem = 'rdf_o111_Methionine_' + k, rec = JSON.parse(readFileSync(F + stem + '.run.json', 'utf8'))
    for (const ext of ['.xvg', '.ndx']) copyFileSync(F + stem + ext, join(out, stem + ext))
    rec.inputs.structure.path = join(sim, '9.multiwalker.gro')
    rec.outputs = [{ kind: 'xvg', path: join(out, stem + '.xvg'), size: 1, sha256: 'x' }]
    if (k === 'S') rec.ended = '2026-10-12T18:00:00.000Z'
    writeFileSync(join(out, stem + '.run.json'), JSON.stringify(rec))
  }
  // Not RDF records: another command's, and something else that ends in .run.json.
  writeFileSync(join(out, 'energy_nvt.run.json'), JSON.stringify({ format: 'gmx-cypher run', version: 3, analysis: 'energy', groups: [], outputs: [{ kind: 'xvg', path: join(out, 'x.xvg') }] }))
  writeFileSync(join(out, 'notes.run.json'), 'not json')
  return { root, sim, out }
}

describe('(de)Cypher finds RDF runs gmx-cypher wrote before, by their records', () => {
  it('lists the RDF records under a folder, newest first, and reads one with its g(r)', () => {
    const { root, out } = runsOnDisk()
    const found = findRuns(root, [root])
    expect(found.runs.map(r => r.stem)).toEqual(['rdf_o111_Methionine_S', 'rdf_o111_Methionine_H'])
    expect(found.runs[1]).toMatchObject({ frames: 51, groups: 14, reference: 'H_Met' })
    expect(found.runs[1].structure).toMatch(/9\.multiwalker\.gro$/)
    expect(found).toMatchObject({ more: false, unread: [] })
    expect(findRuns(root, [root], 1)).toMatchObject({ more: true })
    const run = readRun(join(out, 'rdf_o111_Methionine_H.run.json'), [root])
    expect(run.record.groups[0].name).toBe('H_Met')
    expect(run.xvg).toBe(readFileSync(F + 'rdf_o111_Methionine_H.xvg', 'utf8'))
    expect(() => readRun(join(out, 'energy_nvt.run.json'), [root])).toThrow('is not the record of an RDF run')
    expect(() => readRun(join(out, 'rdf_o111_Methionine_H.xvg'), [root])).toThrow('is not a gmx-cypher run record')
  })

  it('stays inside the allowed folders: a folder outside is refused, a link out is not followed', () => {
    const { root } = runsOnDisk(), other = runsOnDisk()
    expect(() => findRuns(other.root, [root])).toThrow('outside the allowed folders')
    symlinkSync(other.root, join(root, 'elsewhere'))
    expect(findRuns(root, [root]).runs).toHaveLength(2)
    expect(() => readRun(join(other.out, 'rdf_o111_Methionine_H.run.json'), [root])).toThrow('outside the allowed folders')
  })

  it('the routes', async () => {
    const { root, out } = runsOnDisk(), s = await apiServer()
    try {
      s.ctx.config.allow = [root]
      const r = await s.call<{ runs: { path: string }[] }>('/api/decypher/runs', { root })
      expect(r.status).toBe(200)
      expect(r.json.runs).toHaveLength(2)
      const one = await s.call<{ record: { groups: unknown[] }; xvg: string }>('/api/decypher/run?path=' + encodeURIComponent(join(out, 'rdf_o111_Methionine_S.run.json')))
      expect(one.json.record.groups).toHaveLength(14)
      expect((await s.call('/api/decypher/runs', { root: '/etc' })).status).toBe(403)
    } finally { await s.close() }
  })
})
