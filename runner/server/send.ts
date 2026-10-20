// Sending a result (R6c, T35, T36): the g(r) file is copied, exclusively, into <project folder>/_inbox/ under a
// name free there (the Matrix's uniqueName); the Matrix lists it under Vault → Untracked files, and attaching it
// opens the upload dialog. The job's record goes beside it in gmx-cypher's own space (R14a), the only other write.

import { constants, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { safeFileName, uniqueName } from '../../matrix/src/lib/storage/path';
import { recordComplete, type RunRecord } from '../src/lib/record';
import { spacePaths } from '../src/lib/space';
import { HttpError } from './http';
import { copyRecord } from './space';
import type { VaultView } from './vault';

/** No `--` (the Matrix finds `slug--id` folders by ID) and none of its own `_sequences`, `_imports`, `_restored`. */
export const INBOX = '_inbox';

export function sendToInbox(v: VaultView, project: { id: string; name: string; dir: string }, xvg: string, name: string, pmfUrl: string | null) {
  if (!name || safeFileName(name) !== name) throw new HttpError(400, name + ' is not a plain file name (as the Matrix would save it: ' + safeFileName(name) + ')');
  const projectDir = join(v.path, project.dir);
  if (!existsSync(projectDir)) throw new HttpError(409, 'the folder of ' + project.name + ' is missing: ' + projectDir);
  const inbox = join(projectDir, INBOX);
  if (!existsSync(inbox)) mkdirSync(inbox);
  const final = uniqueName(name, readdirSync(inbox));
  copyFileSync(xvg, join(inbox, final), constants.COPYFILE_EXCL);
  return {
    path: project.dir + '/' + INBOX + '/' + final, name: final, renamed: final !== name,
    next: [
      'open ' + project.name + ' in the Matrix',
      'Vault → Check folder now (or reload the page): the Matrix rescans the folder only then',
      'Vault → Untracked files → attach ' + final + ': the upload dialog shows where it lands',
    ],
    ...(pmfUrl ? { link: pmfUrl.replace(/#.*$/, '') + '#/p/' + project.id + '/all' } : {}),
  };
}

/**
 * A sent result's record, kept in the space under the sent file's SHA-256 (R14a, T158): its path there, or null for
 * a record that isn't complete or has no hash of its g(r). The same result sent again finds its copy already there.
 */
export function keepRecord(v: VaultView, recordPath: string, roots: string[], by: string): string | null {
  const r = JSON.parse(readFileSync(recordPath, 'utf8')) as RunRecord, sha = r.outputs.find(o => o.kind === 'xvg')?.sha256;
  if (!recordComplete(r) || !sha) return null;
  copyRecord(v.path, sha, r, roots, homedir(), by);
  return spacePaths.record(sha);
}

