// Single writer per vault (decision D33): an exclusive Web Lock held for the
// whole session. A second tab gets null and opens the vault read-only.

import type { LockProvider } from './vault';

export const webLocks: LockProvider = {
  acquire: name => new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.locks) { resolve(() => {}); return; }
    navigator.locks.request(name, { ifAvailable: true }, lock => {
      if (!lock) { resolve(null); return; }
      // Hold the lock until release() resolves this promise.
      return new Promise<void>(release => resolve(() => release()));
    }).catch(() => resolve(() => {}));
  }),
};
