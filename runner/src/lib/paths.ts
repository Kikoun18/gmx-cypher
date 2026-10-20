// Paths as the page shows them: within the allowed folder they are in, the full path a copy away.

/** A path as `root-name/rest`, relative to the allowed folder it is in; any other path as it is. */
export const shortPath = (p: string, roots: string[]) => { const r = roots.find(x => p === x || p.startsWith(x + '/')); return r ? r.split('/').pop() + p.slice(r.length) : p }
