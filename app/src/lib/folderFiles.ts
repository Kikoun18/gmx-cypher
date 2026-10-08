// Files from a chosen or dropped folder (R1d), each with its path relative to
// that folder. Only .xvg, .dat and .txt are kept; other files are listed as
// skipped, and OS clutter (D41) is ignored silently (F9).

import { isOsClutter } from './storage/path';

export interface PickedFile { file: File; path: string }
export interface FolderPick { files: PickedFile[]; skipped: string[] }

/** The parts of FileSystemEntry that are used (tests supply look-alikes). */
export interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?: (ok: (f: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (e: EntryLike[]) => void, err?: (e: unknown) => void) => void };
}

const DATA = /\.(xvg|dat|txt)$/i;

function sortPicked(all: PickedFile[]): FolderPick {
  const files: PickedFile[] = [], skipped: string[] = [];
  for (const p of all) {
    if (p.path.split('/').some(isOsClutter)) continue;
    if (DATA.test(p.path)) files.push(p); else skipped.push(p.path);
  }
  const byPath = new Intl.Collator(undefined, { numeric: true }).compare;
  return { files: files.sort((a, b) => byPath(a.path, b.path)), skipped: skipped.sort(byPath) };
}

export function filesFromInput(list: FileList | File[]): FolderPick {
  return sortPicked(Array.from(list, file => ({ file, path: file.webkitRelativePath || file.name })));
}

/** Walks entries recursively; readEntries returns batches, so it is called until it returns none. */
export async function filesFromEntries(entries: EntryLike[]): Promise<FolderPick> {
  const out: PickedFile[] = [];
  const walk = async (e: EntryLike): Promise<void> => {
    if (isOsClutter(e.name)) return;
    if (e.isFile && e.file) {
      out.push({ file: await new Promise<File>((ok, err) => e.file!(ok, err)), path: e.fullPath.replace(/^\/+/, '') });
    } else if (e.isDirectory && e.createReader) {
      const reader = e.createReader();
      for (;;) {
        const batch = await new Promise<EntryLike[]>((ok, err) => reader.readEntries(ok, err));
        if (!batch.length) break;
        for (const k of batch) await walk(k);
      }
    }
  };
  for (const e of entries) await walk(e);
  return sortPicked(out);
}

/**
 * Takes every entry from a drop synchronously (the list is emptied once the event
 * returns), then walks them. Without entry support, the plain file list is used.
 */
export function filesFromDrop(dt: DataTransfer): Promise<FolderPick> {
  const items = Array.from(dt.items || []).filter(it => it.kind === 'file');
  const entries = items.map(it => it.webkitGetAsEntry?.() as EntryLike | null);
  if (!items.length || entries.some(e => !e)) return Promise.resolve(filesFromInput(Array.from(dt.files)));
  return filesFromEntries(entries as EntryLike[]);
}

/** fn over items, at most n at a time, results in input order; onEach(done) after each. */
export async function mapLimit<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>, onEach?: (done: number) => void): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0, done = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
      onEach?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}
