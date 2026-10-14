// .matrix/manifest.json: vault identity and format version (spec §5).

import type { VaultIO } from './io';
import { CorruptFileError } from './io';
import { stableStringify, uid } from './json';
import { FORMER_TAGS, tagsOf } from '../seq';
import { SCHEMA_VERSION, type Manifest } from './records';
import { recordPaths, settingsPaths, vaultPaths } from './path';

export const APP_ID = 'pmf-sequences';
export const FORMAT_ID = 'matrix-vault';

export function newManifest(now = new Date(), provenance?: { migratedFrom: string }): Manifest {
  const t = now.toISOString();
  const m: Manifest = { app: APP_ID, format: FORMAT_ID, schemaVersion: SCHEMA_VERSION, vaultId: uid('v'), created: t, modified: t };
  if (provenance) { m.migratedFrom = provenance.migratedFrom; m.migratedAt = t; }
  return m;
}

export type Compat = 'ok' | 'upgrade' | 'newer' | 'foreign';

export function compatibility(m: Manifest, current = SCHEMA_VERSION): Compat {
  if (!m || m.format !== FORMAT_ID || typeof m.schemaVersion !== 'number') return 'foreign';
  if (m.schemaVersion > current) return 'newer';
  if (m.schemaVersion < current) return 'upgrade';
  return 'ok';
}

export async function readManifest(io: VaultIO): Promise<Manifest | null> {
  try { return await io.readJson<Manifest>(vaultPaths.manifest); } catch (e) {
    if (e instanceof CorruptFileError) throw new Error('.matrix/manifest.json is damaged — the vault can’t be identified. Restore it from a backup or Git.');
    throw e;
  }
}

export async function writeManifest(io: VaultIO, m: Manifest, force = false) { await io.writeJson(vaultPaths.manifest, m, { force }); }

/**
 * One step of a schema upgrade. `run` only reads, and returns the record writes
 * (text null = delete); Vault.upgrade backs up exactly those paths and applies the
 * writes at the journal's commit point, with the manifest bump (F19). Running it on
 * an upgraded vault returns nothing.
 */
export interface SchemaMigration { from: number; to: number; describe: string; run: (io: VaultIO) => Promise<{ path: string; text: string | null }[]> }

async function dirs(io: VaultIO, path: string) {
  return (await io.backend.stat(path)) ? (await io.backend.list(path)).filter(e => e.kind === 'dir').map(e => e.name) : [];
}

/** 1 → 2 (R2): each run's `methods` ({ key: true }) become `tags`; every project gets the former methods as its tag list. */
const methodsToTags: SchemaMigration = {
  from: 1, to: 2, describe: 'Run methods become tags',
  run: async io => {
    const out: { path: string; text: string | null }[] = [];
    for (const pid of await dirs(io, vaultPaths.records)) {
      const rows = recordPaths.rows(pid);
      if (await io.backend.stat(rows)) for (const e of await io.backend.list(rows)) {
        if (e.kind !== 'file' || !e.name.endsWith('.json')) continue;
        const path = rows + '/' + e.name, rec = await io.readJson<{ runs?: Record<string, unknown>[] }>(path);
        if (!rec || !Array.isArray(rec.runs) || !rec.runs.some(r => 'methods' in r || !Array.isArray(r.tags))) continue;
        rec.runs = rec.runs.map(r => { const { methods: _m, ...rest } = r; return { ...rest, tags: tagsOf(r) }; });
        out.push({ path, text: stableStringify(rec) });
      }
      if (!(await io.backend.stat(settingsPaths.tags(pid))) && (await io.backend.stat(recordPaths.project(pid)))) out.push({ path: settingsPaths.tags(pid), text: stableStringify({ tags: FORMER_TAGS }) });
    }
    return out;
  },
};

/**
 * 2 → 3 (batch 2, R4e): curve records may carry `vis` and `shade`. No record changes; the version
 * moves so an older app, which would drop the new fields when it saves, opens the vault read-only.
 */
const curveDisplayStep: SchemaMigration = { from: 2, to: 3, describe: 'Curves keep their visibility and shade', run: async () => [] };

/**
 * 3 → 4 (batch 3, F-1): records may carry dashes, type sources, marks, lines, page metrics and scripts,
 * and settings a metrics.json. No record changes; the version moves so an older app opens the vault read-only.
 */
const batch3Fields: SchemaMigration = { from: 3, to: 4, describe: 'Dashes, type sources, marks, lines, metrics and scripts', run: async () => [] };

/** Real upgrade steps, in order. Tests may inject their own. */
export const MIGRATIONS: SchemaMigration[] = [methodsToTags, curveDisplayStep, batch3Fields];
