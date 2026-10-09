// The RDF recipe (R4a): the form's options, checked against the installed `gmx rdf -h`, and the argv that
// runs it. Only what differs from the installed defaults is passed (T23); groups go by number (T17).

import type { HelpOption } from './gmxText';

export type Options = Record<string, string | boolean>;
export interface Recipe { options: Options; selections: number }
/** Paths as gmx gets them, relative to its working directory (T29). */
export interface RdfIo { trajectory: string; runInput: string; index: string; output: string; cn: string }

/**
 * Section 10.1 plus -pbc and -rmpbc, which also change g(r) (T22): each with its label, unit, and what it
 * changes in one line. -cn is a switch here: gmx-cypher names the file. -selrpos is offered because gmx has
 * it, but with index groups it changes nothing (checked with 2025.4: identical data), and the line says so.
 */
export const FORM: { flag: string; group: string; label: string; unit?: string; what: string }[] = [
  { flag: 'b', group: 'frames', label: 'first', unit: 'ps', what: 'frames before this time are skipped' },
  { flag: 'e', group: 'frames', label: 'last', unit: 'ps', what: '0 = to the end of the trajectory' },
  { flag: 'dt', group: 'frames', label: 'every', unit: 'ps', what: 'one frame per this many ps; 0 = every frame' },
  { flag: 'bin', group: 'bins', label: 'bin width', unit: 'nm', what: 'smaller bins resolve peaks better and are noisier' },
  { flag: 'rmax', group: 'bins', label: 'largest r', unit: 'nm', what: '0 = half the box; shorter is faster' },
  { flag: 'norm', group: 'normalisation', label: 'normalise by', what: 'rdf: a normal g(r) · number_density: no density factor · none: pair counts per bin width' },
  { flag: 'seltype', group: 'positions and exclusions', label: 'positions', what: 'atom: every atom · res_com, mol_com…: one point per residue or molecule' },
  { flag: 'cut', group: 'positions and exclusions', label: 'shortest r', unit: 'nm', what: 'g(r) is cleared below this distance' },
  { flag: 'excl', group: 'positions and exclusions', label: 'use exclusions from the run input', what: 'leaves out bonded pairs; needs atom positions; normalisation is unchanged' },
  { flag: 'xy', group: 'positions and exclusions', label: 'x and y only', what: 'distances in the x–y plane' },
  { flag: 'pbc', group: 'periodic boundaries · surface', label: 'periodic boundaries', what: 'distances across the box edges' },
  { flag: 'rmpbc', group: 'periodic boundaries · surface', label: 'make molecules whole', what: 'from the run input, in every frame' },
  { flag: 'surf', group: 'periodic boundaries · surface', label: 'surface', what: 'r from the nearest reference atom of each molecule or residue; not normalised' },
  { flag: 'selrpos', group: 'periodic boundaries · surface', label: 'selection reference positions', what: 'used inside selection expressions; with index groups, as here, it changes nothing' },
  { flag: 'cn', group: 'output', label: 'cumulative number too', what: 'a second file: the average number of atoms within r' },
];

/** Set by gmx-cypher whatever the form says: PMF Sequences reads ps and the xmgrace @ lines (T22). */
const FIXED: Record<string, string> = { tu: 'ps', xvg: 'xmgrace' };
const NUMERIC = new Set(['time', 'real', 'int']);
const unset = (v: string | boolean | undefined) => v === undefined || v === '';
/** Whether a value is the installed default (numbers compared as numbers: 0.0020 is 0.002). */
export const isDefault = (o: HelpOption, v: string | boolean | undefined) =>
  unset(v) || (o.type === 'bool' ? v === o.default : NUMERIC.has(o.type) ? Number(v) === Number(o.default) : v === o.default);

export function rdfArgs(r: Recipe, io: RdfIo, help: HelpOption[]): string[] {
  const has = new Set(help.map(o => o.flag));
  for (const k of Object.keys(r.options)) {
    if (!FORM.some(f => f.flag === k)) throw new Error('-' + k + ' is not an option gmx-cypher sets');
    if (!has.has(k)) throw new Error('this gmx rdf has no -' + k);
  }
  const args = ['rdf', '-f', io.trajectory, '-s', io.runInput, '-n', io.index, '-o', io.output];
  if (r.options.cn === true) args.push('-cn', io.cn);
  for (const o of help) {
    const v = FIXED[o.flag] ?? (o.flag === 'cn' ? undefined : r.options[o.flag]);
    if (isDefault(o, v)) continue;
    args.push(...(o.type === 'bool' ? [(v ? '-' : '-no') + o.flag] : ['-' + o.flag, String(v)]));
  }
  return [...args, '-ref', 'group 0', '-sel', ...Array.from({ length: r.selections }, (_, i) => 'group ' + (i + 1))];
}

/** What gmx would refuse, in words, before anything runs (each rule checked with 2025.4). */
export function recipeProblems(opt: Options, help: HelpOption[]): string[] {
  const p: string[] = [], by = new Map(help.map(o => [o.flag, o]));
  const value = (f: string) => (unset(opt[f]) ? by.get(f)?.default : opt[f]);
  for (const { flag } of FORM) {
    const o = by.get(flag), v = opt[flag];
    if (!o || unset(v)) continue;
    if (NUMERIC.has(o.type)) {
      const n = Number(v);
      if (typeof v !== 'string' || !Number.isFinite(n) || !v.trim()) p.push('-' + flag + ': not a number: ' + v);
      else if (flag === 'bin' && n <= 0) p.push('-bin must be above 0');
      else if (n < 0 && flag !== 'b' && flag !== 'e') p.push('-' + flag + ' must be 0 or more');
    }
    if (o.type === 'enum' && !o.values!.includes(String(v))) p.push('-' + flag + ': one of ' + o.values!.join(', '));
  }
  const b = Number(value('b')), e = Number(value('e'));
  if (e > 0 && e <= b) p.push('-e must be after -b');
  const atoms = value('seltype') === 'atom', surf = value('surf') !== 'no';
  if (value('excl') === true && !atoms) p.push('-excl needs atom positions: set -seltype to atom');
  if (surf && !atoms) p.push('-surf needs atom positions: set -seltype to atom');
  if (surf && !unset(opt.norm) && opt.norm !== by.get('norm')?.default) p.push("-surf can't be combined with -norm: gmx normalises nothing with -surf");
  return p;
}

/** `to` as seen from the folder `from` (absolute POSIX paths). */
export function relPath(from: string, to: string): string {
  const a = from.split('/').filter(Boolean), b = to.split('/').filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}

/** gmx runs in the trajectory folder; outputs go to rdf/ there under one stem (T29, T30). */
export function rdfIo(inputs: { trajectory: string; runInput: string }, stem: string): { cwd: string; io: RdfIo } {
  const cwd = inputs.trajectory.slice(0, inputs.trajectory.lastIndexOf('/')) || '/', out = 'rdf/' + stem;
  return { cwd, io: { trajectory: relPath(cwd, inputs.trajectory), runInput: relPath(cwd, inputs.runInput), index: out + '.ndx', output: out + '.xvg', cn: out + '_cn.xvg' } };
}
