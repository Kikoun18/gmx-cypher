// `gmx wham` (R6): the window lists it reads, built from a folder template; the overlap of neighbouring windows'
// histograms; its bootstrap result; and its argument list. Each behaviour was checked with GROMACS 2025.4 on a real
// umbrella set made for the fixtures (test/fixtures/wham/) and on your 21-window histogram fixture.
import type { HelpOption } from './gmxText';
import { isDefault, type Options } from './rdf';

const escape = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/** A path relative to the root against a template where `*` stands for any part of one folder or file name. */
export function matchesGlob(glob: string, rel: string): boolean {
  return new RegExp('^' + glob.split('/').map(seg => escape(seg).replace(/\*/g, '[^/]*')).join('/') + '$').test(rel);
}

/** win2 before win10: numbers inside names compared as numbers. */
export const naturalCompare = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });

/**
 * The pull file beside a window's run input: `<stem>_pullx.xvg` as mdrun -deffnm names it, else `pullx.xvg`, mdrun's
 * own default name; null when there is neither (likewise for pullf).
 */
export function pullFileOf(tpr: string, kind: 'pullx' | 'pullf', siblings: string[]): string | null {
  const own = tpr.replace(/\.tpr$/i, '') + '_' + kind + '.xvg';
  return siblings.includes(own) ? own : siblings.includes(kind + '.xvg') ? kind + '.xvg' : null;
}

/** A window list as gmx wham reads it: one path per line. */
export const listFile = (paths: string[]) => paths.map(p => p + '\n').join('');

export interface Histograms { x: number[]; windows: number[][] }

/** gmx wham's -hist file: x, then one count column per window, in the order of the lists. */
export function parseHistograms(xvg: string): Histograms {
  const rows = xvg.split('\n').filter(l => l.trim() && !'#@&'.includes(l.trim()[0])).map(l => l.trim().split(/\s+/).map(Number));
  const n = rows.length ? rows[0].length - 1 : 0;
  return { x: rows.map(r => r[0]), windows: Array.from({ length: n }, (_, j) => rows.map(r => r[j + 1] || 0)) };
}

export interface Overlap { a: number; b: number; overlap: number }

/**
 * Each window's peak, and the overlap of each pair of neighbours once sorted by peak: the sum, bin by bin, of the
 * smaller of their two normalised histograms (0 = no shared bin, 1 = the same histogram). Windows are numbered from 1
 * in the order of the lists, as the file's columns are; that order need not be the pull order (Phase 0 §4.1).
 */
export function neighbourOverlaps(h: Histograms): { order: number[]; peaks: number[]; pairs: Overlap[] } {
  const peaks = h.windows.map(c => h.x[c.reduce((best, v, i) => (v > c[best] ? i : best), 0)]);
  const order = h.windows.map((_, j) => j + 1).sort((a, b) => peaks[a - 1] - peaks[b - 1]);
  const norm = h.windows.map(c => { const sum = c.reduce((s, v) => s + v, 0) || 1; return c.map(v => v / sum); });
  const pairs = order.slice(1).map((b, k) => {
    const a = order[k], p = norm[a - 1], q = norm[b - 1];
    return { a, b, overlap: p.reduce((s, v, i) => s + Math.min(v, q[i]), 0) };
  });
  return { order, peaks, pairs };
}

/**
 * What the overlaps say in words. A gap (no shared bin) is named, because WHAM across it is not reliable; otherwise
 * the numbers stand without a verdict until a threshold is chosen (question 29): the lowest pair is named.
 */
export function overlapNotes(pairs: Overlap[]): string[] {
  const notes = pairs.filter(p => p.overlap === 0).map(p => 'windows ' + p.a + ' and ' + p.b + ' do not overlap at all: WHAM across a gap is not reliable');
  const low = pairs.reduce<Overlap | null>((m, p) => (!m || p.overlap < m.overlap ? p : m), null);
  return low ? [...notes, 'lowest overlap: windows ' + low.a + ' and ' + low.b + ', ' + low.overlap.toFixed(3)] : notes;
}

/** gmx wham's -bsres file (xydy): each point of the profile with its standard deviation over the bootstraps. */
export function parseBootstrap(xvg: string): [number, number, number][] {
  return xvg.split('\n').filter(l => l.trim() && !'#@&'.includes(l.trim()[0])).map(l => l.trim().split(/\s+/).map(Number))
    .filter(r => r.length >= 3 && r.slice(0, 3).every(Number.isFinite)).map(r => [r[0], r[1], r[2]]);
}

/** The run inputs' temperatures: gmx wham doesn't read them, so gmx-cypher does (with gmx dump). */
export { parseRefT } from './gmxText';

/**
 * The options offered for gmx wham. Not -unit: vault outputs are kJ (section 1.4), gmx's default. -b is shown as each
 * window's equilibration (2025.4's default is 50 ps, question 31); -temp comes from the run inputs unless set.
 */
export const WHAM_FORM: { flag: string; group: string; label: string; unit?: string; what: string }[] = [
  { flag: 'b', group: 'frames', label: 'first', unit: 'ps', what: 'each window\'s equilibration: its frames before this time are left out' },
  { flag: 'e', group: 'frames', label: 'last', unit: 'ps', what: 'frames after this time are left out' },
  { flag: 'temp', group: 'system', label: 'temperature', unit: 'K', what: 'gmx wham does not read it from the run inputs: gmx-cypher does, unless you set it' },
  { flag: 'nBootstrap', group: 'errors', label: 'bootstraps', what: 'profiles to estimate the error from, e.g. 200; 0 = no error estimate' },
  { flag: 'bs-method', group: 'errors', label: 'bootstrap method', what: 'b-hist: whole histograms, the default' },
  { flag: 'bins', group: 'profile', label: 'bins', what: 'points of the profile' },
  { flag: 'zprof0', group: 'profile', label: 'zero at', unit: 'nm', what: 'the profile is 0 at this position' },
  { flag: 'cycl', group: 'profile', label: 'periodic profile', what: 'for a cyclic coordinate, such as a dihedral' },
];
const FORM_FLAGS = new Set(WHAM_FORM.map(f => f.flag));
const NUMERIC = new Set(['b', 'e', 'temp', 'nBootstrap', 'bins', 'zprof0']);

/** What gmx wham would refuse among the options, in words. */
export function whamOptionProblems(options: Options, help: HelpOption[]): string[] {
  const p: string[] = [], by = new Map(help.map(o => [o.flag, o]));
  for (const f of NUMERIC) {
    const v = options[f];
    if (v === undefined || v === '') continue;
    const n = Number(v);
    if (typeof v !== 'string' || !v.trim() || !Number.isFinite(n)) { p.push('-' + f + ': not a number: ' + v); continue; }
    if ((f === 'nBootstrap' || f === 'bins') && !Number.isInteger(n)) p.push('-' + f + ': a whole number: ' + v);
    else if (f === 'temp' && n <= 0) p.push('-temp must be above 0 K');
    else if (f === 'bins' && n <= 0) p.push('-bins must be above 0');
    else if ((f === 'nBootstrap' || f === 'b') && n < 0) p.push('-' + f + ' must be 0 or more');
  }
  const method = options['bs-method'], values = by.get('bs-method')?.values;
  if (method !== undefined && method !== '' && values && !values.includes(String(method))) p.push('-bs-method: one of ' + values.join(', '));
  const b = Number(options.b ?? by.get('b')?.default ?? 0), e = options.e === undefined || options.e === '' ? Infinity : Number(options.e);
  if (!p.length && e <= b) p.push('-e must be after -b');
  return p;
}

/** Every file name a WHAM run can have, after its stem: for the check that none exists yet (T30). */
export const WHAM_SUFFIXES = ['_histo.xvg', '_profile.xvg', '_tpr-files.dat', '_pull-files.dat', '_bsres.xvg', '_bsprof.xvg'];

/** The files of a WHAM run: the histograms (for the vault, question 28), the profile, the lists, and the bootstrap's. */
export function whamOutputNames(stem: string, bootstrap: boolean) {
  return {
    xvg: stem + '_histo.xvg', record: stem + '.run.json',
    more: [stem + '_profile.xvg', stem + '_tpr-files.dat', stem + '_pull-files.dat', ...(bootstrap ? [stem + '_bsres.xvg', stem + '_bsprof.xvg'] : [])],
  };
}

/** The deepest folder that holds every one of these files. */
export function commonFolder(paths: string[]): string {
  const parts = paths.map(p => p.split('/').slice(0, -1));
  const first = parts[0] ?? [];
  let n = first.length;
  for (const q of parts) { let i = 0; while (i < n && i < q.length && q[i] === first[i]) i++; n = i; }
  return first.slice(0, n).join('/') || '/';
}

export type WhamIo = { tpr: string; pull: string; profile: string; hist: string; bsres: string; bsprof: string };

/** gmx wham's argument list: the lists, the profile and histograms (and the bootstrap's files), then the options that differ. */
export function whamArgv(r: { options: Options; pull: 'pullx' | 'pullf' }, io: WhamIo, help: HelpOption[]): string[] {
  const has = new Set(help.map(o => o.flag));
  for (const k of Object.keys(r.options)) {
    if (!FORM_FLAGS.has(k)) throw new Error('-' + k + ' is not an option gmx-cypher sets for wham');
    if (!has.has(k)) throw new Error('this gmx wham has no -' + k);
  }
  const args = ['wham', '-it', io.tpr, r.pull === 'pullf' ? '-if' : '-ix', io.pull, '-o', io.profile, '-hist', io.hist];
  if (Number(r.options.nBootstrap) > 0) args.push('-bsres', io.bsres, '-bsprof', io.bsprof);
  for (const o of help) {
    if (!FORM_FLAGS.has(o.flag)) continue;
    const v = r.options[o.flag];
    if (isDefault(o, v)) continue;
    args.push(...(o.type === 'bool' ? [(v ? '-' : '-no') + o.flag] : ['-' + o.flag, String(v)]));
  }
  return args;
}
