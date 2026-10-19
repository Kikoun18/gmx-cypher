// gmx-cypher's own space in the vault (R14, T158): where its files go, and the copy of a record that names nothing
// of this machine. Pure: server/space.ts writes.

import { isSafeId, safeFileName } from '../../../matrix/src/lib/storage/path';
import type { RunRecord } from './record';

/** At the vault root, outside every project folder (all the Matrix scans), not hidden, and never `<slug>--<id>`. */
export const SPACE = 'gmx-cypher';

/** The space's files, from a SHA-256, a Matrix ID and a plain name only. */
export const spacePaths = {
  manifest: SPACE + '/space.json',
  readme: SPACE + '/README.md',
  /** A sent result's record, named by the sent file's SHA-256: the Matrix keeps files byte for byte (T148). */
  record(sha256: string) {
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(sha256 + ' is not a SHA-256');
    return SPACE + '/records/' + sha256 + '.run.json';
  },
  /** A saved compare view of a project (R11). */
  view(project: string, name: string) {
    if (!isSafeId(project)) throw new Error(project + ' is not a Matrix ID');
    if (!name || safeFileName(name) !== name) throw new Error(name + ' is not a plain name');
    return SPACE + '/projects/' + project + '/views/' + name + '.json';
  },
};

export interface PortableRecord extends RunRecord { envNames: string[]; copy: { paths: string; env: string } }

/**
 * A record as the space keeps it (T158): a vault may be shared or put in Git, so every path inside an allowed folder
 * becomes relative to it, any other keeps only its name, the log's folders likewise (home as ~), and the environment
 * keeps its names, not its values. Groups, options, hashes and states are the record's own.
 */
export function portableRecord(r: RunRecord, roots: string[], home: string): PortableRecord {
  const rs = [...roots].sort((a, b) => b.length - a.length);
  const path = (p: string) => { const root = rs.find(x => p === x || p.startsWith(x + '/')); return root ? p.slice(root.length + 1) || '.' : p.split('/').pop() || p; };
  const text = (s: string) => {
    for (const x of rs) s = s.split(x + '/').join('').split(x).join('.');
    return home ? s.split(home + '/').join('~/').split(home).join('~') : s;
  };
  const file = <F extends { path: string }>(f: F): F => ({ ...f, path: path(f.path) });
  return {
    ...r,
    gmx: { ...r.gmx, path: path(r.gmx.path) },
    command: { ...r.command, cwd: path(r.command.cwd) },
    env: {}, envNames: Object.keys(r.env).sort(),
    log: text(r.log),
    inputs: Object.fromEntries(Object.entries(r.inputs).map(([k, f]) => [k, f && file(f)])),
    outputs: r.outputs.map(file),
    ...(r.windows ? { windows: r.windows.map(w => ({ tpr: file(w.tpr), pull: file(w.pull) })) } : {}),
    recipe: { ...r.recipe, outDir: r.recipe.outDir && path(r.recipe.outDir), ...(r.recipe.windows ? { windows: r.recipe.windows.map(w => ({ tpr: path(w.tpr), pull: path(w.pull) })) } : {}) },
    copy: { paths: 'relative to their allowed folder', env: 'names only' },
  };
}
