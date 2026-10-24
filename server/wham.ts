// gmx wham's windows (R6): found under a folder by a template such as `*/umbrella.tpr`, each run input with its pull
// file beside it. Only the allowed folders are read; a folder that can't be read is named, never a reason to stop.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { matchesGlob, naturalCompare, pullFileOf } from '../src/lib/wham';
import { inside } from './files';
import { HttpError } from './http';

export interface FoundWindow { rel: string; tpr: string; pull: string | null }

/** The windows under `root` whose run inputs match `glob` (a `*` matches within one name), in natural order. */
export function findWindows(root: string, glob: string, pull: 'pullx' | 'pullf', roots: string[], unread: string[] = []): FoundWindow[] {
  const base = inside(root, roots);
  if (!statSync(base).isDirectory()) throw new HttpError(400, root + ' is not a folder');
  const segments = glob.split('/').filter(Boolean);
  if (!segments.length || !/\.tpr$/i.test(segments[segments.length - 1])) throw new HttpError(400, 'the template must end in a .tpr name, e.g. */umbrella.tpr');
  const found: FoundWindow[] = [];
  const walk = (dir: string, rel: string, depth: number) => {
    let names: string[];
    try { names = readdirSync(dir); } catch { unread.push(rel || '.'); return; }
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const r = rel ? rel + '/' + name : name;
      if (!matchesGlob(segments.slice(0, depth + 1).join('/'), r)) continue;
      let path: string;
      // A linked folder or file is followed only inside the allowed folders.
      try { path = inside(join(dir, name), roots); } catch { unread.push(r); continue; }
      const st = statSync(path);
      if (depth < segments.length - 1) { if (st.isDirectory()) walk(path, r, depth + 1); continue; }
      if (!st.isFile()) continue;
      const siblings = (() => { try { return readdirSync(dir); } catch { return []; } })();
      const p = pullFileOf(name, pull, siblings);
      found.push({ rel: r, tpr: path, pull: p ? join(dir, p) : null });
    }
  };
  walk(base, '', 0);
  return found.sort((a, b) => naturalCompare(a.rel, b.rel));
}
