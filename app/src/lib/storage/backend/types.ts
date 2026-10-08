// The only interface the storage layer uses to touch a disk. Paths are
// vault-relative, '/'-separated, without a leading slash; '' is the vault root.

export type EntryKind = 'file' | 'dir';

export interface Stat {
  kind: EntryKind;
  /** Bytes; 0 for directories. */
  size: number;
  /** ms since epoch; 0 when the backend can't tell (directories in the browser). */
  lastModified: number;
}

export interface Entry { name: string; kind: EntryKind }

export type StorageErrorCode = 'not-found' | 'exists' | 'permission' | 'read-only' | 'io';

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly path: string;
  constructor(code: StorageErrorCode, path: string, message?: string) {
    super(message || code + ': ' + path);
    this.code = code;
    this.path = path;
    this.name = 'StorageError';
  }
}

export interface StorageBackend {
  /** Human-readable name of what is open (the folder name). */
  readonly label: string;
  stat(path: string): Promise<Stat | null>;
  /** Entries of a directory; throws not-found if it doesn't exist. */
  list(path: string): Promise<Entry[]>;
  readBytes(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string>;
  /** A Blob/File for on-demand reads (avoids copying large files into memory twice). */
  readBlob(path: string): Promise<Blob>;
  /**
   * Writes the bytes exactly as given (a File/Blob is written directly, never
   * through a string). Parent directories are created. Replaces an existing file
   * atomically where the platform allows (File System Access commits on close()).
   */
  writeBytes(path: string, data: Blob | Uint8Array): Promise<void>;
  writeText(path: string, text: string): Promise<void>;
  /** Recursive; no-op if it exists. */
  mkdir(path: string): Promise<void>;
  /**
   * Moves a file or a directory tree. Fails with 'exists' if the destination
   * exists. Parent directories of the destination are created.
   */
  move(from: string, to: string): Promise<void>;
  /** No-op if missing. Directories need { recursive: true } unless empty. */
  remove(path: string, opts?: { recursive?: boolean }): Promise<void>;
}
