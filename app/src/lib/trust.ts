// Trust in uploaded scripts (batch 3, R3b, F96). It is kept in this browser, never in the vault: a vault can't vouch
// for its own scripts. Keyed by (vault folder, script record, SHA-256), so a changed byte, a copied vault (another
// folder, compared with isSameEntry) or an import (always a new record) asks again.

export interface TrustKey { sha256: string; scriptId: string; vaultId: string; folder: object }
export interface TrustStore { has(k: TrustKey): Promise<boolean>; add(k: TrustKey): Promise<void> }

const keyOf = (k: TrustKey) => k.vaultId + '|' + k.scriptId + '|' + k.sha256;

/** Trust for this tab only, folders compared by identity: the JSON viewer (no folder) and tests. */
export function memoryTrust(): TrustStore {
  const all: { key: string; folder: object }[] = [];
  return {
    has: async k => all.some(t => t.key === keyOf(k) && t.folder === k.folder),
    add: async k => { all.push({ key: keyOf(k), folder: k.folder }); },
  };
}

const DB = 'pmf-script-trust', OS = 'trust';
interface Stored { key: string; folder: FileSystemDirectoryHandle; at: string }

async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(OS, { autoIncrement: true }).createIndex('key', 'key');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return new Promise((res, rej) => {
    const t = db.transaction(OS, mode), req = f(t.objectStore(OS));
    t.oncomplete = () => { db.close(); res(req.result); };
    t.onerror = t.onabort = () => { db.close(); rej(t.error); };
  });
}

/** Trust kept in this browser's IndexedDB, next to (not inside) the remembered vault folders. */
export function browserTrust(): TrustStore {
  return {
    async has(k) {
      try {
        const rows = await tx<Stored[]>('readonly', s => s.index('key').getAll(keyOf(k)));
        for (const r of rows) if (await r.folder.isSameEntry(k.folder as FileSystemDirectoryHandle).catch(() => false)) return true;
      } catch { /* unavailable: nothing is trusted */ }
      return false;
    },
    async add(k) {
      await tx('readwrite', s => s.add({ key: keyOf(k), folder: k.folder as FileSystemDirectoryHandle, at: new Date().toISOString() }));
    },
  };
}

let session: TrustStore | null = null;
/** Where trust for a vault is kept: this browser's store for a vault folder; this tab's for anything else. */
export function trustFor(backend: object): { trust: TrustStore; folder: object } {
  const root = (backend as { root?: FileSystemDirectoryHandle }).root;
  if (root && typeof indexedDB !== 'undefined') return { trust: browserTrust(), folder: root };
  return { trust: (session ??= memoryTrust()), folder: backend };
}
