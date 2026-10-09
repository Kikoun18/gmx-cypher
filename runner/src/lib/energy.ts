// `gmx energy` (R4, T100): its term menu, the answers it is given on stdin, and the statistics table it prints.
// Every reader is pure and tested on real output from GROMACS 2025.4 and 2023.3 (test/fixtures/).
import type { HelpOption } from './gmxText';
import { isDefault, type Options } from './rdf';

export interface EnergyTerm { number: number; name: string }

/**
 * The menu of terms, as gmx energy prints it on an empty stdin: a block of "  1  Bond   2  Angle …" lines after
 * the dashed rule. GROMACS prints it on stderr, so the caller passes both streams.
 */
export function parseEnergyMenu(text: string): EnergyTerm[] {
  const lines = text.split('\n');
  const start = lines.findIndex(l => /selecting either/.test(l));
  if (start < 0) return [];
  const rule = lines.findIndex((l, i) => i > start && /^-{5,}\s*$/.test(l));
  if (rule < 0) return [];
  const terms: EnergyTerm[] = [];
  for (let i = rule + 1; i < lines.length && lines[i].trim(); i++) {
    for (const m of lines[i].matchAll(/(\d+)\s+(\S(?:.*?\S)?)\s*(?=\s{2,}\d+\s|$)/g)) terms.push({ number: Number(m[1]), name: m[2] });
  }
  return terms;
}

/** What gmx energy would refuse, in words, for the picked terms (numbers from this file's menu). */
export function energyProblems(numbers: number[], menu: EnergyTerm[]): string[] {
  const p: string[] = [], known = new Set(menu.map(t => t.number));
  if (!numbers.length) p.push('pick at least one term');
  for (const n of numbers) if (!known.has(n)) p.push(n + ' is not a term of this file');
  for (const n of new Set(numbers.filter((n, i) => numbers.indexOf(n) !== i))) p.push('term ' + n + ' is picked twice');
  return p;
}

/** The answers gmx energy reads: the numbers on one line, then 0, which ends the selection (T99). */
export function energyStdin(numbers: number[]): string {
  return numbers.join(' ') + '\n0\n';
}

export interface EnergyRow { name: string; average: number; errEst: number; rmsd: number; drift: number; unit: string }
export interface EnergyStats { steps: number; t0: number; t1: number; dataSets: number; frames: number; rows: EnergyRow[] }

const HEAD = /Statistics over (\d+) steps \[\s*(-?[\d.]+) through\s+(-?[\d.]+) ps \], (\d+) data sets/;
const FRAMES = /All statistics are over (\d+) points/;
const NUM = '(-?[\\d.eE+-]+|nan)';
const ROW = new RegExp('^(\\S.*?)\\s{2,}' + NUM + '\\s+' + NUM + '\\s+' + NUM + '\\s+' + NUM + '\\s+\\(([^)]*)\\)\\s*$');

/** The block gmx energy prints after the run: its span, its frames and each term's average, error estimate, RMSD and drift. */
export function parseEnergyStats(text: string): EnergyStats | null {
  const head = HEAD.exec(text);
  if (!head) return null;
  const frames = FRAMES.exec(text);
  const rows: EnergyRow[] = [];
  for (const line of text.slice(head.index + head[0].length).split('\n')) {
    const m = ROW.exec(line.trim());
    if (m) rows.push({ name: m[1], average: Number(m[2]), errEst: Number(m[3]), rmsd: Number(m[4]), drift: Number(m[5]), unit: m[6] });
  }
  return {
    steps: Number(head[1]), t0: Number(head[2]), t1: Number(head[3]), dataSets: Number(head[4]),
    frames: frames ? Number(frames[1]) : 0, rows,
  };
}

/** A drift larger than the term's error estimate, either way: the average is not steady to within its error (R4). */
export const driftLarger = (r: Pick<EnergyRow, 'drift' | 'errEst'>) => Math.abs(r.drift) > r.errEst;

/** The options gmx-cypher offers for gmx energy: the curated few first, as the picker shows them (R4). */
export const ENERGY_FORM: { flag: string; group: string; label: string; unit?: string; what: string }[] = [
  { flag: 'b', group: 'frames', label: 'first', unit: 'ps', what: 'the equilibration: frames before this time are left out' },
  { flag: 'e', group: 'frames', label: 'last', unit: 'ps', what: '0 = to the end of the file' },
  { flag: 'sum', group: 'terms', label: 'sum the terms', what: 'one curve for the sum of the picked terms, instead of one each' },
  { flag: 'fluct_props', group: 'fluctuations', label: 'fluctuation properties', what: 'heat capacity, compressibility and the like, from the terms (the right terms are needed)' },
  { flag: 'driftcorr', group: 'fluctuations', label: 'correct the drift', what: 'with fluctuation properties only: the drift is subtracted first' },
];
const FORM_FLAGS = new Set(ENERGY_FORM.map(f => f.flag));

/** What gmx energy would refuse among the options, in words (checked with 2025.4 and 2023.3). */
export function energyOptionProblems(options: Options, help: HelpOption[]): string[] {
  const p: string[] = [], by = new Map(help.map(o => [o.flag, o]));
  for (const f of ['b', 'e'] as const) {
    const v = options[f];
    if (v === undefined || v === '') continue;
    if (typeof v !== 'string' || !v.trim() || !Number.isFinite(Number(v))) p.push('-' + f + ': not a number: ' + v);
    else if (Number(v) < 0) p.push('-' + f + ' must be 0 or more');
  }
  const b = Number(options.b || by.get('b')?.default || 0), e = Number(options.e || 0);
  if (!p.length && e > 0 && e <= b) p.push('-e must be after -b');
  return p;
}

/** gmx energy's argument list: the file, its output, then only the options that differ from the installed defaults (T23). */
export function energyArgv(r: { options: Options }, io: { edr: string; output: string }, help: HelpOption[]): string[] {
  const has = new Set(help.map(o => o.flag));
  for (const k of Object.keys(r.options)) {
    if (!FORM_FLAGS.has(k)) throw new Error('-' + k + ' is not an option gmx-cypher sets for energy');
    if (!has.has(k)) throw new Error('this gmx energy has no -' + k);
  }
  const args = ['energy', '-f', io.edr, '-o', io.output];
  for (const o of help) {
    if (!FORM_FLAGS.has(o.flag)) continue;
    const v = r.options[o.flag];
    if (isDefault(o, v)) continue;
    args.push(...(o.type === 'bool' ? [(v ? '-' : '-no') + o.flag] : ['-' + o.flag, String(v)]));
  }
  return args;
}
