// .matrix/cache/: disposable derived data (spec §8). Every entry records what it
// was derived from; anything missing, stale or unparseable is ignored and rebuilt.

import type { StorageBackend } from './backend/types';
import { join, vaultPaths } from './path';
import { stableStringify } from './json';
import type { Table } from '../types';
import type { GmxHeader } from '../gmxHeader';

export const CACHE_SCHEMA = 1;
/** Bump when parseTable/pickXY/pickCurves/parseGmxHeader change, so old cache entries are not used. */
export const PARSER = { table: 'xvg-table@1', pmf: 'pmf-xy@1', gmxHeader: 'gmx-header@1' } as const;

export interface PmfEntry { source: { sha256: string; parser: string; xCol: number; yCol: number }; x: number[]; y: number[] }
interface PmfFile { schema: number; kind: 'pmf-series'; entries: Record<string, PmfEntry> }

export const pmfKey = (sha: string, xCol: number, yCol: number) => sha + ':' + PARSER.pmf + ':' + xCol + ':' + yCol;
const pmfPath = (pid: string) => join(vaultPaths.cache, pid, 'pmf.json');
const parsedPath = (sha: string, parser: string) => join(vaultPaths.cache, 'parsed', sha + '.' + parser.replace('@', '-') + '.json');
const tablePath = (sha: string) => parsedPath(sha, PARSER.table);

async function readJson<T>(b: StorageBackend, p: string): Promise<T | null> {
  try { const st = await b.stat(p); if (!st) return null; return JSON.parse(await b.readText(p)) as T; } catch { return null; }
}
async function writeJson(b: StorageBackend, p: string, v: unknown) {
  try { await b.writeText(p, stableStringify(v)); } catch { /* the cache is optional */ }
}

export async function readPmfCache(b: StorageBackend, pid: string): Promise<Record<string, PmfEntry>> {
  const f = await readJson<PmfFile>(b, pmfPath(pid));
  if (!f || f.schema !== CACHE_SCHEMA || f.kind !== 'pmf-series' || !f.entries || typeof f.entries !== 'object') return {};
  const out: Record<string, PmfEntry> = {};
  for (const [k, e] of Object.entries(f.entries)) {
    if (e && e.source && e.source.parser === PARSER.pmf && Array.isArray(e.x) && Array.isArray(e.y) && e.x.length === e.y.length) out[k] = e;
  }
  return out;
}

export async function writePmfCache(b: StorageBackend, pid: string, entries: Record<string, PmfEntry>) {
  await writeJson(b, pmfPath(pid), { schema: CACHE_SCHEMA, kind: 'pmf-series', entries });
}

interface TableFile { schema: number; source: { sha256: string; parser: string }; table: Table }

export async function readTableCache(b: StorageBackend, sha: string): Promise<Table | null> {
  const f = await readJson<TableFile>(b, tablePath(sha));
  if (!f || f.schema !== CACHE_SCHEMA || !f.source || f.source.sha256 !== sha || f.source.parser !== PARSER.table || !f.table || !Array.isArray(f.table.cols)) return null;
  // JSON has no NaN: parseTable fills short rows with NaN, stored as null.
  f.table.cols = f.table.cols.map(c => c.map(v => (v == null ? NaN : v)));
  return f.table;
}

export async function writeTableCache(b: StorageBackend, sha: string, table: Table) {
  await writeJson(b, tablePath(sha), { schema: CACHE_SCHEMA, source: { sha256: sha, parser: PARSER.table }, table });
}

interface HeaderFile { schema: number; source: { sha256: string; parser: string }; header: GmxHeader | null }

/** The parsed header of an original; null = it has none; undefined = not cached. */
export async function readHeaderCache(b: StorageBackend, sha: string): Promise<GmxHeader | null | undefined> {
  const f = await readJson<HeaderFile>(b, parsedPath(sha, PARSER.gmxHeader));
  if (!f || f.schema !== CACHE_SCHEMA || !f.source || f.source.sha256 !== sha || f.source.parser !== PARSER.gmxHeader || f.header === undefined) return undefined;
  return f.header;
}

export async function writeHeaderCache(b: StorageBackend, sha: string, header: GmxHeader | null) {
  await writeJson(b, parsedPath(sha, PARSER.gmxHeader), { schema: CACHE_SCHEMA, source: { sha256: sha, parser: PARSER.gmxHeader }, header });
}
