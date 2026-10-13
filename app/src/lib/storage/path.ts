// Every user string → vault path conversion lives here (spec §10). Other
// modules join only segments produced by this module, or fixed names.

export const MATRIX = '.matrix';
export const NOTE_FILE = 'note.md';
export const SEQUENCES_DIR = '_sequences';
export const IMPORTS_DIR = '_imports';
export const RESTORED_DIR = '_restored';
/** Uploaded Python scripts (batch 3, R3b), kept byte for byte. */
export const SCRIPTS_DIR = '_scripts';
export const SLUG_MAX = 20;
export const FILE_NAME_MAX = 64;

// Control characters are exactly what this strips.
// oxlint-disable-next-line no-control-regex
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const RESERVED = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(\..*)?$/i;

/** Directory names with this suffix are found by ID, never by slug. */
const ID_DIR = /^(.*)--([A-Za-z0-9_-]+)$/;

export function nfc(s: string): string { return String(s ?? '').normalize('NFC'); }

/** Comparison key for collisions: NFC + case-insensitive (Windows, macOS default). */
export function nameKey(s: string): string { return nfc(s).toLowerCase(); }

const codepoints = (s: string) => Array.from(s);

/**
 * Readable slug: NFC, lower-case, Unicode letters and digits kept, everything
 * else collapsed to '-', trimmed, reserved names prefixed, never empty,
 * at most SLUG_MAX code points.
 */
export function slugify(name: string, max = SLUG_MAX): string {
  let s = nfc(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  s = codepoints(s).slice(0, max).join('').replace(/-+$/g, '');
  if (!s) s = 'untitled';
  if (RESERVED.test(s)) s = '_' + s;
  return s;
}

export function isSafeId(id: string): boolean { return /^[A-Za-z0-9_-]{1,64}$/.test(id); }

function assertId(id: string): string {
  if (!isSafeId(id)) throw new Error('unsafe id for a path: ' + JSON.stringify(id));
  return id;
}

/** `human-readable-slug--stable-id`. */
export function idDirName(name: string, id: string): string { return slugify(name) + '--' + assertId(id); }

/** The ID of a `slug--id` directory name, or null. */
export function idOfDirName(name: string): string | null {
  const m = ID_DIR.exec(name);
  return m ? m[2] : null;
}

/** File-name safe form of an uploaded file's original name (§10 rules, extension kept). */
export function safeFileName(original: string, max = FILE_NAME_MAX): string {
  let n = nfc(original).replace(ILLEGAL, '_').replace(/^[\s.]+/, '').replace(/[\s.]+$/, '');
  if (!n) n = 'file';
  const dot = n.lastIndexOf('.');
  let stem = dot > 0 ? n.slice(0, dot) : n, ext = dot > 0 ? n.slice(dot) : '';
  if (codepoints(ext).length > 16) { stem = n; ext = ''; }
  const room = Math.max(1, max - codepoints(ext).length);
  stem = codepoints(stem).slice(0, room).join('').replace(/[\s.]+$/, '') || 'file';
  if (RESERVED.test(stem)) stem = '_' + stem;
  n = stem + ext;
  // Names the app owns inside entity folders are never given to an upload.
  if (nameKey(n) === NOTE_FILE || /\.crswap$/i.test(n)) n = stem + ' (upload)' + ext;
  return n;
}

/** `stem (2).ext`, `stem (3).ext`… until the name is free (case-insensitively). */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const used = new Set<string>();
  for (const t of taken) used.add(nameKey(t));
  used.add(NOTE_FILE);
  if (!used.has(nameKey(name))) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; ; i++) {
    const c = stem + ' (' + i + ')' + ext;
    if (!used.has(nameKey(c))) return c;
  }
}

/** Filesystem-safe UTC timestamp: 20261003T024300Z. */
export function stamp(d: Date = new Date()): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/** `note.md` → `note.conflict-20261003T024300Z.md`. */
export function conflictName(name: string, d: Date = new Date()): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) + '.conflict-' + stamp(d) + name.slice(dot) : name + '.conflict-' + stamp(d);
}
export const isConflictCopy = (name: string) => /\.conflict-\d{8}T\d{6}Z(\.[^.]*)?$/.test(name);
/** Chromium's in-progress write files; never user data. */
export const isSwapFile = (name: string) => /\.crswap$/i.test(name);
/** OS clutter that doesn't make a folder "non-empty", including macOS's `__MACOSX/` and `._*` resource forks. */
export const isOsClutter = (name: string) => ['.ds_store', 'thumbs.db', 'desktop.ini', '.git', '__macosx'].includes(name.toLowerCase()) || name.startsWith('._');

// --- joining ---------------------------------------------------------------

export function join(...parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => !!p).join('/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}
export function dirname(p: string): string { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }
export function basename(p: string): string { const i = p.lastIndexOf('/'); return i < 0 ? p : p.slice(i + 1); }
/** p with prefix `from` replaced by `to` (whole segments only). */
export function rebase(p: string, from: string, to: string): string {
  if (p === from) return to;
  return p.startsWith(from + '/') ? to + p.slice(from.length) : p;
}
export const isInside = (p: string, dir: string) => p === dir || p.startsWith(dir + '/');

// --- vault layout ------------------------------------------------------------

export const vaultPaths = {
  manifest: join(MATRIX, 'manifest.json'),
  gitignore: join(MATRIX, '.gitignore'),
  records: join(MATRIX, 'records'),
  workspace: join(MATRIX, 'records', 'workspace.json'),
  settings: join(MATRIX, 'settings'),
  trash: join(MATRIX, 'trash'),
  journal: join(MATRIX, 'journal'),
  cache: join(MATRIX, 'cache'),
  index: join(MATRIX, 'cache', 'index.json'),
};

export const recordPaths = {
  projectDir: (pid: string) => join(vaultPaths.records, assertId(pid)),
  project: (pid: string) => join(vaultPaths.records, assertId(pid), 'project.json'),
  column: (pid: string, k: string) => join(vaultPaths.records, assertId(pid), 'columns', assertId(k) + '.json'),
  page: (pid: string, id: string) => join(vaultPaths.records, assertId(pid), 'pages', assertId(id) + '.json'),
  row: (pid: string, id: string) => join(vaultPaths.records, assertId(pid), 'rows', assertId(id) + '.json'),
  columns: (pid: string) => join(vaultPaths.records, assertId(pid), 'columns'),
  pages: (pid: string) => join(vaultPaths.records, assertId(pid), 'pages'),
  rows: (pid: string) => join(vaultPaths.records, assertId(pid), 'rows'),
};

export const settingsPaths = {
  dir: (pid: string) => join(vaultPaths.settings, assertId(pid)),
  settings: (pid: string) => join(vaultPaths.settings, assertId(pid), 'settings.json'),
  analyses: (pid: string) => join(vaultPaths.settings, assertId(pid), 'analyses.json'),
  tags: (pid: string) => join(vaultPaths.settings, assertId(pid), 'tags.json'),
  metrics: (pid: string) => join(vaultPaths.settings, assertId(pid), 'metrics.json'),
  ignored: (pid: string) => join(vaultPaths.settings, assertId(pid), 'ignored.json'),
};

export const visiblePaths = {
  project: (name: string, pid: string) => idDirName(name, pid),
  sequences: (projDir: string) => join(projDir, SEQUENCES_DIR),
  row: (projDir: string, name: string, rowId: string) => join(projDir, SEQUENCES_DIR, idDirName(name, rowId)),
  column: (projDir: string, label: string, k: string) => join(projDir, idDirName(label, k)),
  cell: (colDir: string, rowName: string, rowId: string) => join(colDir, idDirName(rowName, rowId)),
  /** e.g. `rdf-run-1--x123`; the type key (not its editable label) keeps names stable. */
  analysis: (cellDir: string, typeKey: string, runNumber: number, id: string) => join(cellDir, idDirName(typeKey + '-run-' + runNumber, id)),
  imports: (projDir: string) => join(projDir, IMPORTS_DIR),
  scripts: (projDir: string) => join(projDir, SCRIPTS_DIR),
  restored: (projDir: string) => join(projDir, RESTORED_DIR),
  note: (dir: string) => join(dir, NOTE_FILE),
};
