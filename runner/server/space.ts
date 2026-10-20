// gmx-cypher's own space in the vault (R14a, T158): <vault>/gmx-cypher/, outside every project folder, which the
// Matrix never scans (proved with its own code in test/space.test.ts). With <project>/_inbox/ (send.ts), the only
// place gmx-cypher writes in a vault. Every file is created exclusively; nothing is deleted or replaced.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import type { RunRecord } from '../src/lib/record';
import { portableRecord, portableView, resolvedView, SPACE, spacePaths, type SavedView } from '../src/lib/space';
import { HttpError } from './http';

const README = `# gmx-cypher

This folder is gmx-cypher's own space in this vault. The Matrix does not read this folder: it reads only the
project folders and .matrix/.

- \`space.json\` says what wrote this folder.
- \`records/<sha256>.run.json\`: for each result sent to the vault, the record of the gmx-cypher job that wrote it,
  named by the SHA-256 of the sent file. Its paths are relative to the folder gmx-cypher was allowed to read, and
  its environment keeps only the variables' names.
- \`projects/<project id>/views/\`: compare views saved in gmx-cypher.

gmx-cypher only adds files here; it never deletes or changes one.
`;

/** The space, made once with its space.json and README; a folder of that name without our space.json is refused. */
export function ensureSpace(vault: string, by: string): string {
  const dir = join(vault, SPACE), manifest = join(vault, spacePaths.manifest);
  if (existsSync(dir)) {
    let m: { format?: string } | null = null;
    try { m = JSON.parse(readFileSync(manifest, 'utf8')); } catch { /* not ours */ }
    if (m?.format !== 'gmx-cypher space') throw new HttpError(409, dir + " is not gmx-cypher's space (it has no space.json): rename that folder, and gmx-cypher makes its own");
    return dir;
  }
  mkdirSync(dir);
  writeFileSync(manifest, JSON.stringify({ format: 'gmx-cypher space', version: 1, by, created: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' });
  writeFileSync(join(vault, spacePaths.readme), README, { flag: 'wx' });
  return dir;
}

/** A new file in the space; an existing one is left as it is ("exists"). Any path outside the space is refused. */
export function writeInSpace(vault: string, rel: string, text: string, by: string): 'written' | 'exists' {
  const n = normalize(rel);
  if (!n.startsWith(SPACE + '/') || n.split('/').includes('..')) throw new HttpError(400, rel + ' is outside gmx-cypher/: besides a project\'s _inbox, gmx-cypher writes only in its own space');
  ensureSpace(vault, by);
  const p = join(vault, n);
  mkdirSync(dirname(p), { recursive: true });
  try { writeFileSync(p, text, { flag: 'wx' }); return 'written'; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') return 'exists'; throw e; }
}

/** The record copies in the space (R13, R14c): each sent result's run, newest first, for a run diff. */
export function listRecords(vault: string): { sha256: string; name: string; analysis: string; ended: string | null }[] {
  const dir = dirname(join(vault, spacePaths.record('0'.repeat(64))));
  let names: string[] = [];
  try { names = readdirSync(dir).filter(n => /^[0-9a-f]{64}\.run\.json$/.test(n)); } catch { return []; }
  return names.flatMap(n => {
    const sha256 = n.slice(0, 64);
    try {
      const r = JSON.parse(readFileSync(join(dir, n), 'utf8')) as RunRecord;
      if (r.format !== 'gmx-cypher run') return [];
      const file = (r.outputs ?? []).find(o => o.sha256 === sha256)?.path.split('/').pop() ?? sha256.slice(0, 12);
      return [{ sha256, name: file.replace(/\.xvg$/, ''), analysis: r.analysis ?? 'rdf', ended: r.ended ?? null }];
    } catch { return []; }
  }).sort((a, b) => (b.ended ?? '').localeCompare(a.ended ?? '') || a.name.localeCompare(b.name));
}

/** One record copy, by the sent file's SHA-256. */
export function readRecordCopy(vault: string, sha256: string): RunRecord {
  let rel: string;
  try { rel = spacePaths.record(sha256); } catch (e) { throw new HttpError(400, (e as Error).message); }
  try { return JSON.parse(readFileSync(join(vault, rel), 'utf8')) as RunRecord; }
  catch { throw new HttpError(404, 'no record copy of ' + sha256.slice(0, 12) + '… in the vault'); }
}

/** The saved views of a project (R14b), by name, newest first; [] before the first. */
export function listViews(vault: string, project: string): { name: string; saved: string; sources: number }[] {
  const dir = dirname(join(vault, spacePaths.view(project, 'x')));
  let names: string[] = [];
  try { names = readdirSync(dir).filter(n => n.endsWith('.json')); } catch { return []; }
  return names.flatMap(n => {
    try { const v = JSON.parse(readFileSync(join(dir, n), 'utf8')) as SavedView; return v.format === 'gmx-cypher view' ? [{ name: n.slice(0, -5), saved: String(v.saved), sources: Array.isArray(v.sources) ? v.sources.length : 0 }] : []; }
    catch { return []; }
  }).sort((a, b) => b.saved.localeCompare(a.saved) || a.name.localeCompare(b.name));
}

/** One saved view, its records found again under the allowed folders (and those found nowhere, named). */
export function readView(vault: string, project: string, name: string, roots: string[]): { view: SavedView; missing: string[] } {
  let v: SavedView;
  try { v = JSON.parse(readFileSync(join(vault, spacePaths.view(project, name)), 'utf8')); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new HttpError(404, 'no view named "' + name + '" in this project'); throw e; }
  if (v?.format !== 'gmx-cypher view' || !Array.isArray(v.sources)) throw new HttpError(400, name + ' is not a gmx-cypher view');
  return resolvedView(v, roots, p => existsSync(p));
}

/** A view saved once (R14b): records named relative to their allowed folder; a name taken is refused, never replaced. */
export function saveView(vault: string, project: string, body: Pick<SavedView, 'name' | 'sources' | 'view' | 'labels'>, roots: string[], by: string): SavedView {
  let rel: string;
  try { rel = spacePaths.view(project, String(body.name ?? '').trim()); } catch (e) { throw new HttpError(400, (e as Error).message); }
  let v: SavedView;
  try { v = portableView({ format: 'gmx-cypher view', version: 1, name: String(body.name).trim(), saved: new Date().toISOString(), by, sources: body.sources ?? [], view: body.view ?? {}, labels: body.labels ?? {} }, roots); }
  catch (e) { throw new HttpError(400, (e as Error).message); }
  if (writeInSpace(vault, rel, JSON.stringify(v, null, 2) + '\n', by) === 'exists') throw new HttpError(409, 'a view named "' + v.name + '" exists: nothing was replaced; choose another name');
  return v;
}

/** A sent result's record, portable (T158), under the sent file's SHA-256; the same result sent again is already there. */
export const copyRecord = (vault: string, sha256: string, r: RunRecord, roots: string[], home: string, by: string) =>
  writeInSpace(vault, spacePaths.record(sha256), JSON.stringify(portableRecord(r, roots, home), null, 2) + '\n', by);
