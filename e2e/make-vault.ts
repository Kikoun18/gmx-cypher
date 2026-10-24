// The Matrix's own vault for the browser test: Methionine × PG with two RDFs (runs a and b: your S and H runs'
// g(r)) and the peptide's structure. The runs that wrote them are not among the runner's jobs here, as for a vault
// that came from another machine: the groups have no atoms and no reference is known.
// node --import ./server/register.mjs e2e/make-vault.ts <folder>
import { readFileSync } from 'node:fs'
import { NodeBackend } from '../../matrix/scripts/node-backend'
import { newVault, withAnalysis, withStructure } from '../../matrix/test/helpers'

const [dir] = process.argv.slice(2)
if (!dir) throw new Error('a folder for the vault')
const F = new URL('../test/fixtures/decypher/', import.meta.url).pathname
const bytes = (n: string) => new Uint8Array(readFileSync(F + n))
const { svc, vault } = await newVault(new NodeBackend(dir))
const a = withAnalysis(svc.store, { name: 'Methionine', col: 'pg', slot: 'a', type: 'rdf', file: 'rdf_o111_Methionine_S.xvg', bytes: bytes('rdf_o111_Methionine_S.xvg') })
const b = withAnalysis(a.store, { name: 'Methionine', col: 'pg', slot: 'b', type: 'rdf', file: 'rdf_o111_Methionine_H.xvg', bytes: bytes('rdf_o111_Methionine_H.xvg') })
const s = withStructure(b.store, b.rowId, 'mmmmmmmm.gro', bytes('mmmmmmmm.gro'), 'gro')
svc.commit(s.store, new Map([...a.uploads, ...b.uploads, ...s.uploads]))
await svc.flush()
await vault.close()
