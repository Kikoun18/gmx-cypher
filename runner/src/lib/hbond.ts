// `gmx hbond` (R8): two tools under GROMACS's names. The selection tool (`gmx hbond` from 2024; -r and -t are
// selections) and the legacy one (`gmx hbond-legacy` from 2024, and `gmx hbond` before it: 2023.3 checked; groups
// asked on stdin). Each has its own criteria, never mixed (question 33). Every rule here was checked with 2025.4.
import type { HelpOption } from './gmxText';
import { isDefault, type Options } from './rdf';

type FormOption = { flag: string; group: string; label: string; unit?: string; what: string; switch?: string };

/** Which tool a `gmx <name> -h` describes: -t a selection (the selection tool), -r a distance (legacy), or neither. */
export function hbondKind(help: HelpOption[]): 'selection' | 'legacy' | null {
  const by = new Map(help.map(o => [o.flag, o]));
  if (by.get('t')?.type === 'selection' && by.get('r')?.type === 'selection') return 'selection';
  if (by.get('r')?.type === 'real' && by.has('num')) return 'legacy';
  return null;
}

/** The selection tool's options, in the form's order: its own criteria and their defaults, from its -h. */
export const HBOND_FORM: FormOption[] = [
  { flag: 'hbr', group: 'criteria', label: 'distance', unit: 'nm', what: 'donor to acceptor, at most; not above the search distance' },
  { flag: 'hba', group: 'criteria', label: 'angle', unit: '°', what: 'acceptor–donor–hydrogen, at most' },
  { flag: 'cutoff', group: 'criteria', label: 'search distance', unit: 'nm', what: 'the neighbour search; 0.35 nm or more' },
  { flag: 'de', group: 'criteria', label: 'donor elements', what: 'from the topology, e.g. N O' },
  { flag: 'ae', group: 'criteria', label: 'acceptor elements', what: 'from the topology, e.g. N O' },
  { flag: 'b', group: 'frames', label: 'first', unit: 'ps', what: 'frames before this time are skipped' },
  { flag: 'e', group: 'frames', label: 'last', unit: 'ps', what: '0 = to the end of the trajectory' },
  { flag: 'dt', group: 'frames', label: 'every', unit: 'ps', what: 'one frame per this many ps; 0 = every frame' },
  { flag: 'pbc', group: 'periodic boundaries', label: 'periodic boundaries', what: 'bonds across the box edges' },
  { flag: 'rmpbc', group: 'periodic boundaries', label: 'make molecules whole', what: 'from the run input, in every frame' },
  { flag: 'dist', group: 'output', label: 'distance distribution too', what: 'not sent to the vault: PMF Sequences would read it as an umbrella histogram', switch: 'dist' },
  { flag: 'ang', group: 'output', label: 'angle distribution too', what: 'not sent to the vault, likewise', switch: 'ang' },
  { flag: 'dan', group: 'output', label: 'donors and acceptors too', what: 'their number in each frame; not sent to the vault', switch: 'dan' },
];

/** The legacy tool's options: its own criteria (-r is the distance here) and their defaults. */
export const LEGACY_FORM: FormOption[] = [
  { flag: 'r', group: 'criteria', label: 'distance', unit: 'nm', what: 'donor to acceptor (or hydrogen to acceptor without the next option), at most' },
  { flag: 'a', group: 'criteria', label: 'angle', unit: '°', what: 'hydrogen–donor–acceptor, at most' },
  { flag: 'da', group: 'criteria', label: 'distance from the donor', what: 'off: from the hydrogen' },
  { flag: 'merge', group: 'criteria', label: 'merge bonds', what: 'H-bonds sharing donor and acceptor count once; off is needed for the angle distribution' },
  { flag: 'b', group: 'frames', label: 'first', unit: 'ps', what: 'frames before this time are skipped' },
  { flag: 'e', group: 'frames', label: 'last', unit: 'ps', what: '0 = to the end of the trajectory' },
  { flag: 'dt', group: 'frames', label: 'every', unit: 'ps', what: 'one frame per this many ps; 0 = every frame' },
  { flag: 'dist', group: 'output', label: 'distance distribution too', what: 'not sent to the vault: PMF Sequences would read it as H-bonds', switch: 'dist' },
  { flag: 'ang', group: 'output', label: 'angle distribution too', what: 'not sent to the vault; needs merging off', switch: 'ang' },
];

/** Set whatever the form says: PMF Sequences reads ps and the xmgrace @ lines (as T22 for rdf). */
const FIXED: Record<string, string> = { tu: 'ps', xvg: 'xmgrace' };
const NUMBERS = ['b', 'e', 'dt', 'cutoff', 'hbr', 'hba', 'r', 'a'];

function numberProblems(options: Options, by: Map<string, HelpOption>): string[] {
  const p: string[] = [];
  for (const f of NUMBERS) {
    const v = options[f];
    if (v === undefined || v === '') continue;
    const n = Number(v);
    if (typeof v !== 'string' || !v.trim() || !Number.isFinite(n)) p.push('-' + f + ': not a number: ' + v);
    else if (['hba', 'r', 'a', 'hbr'].includes(f) && n <= 0) p.push('-' + f + ' must be above 0');
    else if (f === 'dt' && n < 0) p.push('-dt must be 0 or more');
  }
  const b = Number(options.b ?? by.get('b')?.default ?? 0), e = Number(options.e || 0);
  if (!p.length && e > 0 && e <= b) p.push('-e must be after -b');
  return p;
}

/** What the selection tool would refuse, in words (2025.4 refuses -cutoff below 0.35 and -hbr above -cutoff). */
export function hbondOptionProblems(options: Options, help: HelpOption[]): string[] {
  const by = new Map(help.map(o => [o.flag, o])), p = numberProblems(options, by);
  const value = (f: string) => Number(options[f] === undefined || options[f] === '' ? by.get(f)?.default : options[f]);
  if (!p.length && value('cutoff') < 0.35) p.push('-cutoff must be 0.35 nm or more');
  else if (!p.length && value('hbr') > value('cutoff')) p.push('-hbr must not exceed -cutoff (' + value('cutoff') + ' nm)');
  for (const f of ['de', 'ae']) {
    const v = options[f];
    if (typeof v === 'string' && v.trim() && !/^\s*([A-Z][a-z]?\s*)+$/.test(v)) p.push('-' + f + ': element symbols, e.g. N O');
  }
  return p;
}

/** What the legacy tool would refuse: with merging on (its default) it can't write the angle distribution. */
export function legacyOptionProblems(options: Options, help: HelpOption[]): string[] {
  const p = numberProblems(options, new Map(help.map(o => [o.flag, o])));
  if (options.ang === true && options.merge !== false) p.push("the angle distribution can't be written while H-bonds are merged: switch merging off (-nomerge)");
  return p;
}

const oneTarget = (tool: string, counts: number[]) => (counts.length === 2 ? [] : ['gmx ' + tool + ' takes one target group after the reference, not ' + (counts.length - 1)]);

/** One target; and for the selection tool, the reference and the target are the same atoms or share none (its -h). */
export function hbondGroupProblems(_o: Options, counts: number[], names: string[], sets?: number[][]): string[] {
  const one = oneTarget('hbond', counts);
  if (one.length || !sets) return one;
  const ref = new Set(sets[0]), shared = sets[1].filter(n => ref.has(n)).length;
  const same = shared === sets[0].length && shared === sets[1].length;
  return shared && !same ? [names[0] + ' and ' + names[1] + ' share ' + shared + ' atom' + (shared > 1 ? 's' : '') + ': gmx hbond needs the same atoms or none in common'] : [];
}
export const legacyGroupProblems = (_o: Options, counts: number[], _names: string[]) => oneTarget('hbond-legacy', counts);

function check(tool: string, form: FormOption[], options: Options, help: HelpOption[]) {
  const has = new Set(help.map(o => o.flag)), by = new Map(form.map(f => [f.flag, f]));
  for (const k of Object.keys(options)) {
    const f = by.get(k);
    if (!f) throw new Error('-' + k + ' is not an option gmx-cypher sets for ' + tool);
    if (!has.has(f.switch ?? k)) throw new Error('this gmx ' + tool + ' has no -' + (f.switch ?? k));
  }
  return by;
}

/** The options that differ from the installed defaults, in -h order; element lists as one token each (as typed in a shell). */
function optionArgs(form: Map<string, FormOption>, options: Options, help: HelpOption[]): string[] {
  const args: string[] = [];
  for (const o of help) {
    const f = form.get(o.flag);
    const v = FIXED[o.flag] ?? (f && !f.switch ? options[o.flag] : undefined);
    if (isDefault(o, v)) continue;
    if (o.flag === 'de' || o.flag === 'ae') args.push('-' + o.flag, ...String(v).trim().split(/\s+/));
    else args.push(...(o.type === 'bool' ? [(v ? '-' : '-no') + o.flag] : ['-' + o.flag, String(v)]));
  }
  return args;
}

export type HbondIo = { trajectory: string; runInput: string; index: string; output: string; hbonds: string; dist: string; ang: string; dan: string };

/** The selection tool: its index of the bonds always (-o, named by gmx-cypher), the count, then -r and -t by number. */
export function hbondArgv(r: { options: Options; selections: number }, io: HbondIo, help: HelpOption[]): string[] {
  const form = check('hbond', HBOND_FORM, r.options, help);
  const args = ['hbond', '-f', io.trajectory, '-s', io.runInput, '-n', io.index, '-o', io.hbonds, '-num', io.output];
  for (const s of ['dist', 'ang', 'dan'] as const) if (r.options[s] === true) args.push('-' + s, io[s]);
  return [...args, ...optionArgs(form, r.options, help), '-r', 'group 0', '-t', 'group 1'];
}

export type LegacyIo = Omit<HbondIo, 'hbonds' | 'dan'>;

/** The legacy tool: the count, and the groups as answers on stdin (legacyStdin). gmx-cypher sets argv[0] to the tool found. */
export function legacyArgv(r: { options: Options; selections: number }, io: LegacyIo, help: HelpOption[]): string[] {
  const form = check('hbond-legacy', LEGACY_FORM, r.options, help);
  const args = ['hbond-legacy', '-f', io.trajectory, '-s', io.runInput, '-n', io.index, '-num', io.output];
  for (const s of ['dist', 'ang'] as const) if (r.options[s] === true) args.push('-' + s, io[s]);
  return [...args, ...optionArgs(form, r.options, help)];
}

/** The legacy tool's two prompts ("Select a group:"): the reference, then the target, by their number in the index. */
export const legacyStdin = () => '0\n1\n';

export function hbondNames(stem: string, options: Options) {
  return {
    xvg: stem + '.xvg', ndx: stem + '.ndx', record: stem + '.run.json',
    more: [stem + '_hbonds.ndx', ...(['dist', 'ang', 'dan'] as const).filter(s => options[s] === true).map(s => stem + '_' + s + '.xvg')],
  };
}
export function legacyNames(stem: string, options: Options) {
  return { xvg: stem + '.xvg', ndx: stem + '.ndx', record: stem + '.run.json', more: (['dist', 'ang'] as const).filter(s => options[s] === true).map(s => stem + '_' + s + '.xvg') };
}
export const HBOND_SUFFIXES = ['_hbonds.ndx', '_dist.xvg', '_ang.xvg', '_dan.xvg'];

/** What each tool prints that a result should show: donors and acceptors, and the legacy tool's average. */
export const HBOND_SUMMARY = /^Selection '.*' has \d+ acceptors and \d+ donors\.$/;
export const LEGACY_SUMMARY = /^(Found \d+ donors and \d+ acceptors|Average number of hbonds per timeframe .*)$/;
export const summaryLines = (text: string, re: RegExp) => text.split('\n').map(l => l.trim()).filter(l => re.test(l));

/** The count over time in numbers: its mean per frame (the legacy tool prints the same), lowest and highest. */
export function countStats(points: [number, number][]) {
  if (!points.length) return null;
  const ys = points.map(p => p[1]);
  return { frames: ys.length, mean: ys.reduce((a, b) => a + b, 0) / ys.length, min: Math.min(...ys), max: Math.max(...ys) };
}
