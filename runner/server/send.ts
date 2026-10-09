// Sending a result (R6c, T35, T36): the one write gmx-cypher ever makes into a vault. The g(r) file is
// copied, exclusively, into <project folder>/_inbox/ under a name free there (PMF Sequences' uniqueName);
// PMF Sequences lists it under Vault → Untracked files, and attaching it opens the upload dialog.

import { constants, copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { safeFileName, uniqueName } from '../../app/src/lib/storage/path';
import { HttpError } from './http';
import type { VaultView } from './vault';

/** No `--` (PMF Sequences finds `slug--id` folders by ID) and none of its own `_sequences`, `_imports`, `_restored`. */
export const INBOX = '_inbox';

export function sendToInbox(v: VaultView, project: { id: string; name: string; dir: string }, xvg: string, name: string, pmfUrl: string | null) {
  if (!name || safeFileName(name) !== name) throw new HttpError(400, name + ' is not a plain file name (as PMF Sequences would save it: ' + safeFileName(name) + ')');
  const projectDir = join(v.path, project.dir);
  if (!existsSync(projectDir)) throw new HttpError(409, 'the folder of ' + project.name + ' is missing: ' + projectDir);
  const inbox = join(projectDir, INBOX);
  if (!existsSync(inbox)) mkdirSync(inbox);
  const final = uniqueName(name, readdirSync(inbox));
  copyFileSync(xvg, join(inbox, final), constants.COPYFILE_EXCL);
  return {
    path: project.dir + '/' + INBOX + '/' + final, name: final, renamed: final !== name,
    next: [
      'open ' + project.name + ' in PMF Sequences',
      'Vault → Check folder now (or reload the page): PMF Sequences rescans the folder only then',
      'Vault → Untracked files → attach ' + final + ': the upload dialog shows where it lands',
    ],
    ...(pmfUrl ? { link: pmfUrl.replace(/#.*$/, '') + '#/p/' + project.id + '/all' } : {}),
  };
}
