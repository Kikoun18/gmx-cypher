// .matrix/trash/<UTCstamp>--<type>--<id>/ (spec §9, decision D28):
// trash-manifest.json + content/<original vault-relative path>.

import type { StorageBackend } from './backend/types';
import type { Step } from './journal';
import { join, stamp, vaultPaths } from './path';
import { stableStringify } from './json';
import { SCHEMA_VERSION } from './records';

export type TrashType = 'project' | 'page' | 'column' | 'row' | 'run' | 'analysis' | 'structure' | 'curve' | 'file' | 'literature' | 'note' | 'cell' | 'schema-backup';

export interface TrashManifest {
  type: TrashType;
  id: string;
  projectId: string | null;
  /** Short human description, e.g. "Sequence WRWYCR". */
  label: string;
  deletedAt: string;
  schemaVersion: number;
  /** Vault-relative paths that were moved in, each stored under content/<path>. */
  originalPaths: string[];
  /** The records (or sub-records) as they were. */
  records: unknown;
  /** IDs and positions of what it belonged to: project, row, column, pages… */
  parents: Record<string, unknown>;
}

export interface TrashItem { dir: string; name: string; manifest: TrashManifest | null }

const used = new Set<string>();
export function trashDir(type: TrashType, id: string, d = new Date()): string {
  // Same-second deletions of the same entity get a counter, so names never collide.
  const base = stamp(d) + '--' + type + '--' + id;
  let name = base;
  for (let i = 2; used.has(name); i++) name = base + '-' + i;
  used.add(name);
  return join(vaultPaths.trash, name);
}
export const contentPath = (dir: string, original: string) => join(dir, 'content', original);

/** The journal steps that move `paths` into a new trash item and write its manifest. */
export function trashSteps(m: Omit<TrashManifest, 'deletedAt' | 'schemaVersion'>, d = new Date()): { dir: string; steps: Step[] } {
  const dir = trashDir(m.type, m.id, d);
  const manifest: TrashManifest = { ...m, deletedAt: d.toISOString(), schemaVersion: SCHEMA_VERSION };
  const steps: Step[] = [{ kind: 'write', path: join(dir, 'trash-manifest.json'), text: stableStringify(manifest) }];
  for (const p of m.originalPaths) steps.push({ kind: 'move', from: p, to: contentPath(dir, p) });
  return { dir, steps };
}

export async function listTrash(b: StorageBackend): Promise<TrashItem[]> {
  if (!(await b.stat(vaultPaths.trash))) return [];
  const out: TrashItem[] = [];
  for (const e of await b.list(vaultPaths.trash)) {
    if (e.kind !== 'dir') continue;
    const dir = join(vaultPaths.trash, e.name);
    let manifest: TrashManifest | null = null;
    try { manifest = JSON.parse(await b.readText(join(dir, 'trash-manifest.json'))); } catch { manifest = null; }
    out.push({ dir, name: e.name, manifest });
  }
  return out.sort((a, b) => b.name.localeCompare(a.name));
}

export async function deleteTrashItem(b: StorageBackend, dir: string) {
  if (!dir.startsWith(vaultPaths.trash + '/')) throw new Error('not a trash item: ' + dir);
  await b.remove(dir, { recursive: true });
}

export async function emptyTrash(b: StorageBackend) {
  for (const t of await listTrash(b)) await deleteTrashItem(b, t.dir);
}
