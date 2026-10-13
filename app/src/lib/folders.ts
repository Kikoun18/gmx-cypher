// Where exports go (batch 3, R8a): downloads, or a folder chosen once and remembered in this browser (like the vault
// handles, never in a vault), refused inside the vault. Database `pmf-export-folder`, store `folders`.

import { queryWrite, requestWrite } from './storage/backend/fsAccess';
import { download } from './export';

const DB = 'pmf-export-folder', OS = 'folders', KEY = 'exports';

async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(OS);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return new Promise((res, rej) => {
    const t = db.transaction(OS, mode), req = f(t.objectStore(OS));
    t.oncomplete = () => { db.close(); res(req.result); };
    t.onerror = t.onabort = () => { db.close(); rej(t.error); };
  });
}

export async function loadExportFolder(): Promise<FileSystemDirectoryHandle | null> {
  try { return (await tx<FileSystemDirectoryHandle | undefined>('readonly', s => s.get(KEY))) ?? null; } catch { return null; }
}

/** The vault folder itself, or any folder inside it. */
export async function insideVault(dir: FileSystemDirectoryHandle, vault: FileSystemDirectoryHandle | null): Promise<boolean> {
  return !!vault && (await vault.resolve(dir).catch(() => null)) != null;
}

/** Asks for a folder (null if cancelled); one inside the vault is refused. */
export async function chooseExportFolder(vault: FileSystemDirectoryHandle | null): Promise<{ name: string } | { error: string } | null> {
  let dir: FileSystemDirectoryHandle;
  try { dir = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ id: 'pmf-exports', mode: 'readwrite' }); } catch { return null; }
  if (await insideVault(dir, vault)) return { error: '“' + dir.name + '” is inside the vault — choose a folder outside it' };
  try { await tx('readwrite', s => s.put(dir, KEY)); } catch { return { error: 'this browser can’t remember the folder' }; }
  return { name: dir.name };
}

export type Dest = { dir: FileSystemDirectoryHandle | null; why: string };
/** Run inside the key press or click (permission needs it), before the files are made: the folder, or why not. */
export async function openDest(dest: 'downloads' | 'folder', vault: FileSystemDirectoryHandle | null): Promise<Dest> {
  if (dest === 'downloads') return { dir: null, why: '' };
  const dir = await loadExportFolder();
  if (!dir) return { dir: null, why: 'no export folder chosen' };
  if (await insideVault(dir, vault)) return { dir: null, why: 'the export folder is inside this vault' };
  const ok = (await queryWrite(dir).catch(() => 'denied')) === 'granted' || (await requestWrite(dir).catch(() => 'denied')) === 'granted';
  return ok ? { dir, why: '' } : { dir: null, why: 'no permission for ' + dir.name + '/' };
}

/** Writes each file into the folder; a name already there gets -2, -3… Returns the names used. */
export async function saveToFolder(dir: FileSystemDirectoryHandle, files: { name: string; blob: Blob }[]): Promise<string[]> {
  const out: string[] = [];
  for (const f of files) {
    const dot = f.name.lastIndexOf('.'), base = f.name.slice(0, dot), ext = f.name.slice(dot);
    let n = f.name;
    for (let i = 2; await dir.getFileHandle(n).then(() => true, () => false); i++) n = base + '-' + i + ext;
    const w = await (await dir.getFileHandle(n, { create: true })).createWritable();
    await w.write(f.blob); await w.close();
    out.push(n);
  }
  return out;
}

/** Sends the files; a folder that can't be used falls back to downloads, and the message says why. */
export async function deliver(files: { name: string; blob: Blob; note?: string }[], d: Dest): Promise<string> {
  const list = (n: string[]) => (n.length === 1 ? n[0] + (files[0].note ? ' (' + files[0].note + ')' : '') : n.length + ' files');
  let why = d.why;
  if (d.dir) {
    try { return '✓ saved ' + list(await saveToFolder(d.dir, files)) + ' to ' + d.dir.name + '/'; } catch { why = d.dir.name + '/ can’t be written'; }
  }
  for (const f of files) download(f.blob, f.name);
  return (why ? why + ' — downloaded ' : '✓ exported ') + list(files.map(f => f.name));
}
