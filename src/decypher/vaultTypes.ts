// What GET /api/decypher/vault answers (server/decypher.ts): the vault's RDFs by project and row.

import type { RunRecord } from '../lib/record'

export interface VaultRun {
  job: string; title: string; groups: RunRecord['groups']; frames: RunRecord['frames']; bin: number | null; structure: string | null
  /** `space`: not one of this runner's jobs, but the record copy kept in the vault's gmx-cypher space when it was sent (R14c). */
  from?: 'space'
}
export interface VaultRdf {
  id: string; column: string; slot: string; time: string
  /** Each curve's file by its path in the vault and its name as uploaded. */
  curves: { label: string; file: string; name: string; xCol: number; yCol: number; xScale: number }[]
  /** The gmx-cypher run that wrote its file: one of this runner's jobs, else the record copy in the vault's space. */
  run: VaultRun | null
}
export interface VaultRow { id: string; name: string; seq: string; structures: { file: string; name: string; format: 'gro' | 'pdb'; atoms: number; title: string }[]; rdfs: VaultRdf[] }
export interface VaultRdfs { path: string; projects: { id: string; name: string; rows: VaultRow[] }[] }
