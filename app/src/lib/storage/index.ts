// Lookup index (.matrix/cache/index.json) and the visible-tree scan it is built
// from. The index only speeds up loading; it is rebuilt whenever it is missing,
// unreadable, or was built from different record files (spec §8, §14).

import type { Stat, StorageBackend } from './backend/types';
import { SEQUENCES_DIR, idOfDirName, isSwapFile, join, vaultPaths } from './path';
import { sha256Hex, stableStringify } from './json';
import { CACHE_SCHEMA } from './cache';

export type DirScope = 'row' | 'column' | 'cell' | 'analysis';

export interface ScannedDir { path: string; id: string; scope: DirScope; /** Parent path: the scope within which IDs must be unique. */ parent: string }

export interface Scan {
  dirs: ScannedDir[];
  /** Every file in the project's visible tree (swap files excluded), with size/mtime. */
  files: Record<string, [number, number]>;
}

export interface Conflict { scope: DirScope; parent: string; id: string; paths: string[] }

/** Walks one project directory. Directory listings and stats only; no content reads. */
export async function scanProject(b: StorageBackend, projDir: string): Promise<Scan> {
  const dirs: ScannedDir[] = [], files: Record<string, [number, number]> = {};
  if (!(await b.stat(projDir))) return { dirs, files };
  const walk = async (dir: string, depth: number, inSeq: boolean, scopeOfChildren: DirScope | null) => {
    for (const e of await b.list(dir)) {
      const p = join(dir, e.name);
      if (e.kind === 'file') {
        if (isSwapFile(e.name)) continue;
        const st = (await b.stat(p)) as Stat | null;
        if (st) files[p] = [st.size, st.lastModified];
        continue;
      }
      const id = idOfDirName(e.name);
      let childScope: DirScope | null = null;
      if (depth === 0 && e.name === SEQUENCES_DIR) { await walk(p, 1, true, 'row'); continue; }
      if (id && scopeOfChildren) {
        dirs.push({ path: p, id, scope: scopeOfChildren, parent: dir });
        childScope = scopeOfChildren === 'column' ? 'cell' : scopeOfChildren === 'cell' ? 'analysis' : null;
      }
      await walk(p, depth + 1, inSeq, inSeq ? null : childScope);
    }
  };
  await walk(projDir, 0, false, 'column');
  return { dirs, files };
}

/** Same ID twice within one scope (e.g. after an interrupted rename): report, never guess. */
export function findConflicts(scan: Scan): Conflict[] {
  const by = new Map<string, ScannedDir[]>();
  for (const d of scan.dirs) {
    const k = d.scope + '|' + d.parent + '|' + d.id;
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(d);
  }
  return [...by.values()].filter(v => v.length > 1).map(v => ({ scope: v[0].scope, parent: v[0].parent, id: v[0].id, paths: v.map(d => d.path).sort() }));
}

// --- index file --------------------------------------------------------------

interface IndexFile { schema: number; kind: 'vault-index'; projects: Record<string, { builtFrom: string; builtAt: string; scan: Scan }> }

/** Fingerprint of a project's record and settings files (names, sizes, mtimes). */
export async function recordsFingerprint(b: StorageBackend, pid: string): Promise<string> {
  const parts: string[] = [];
  const walk = async (dir: string) => {
    if (!(await b.stat(dir))) return;
    for (const e of await b.list(dir)) {
      const p = join(dir, e.name);
      if (e.kind === 'dir') await walk(p);
      else { const st = await b.stat(p); parts.push(p + ':' + (st ? st.size + ':' + st.lastModified : '?')); }
    }
  };
  await walk(join(vaultPaths.records, pid));
  await walk(join(vaultPaths.settings, pid));
  return sha256Hex(parts.sort().join('\n'));
}

async function readIndex(b: StorageBackend): Promise<IndexFile | null> {
  try {
    if (!(await b.stat(vaultPaths.index))) return null;
    const f = JSON.parse(await b.readText(vaultPaths.index)) as IndexFile;
    return f && f.schema === CACHE_SCHEMA && f.kind === 'vault-index' && f.projects && typeof f.projects === 'object' ? f : null;
  } catch { return null; }
}

/** The cached scan for a project if it was built from the current records, else null. */
export async function cachedScan(b: StorageBackend, pid: string): Promise<Scan | null> {
  const f = await readIndex(b), e = f && f.projects[pid];
  if (!e || !e.scan || !Array.isArray(e.scan.dirs) || !e.scan.files) return null;
  return e.builtFrom === (await recordsFingerprint(b, pid)) ? e.scan : null;
}

export async function writeIndex(b: StorageBackend, pid: string, scan: Scan) {
  try {
    const f = (await readIndex(b)) || { schema: CACHE_SCHEMA, kind: 'vault-index' as const, projects: {} };
    f.projects[pid] = { builtFrom: await recordsFingerprint(b, pid), builtAt: new Date().toISOString(), scan };
    await b.writeText(vaultPaths.index, stableStringify(f));
  } catch { /* optional */ }
}

export async function dropIndex(b: StorageBackend, pid: string) {
  const f = await readIndex(b);
  if (!f || !f.projects[pid]) return;
  delete f.projects[pid];
  try { await b.writeText(vaultPaths.index, stableStringify(f)); } catch { /* optional */ }
}
