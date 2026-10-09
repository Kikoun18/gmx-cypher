// Files by path, only inside the allowed folders (T10), and uploads written once (T11).

import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream, mkdirSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { safeFileName } from '../../app/src/lib/storage/path';
import { inputRole } from '../src/lib/inputs';
import { HttpError } from './http';

const within = (p: string, root: string) => p === root || p.startsWith(root + sep);
const real = (p: string) => { try { return realpathSync(p); } catch { return null; } };

/** The real path of `path`, if it exists and lies inside one of `roots` once every link is followed. */
export function inside(path: string, roots: string[]): string {
  const r = real(path);
  if (!r) throw new HttpError(404, 'no such file or folder: ' + path);
  if (!roots.map(real).some(root => root && within(r, root))) throw new HttpError(403, path + ' is outside the allowed folders');
  return r;
}

export interface Entry { name: string; kind: 'dir' | 'file'; size: number; mtime: number; role: ReturnType<typeof inputRole> }
export interface Listing { path: string; parent: string | null; entries: Entry[]; hidden: number }

/** Folders and GROMACS files of one allowed folder; dot-files and other files are only counted, links out are left out. */
export function listFolder(path: string, roots: string[]): Listing {
  const dir = inside(path, roots), entries: Entry[] = [];
  let hidden = 0;
  for (const name of readdirSync(dir).sort((a, b) => a.localeCompare(b))) {
    const r = real(join(dir, name));
    if (!r || !roots.map(real).some(root => root && within(r, root))) continue;
    const st = statSync(r);
    const role = inputRole(name);
    if (name.startsWith('.') || (!st.isDirectory() && !role)) { hidden++; continue; }
    entries.push({ name, kind: st.isDirectory() ? 'dir' : 'file', size: st.isDirectory() ? 0 : st.size, mtime: Math.round(st.mtimeMs), role: st.isDirectory() ? null : role });
  }
  entries.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'dir' ? -1 : 1));
  const up = dirname(dir);
  return { path: dir, parent: up !== dir && roots.map(real).some(root => root && within(up, root)) ? up : null, entries, hidden };
}

/** Names in a folder (for suggestions); empty if it isn't an allowed folder. */
export function namesIn(dir: string, roots: string[]): string[] {
  try { return readdirSync(inside(dir, roots)); } catch { return []; }
}

/** A new folder <home>/<kind>/<time>-<random>; it fails rather than reuse one. */
export function newFolder(home: string, kind: string): string {
  const dir = join(home, kind, new Date().toISOString().replace(/\D/g, '').slice(0, 14) + '-' + randomBytes(4).toString('hex'));
  mkdirSync(dirname(dir), { recursive: true });
  mkdirSync(dir);
  return dir;
}

/** Streams an upload to <home>/uploads/<new id>/<safe name>, created exclusively: never overwrites, never held in memory. */
export async function saveUpload(body: Readable, home: string, name: string): Promise<{ path: string; size: number; sha256: string }> {
  const dir = newFolder(home, 'uploads');
  const path = join(dir, safeFileName(name));
  const hash = createHash('sha256');
  let size = 0;
  body.on('data', (c: Buffer) => { size += c.length; hash.update(c); });
  await pipeline(body, createWriteStream(path, { flags: 'wx' }));
  return { path, size, sha256: hash.digest('hex') };
}
