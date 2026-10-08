// Remembered vault folders: the directory handles, so a vault can be reopened
// without picking it again. This is session convenience only — the vault itself
// is the folder (decision D39). Database `pmf-vault-handles`, store `vaults`.

const DB = 'pmf-vault-handles', OS = 'vaults';

export interface VaultHandle {
  vaultId: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  lastOpened: string;
  lastProjectId: string | null;
}

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(OS)) r.result.createObjectStore(OS, { keyPath: 'vaultId' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(OS, mode), req = f(t.objectStore(OS));
    t.oncomplete = () => { db.close(); res(req.result); };
    t.onerror = t.onabort = () => { db.close(); rej(t.error); };
  });
}

/** Most recently opened first. Empty if IndexedDB is unavailable. */
export async function listVaultHandles(): Promise<VaultHandle[]> {
  try {
    const all = await tx<VaultHandle[]>('readonly', s => s.getAll() as IDBRequest<VaultHandle[]>);
    return all.sort((a, b) => b.lastOpened.localeCompare(a.lastOpened));
  } catch { return []; }
}

export async function rememberVault(v: Omit<VaultHandle, 'lastOpened' | 'lastProjectId'> & { lastProjectId?: string | null }) {
  try {
    const prev = await tx<VaultHandle | undefined>('readonly', s => s.get(v.vaultId) as IDBRequest<VaultHandle | undefined>);
    await tx('readwrite', s => s.put({ lastProjectId: prev?.lastProjectId ?? null, ...v, lastOpened: new Date().toISOString() }));
  } catch { /* not remembered: the folder can still be picked again */ }
}

export async function setLastProject(vaultId: string, lastProjectId: string) {
  try {
    const prev = await tx<VaultHandle | undefined>('readonly', s => s.get(vaultId) as IDBRequest<VaultHandle | undefined>);
    if (prev) await tx('readwrite', s => s.put({ ...prev, lastProjectId }));
  } catch { /* ignore */ }
}

export async function forgetVault(vaultId: string) {
  try { await tx('readwrite', s => s.delete(vaultId)); } catch { /* ignore */ }
}
