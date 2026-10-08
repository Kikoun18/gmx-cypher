// Original uploaded files (spec §4). The bytes are written exactly as given —
// the File/Blob goes straight to the backend — and their identity is recorded:
// original name, stored path, size, SHA-256, time, type, owner, origin.

import type { StorageBackend } from './backend/types';
import { sha256Hex, uid } from './json';
import { basename, join, safeFileName, uniqueName } from './path';
import type { FileKind, FileMeta, FileOrigin } from './records';

/** Bytes waiting to be written by the next commit (keyed by their future file ID). */
export interface PendingUpload {
  blob: Blob;
  name: string;
  origin?: FileOrigin;
  reconstructedFrom?: string;
  /** SHA-256 already computed from this same blob (readLocal), so it isn't read twice. */
  sha256?: string;
}

export function newFileId() { return uid('f'); }

/** One read of a picked file: its text (for parsing) and its SHA-256 (for duplicates and the record). */
export async function readLocal(file: Blob): Promise<{ text: string; sha256: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { text: new TextDecoder().decode(bytes), sha256: await sha256Hex(bytes) };
}

/** Builds the metadata for a pending upload placed in `dir` (name made unique among `taken`). */
export async function describeUpload(id: string, up: PendingUpload, kind: FileKind, owner: string, dir: string, taken: Iterable<string>): Promise<FileMeta> {
  const stored = uniqueName(safeFileName(up.name), taken);
  return {
    id, kind, owner,
    name: up.name,
    path: join(dir, stored),
    size: up.blob.size,
    sha256: up.sha256 || (await sha256Hex(up.blob)),
    uploaded: new Date().toISOString(),
    mime: up.blob.type || '',
    origin: up.origin || 'upload',
    ...(up.reconstructedFrom ? { reconstructedFrom: up.reconstructedFrom } : {}),
  };
}

/** Names currently in a directory (empty if it doesn't exist). */
export async function namesIn(b: StorageBackend, dir: string): Promise<string[]> {
  if (!(await b.stat(dir))) return [];
  return (await b.list(dir)).map(e => e.name);
}

export async function readUpload(b: StorageBackend, meta: FileMeta): Promise<Blob> { return b.readBlob(meta.path); }

/** Re-hashes the stored file: true if it still matches the recorded SHA-256. */
export async function verifyUpload(b: StorageBackend, meta: FileMeta): Promise<boolean> {
  const st = await b.stat(meta.path);
  if (!st || st.kind !== 'file' || st.size !== meta.size) return false;
  return (await sha256Hex(await b.readBytes(meta.path))) === meta.sha256;
}

export const fileName = (meta: FileMeta) => basename(meta.path);
