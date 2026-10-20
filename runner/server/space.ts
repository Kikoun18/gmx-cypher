// gmx-cypher's own space in the vault (R14a, T158): <vault>/gmx-cypher/, outside every project folder, which the
// Matrix never scans (proved with its own code in test/space.test.ts). With <project>/_inbox/ (send.ts), the only
// place gmx-cypher writes in a vault. Every file is created exclusively; nothing is deleted or replaced.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import type { RunRecord } from '../src/lib/record';
import { portableRecord, SPACE, spacePaths } from '../src/lib/space';
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

/** A sent result's record, portable (T158), under the sent file's SHA-256; the same result sent again is already there. */
export const copyRecord = (vault: string, sha256: string, r: RunRecord, roots: string[], home: string, by: string) =>
  writeInSpace(vault, spacePaths.record(sha256), JSON.stringify(portableRecord(r, roots, home), null, 2) + '\n', by);
