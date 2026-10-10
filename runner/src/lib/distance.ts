// `gmx distance` (R7): what is measured between the reference and each selection, written as selection text from the
// groups by number (T17); its outputs; and the averages it prints. Each behaviour checked with GROMACS 2025.4 on nvt.
import { valueProblems } from './form';
import type { HelpOption } from './gmxText';
import { isDefault, type Options } from './rdf';

export type Measure = 'com' | 'cog' | 'pairs';
const MEASURES: Measure[] = ['com', 'cog', 'pairs'];

/**
 * One selection per group after the reference: the distance between their centres of mass (com) or of geometry (cog),
 * or between atom k of the reference and atom k of the selection (pairs, gmx's infix `merge`: "merge A B" is refused).
 */
export function distanceSelections(measure: Measure, selections: number): string[] {
  return Array.from({ length: selections }, (_, i) => {
    const g = 'group ' + (i + 1);
    return measure === 'pairs' ? 'group 0 merge ' + g : measure + ' of group 0 plus ' + measure + ' of ' + g;
  });
}

/** Pairs need as many atoms in each selection as in the reference: gmx 2025.4 pairs 6 against 2 without a word. */
export function distancePairProblems(options: Options, counts: number[], names: string[]): string[] {
  if (options.measure !== 'pairs') return [];
  return counts.slice(1).flatMap((n, i) => (n === counts[0] ? [] : ['pairs need as many atoms in ' + names[i + 1] + ' as in ' + names[0] + ': ' + n + ' and ' + counts[0]]));
}

/**
 * The options offered for gmx distance, in the form's order. `measure` is gmx-cypher's own (it writes the selection
 * text); `all`, `xyz` and `hist` switch gmx's -oall, -oxyz and -oh on, and gmx-cypher names those files.
 */
export const DISTANCE_FORM: { flag: string; group: string; label: string; unit?: string; what: string; switch?: string; own?: { values: string[]; default: string } }[] = [
  { flag: 'measure', group: 'what is measured', label: 'between', what: 'com: the centres of mass · cog: the centres of geometry · pairs: atom k of the reference with atom k of each selection (equal sizes)', own: { values: MEASURES, default: 'com' } },
  { flag: 'b', group: 'frames', label: 'first', unit: 'ps', what: 'frames before this time are skipped' },
  { flag: 'e', group: 'frames', label: 'last', unit: 'ps', what: '0 = to the end of the trajectory' },
  { flag: 'dt', group: 'frames', label: 'every', unit: 'ps', what: 'one frame per this many ps; 0 = every frame' },
  { flag: 'pbc', group: 'periodic boundaries', label: 'periodic boundaries', what: 'distances across the box edges' },
  { flag: 'rmpbc', group: 'periodic boundaries', label: 'make molecules whole', what: 'from the run input, in every frame' },
  { flag: 'all', group: 'output', label: 'every distance too', what: 'a second file: each pair or centre distance over time, not only their average', switch: 'oall' },
  { flag: 'xyz', group: 'output', label: 'x, y and z too', what: 'a file with the components of each distance', switch: 'oxyz' },
  { flag: 'hist', group: 'output', label: 'the histogram too', what: 'a distribution of the distances; PMF Sequences would read it as an umbrella histogram, so it is not sent', switch: 'oh' },
  { flag: 'len', group: 'output', label: 'histogram mean', unit: 'nm', what: 'the histogram spans 0 to twice this' },
  { flag: 'binw', group: 'output', label: 'histogram bin', unit: 'nm', what: 'the width of each bin' },
];
const BY = new Map(DISTANCE_FORM.map(f => [f.flag, f]));
/** Set whatever the form says: PMF Sequences reads ps and the xmgrace @ lines (as T22 for rdf). */
const FIXED: Record<string, string> = { tu: 'ps', xvg: 'xmgrace' };

/** What gmx distance would refuse among the options, in words. */
export function distanceOptionProblems(options: Options, help: HelpOption[]): string[] {
  const p: string[] = [], by = new Map(help.map(o => [o.flag, o]));
  for (const f of ['b', 'e', 'dt', 'len', 'binw']) {
    const v = options[f];
    if (v === undefined || v === '') continue;
    const n = Number(v);
    if (typeof v !== 'string' || !v.trim() || !Number.isFinite(n)) p.push('-' + f + ': not a number: ' + v);
    else if ((f === 'len' || f === 'binw') && n <= 0) p.push('-' + f + ' must be above 0');
    else if (f === 'dt' && n < 0) p.push('-dt must be 0 or more');
  }
  if (options.measure !== undefined && !MEASURES.includes(options.measure as Measure)) p.push('measure: one of ' + MEASURES.join(', '));
  p.push(...valueProblems(options, DISTANCE_FORM, help));
  const b = Number(options.b ?? by.get('b')?.default ?? 0), e = Number(options.e || 0);
  if (!p.length && e > 0 && e <= b) p.push('-e must be after -b');
  return p;
}

export type DistanceIo = { trajectory: string; runInput: string; index: string; output: string; all: string; xyz: string; hist: string };

/** gmx distance's argument list: the files, the outputs switched on, the options that differ, then the selections. */
export function distanceArgv(r: { options: Options; selections: number }, io: DistanceIo, help: HelpOption[]): string[] {
  const has = new Set(help.map(o => o.flag));
  for (const k of Object.keys(r.options)) {
    const f = BY.get(k);
    if (!f) throw new Error('-' + k + ' is not an option gmx-cypher sets for distance');
    if (!f.own && !has.has(f.switch ?? k)) throw new Error('this gmx distance has no -' + (f.switch ?? k));
  }
  const args = ['distance', '-f', io.trajectory, '-s', io.runInput, '-n', io.index, '-oav', io.output];
  if (r.options.all === true) args.push('-oall', io.all);
  if (r.options.xyz === true) args.push('-oxyz', io.xyz);
  if (r.options.hist === true) args.push('-oh', io.hist);
  for (const o of help) {
    const f = BY.get(o.flag);
    const v = FIXED[o.flag] ?? (f && !f.switch && !f.own ? r.options[o.flag] : undefined);
    if (isDefault(o, v)) continue;
    args.push(...(o.type === 'bool' ? [(v ? '-' : '-no') + o.flag] : ['-' + o.flag, String(v)]));
  }
  return [...args, '-select', ...distanceSelections((r.options.measure as Measure) || 'com', r.selections)];
}

/** A run's files: the averages (for the vault, question 32), its index and record, and the outputs switched on. */
export function distanceNames(stem: string, options: Options) {
  return {
    xvg: stem + '.xvg', ndx: stem + '.ndx', record: stem + '.run.json',
    more: [...(options.all === true ? [stem + '_all.xvg'] : []), ...(options.xyz === true ? [stem + '_xyz.xvg'] : []), ...(options.hist === true ? [stem + '_hist.xvg'] : [])],
  }
}
export const DISTANCE_SUFFIXES = ['_all.xvg', '_xyz.xvg', '_hist.xvg'];

export interface DistanceStat { selection: string; samples: number; average: number; sd: number };

/** What gmx distance prints per selection: "Number of samples", "Average distance" and "Standard deviation" (nm). */
export function parseDistanceStats(text: string): DistanceStat[] {
  const out: DistanceStat[] = [];
  for (const m of text.matchAll(/^(\S.*):\n\s+Number of samples:\s+(\d+)\n\s+Average distance:\s+(\S+)\s+nm\n\s+Standard deviation:\s+(\S+)\s+nm/gm))
    out.push({ selection: m[1], samples: Number(m[2]), average: Number(m[3]), sd: Number(m[4]) });
  return out;
}
