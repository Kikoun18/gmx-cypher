// Groups of atoms (R3b, T15–T20): each is built from steps (rules, clicked atoms, typed atoms) applied in
// order to the whole atom table, so every step stays readable in the run record and rules carry over to
// other trajectories of the same system (R7).

import { fromRanges, toRanges } from '../core/index';
import type { Atom } from './atoms';
import type { Tone } from './tones';

export type Rule =
  | { kind: 'resname'; value: string }
  | { kind: 'resnr'; from: number; to: number }
  | { kind: 'name'; value: string; resn?: string }
  | { kind: 'names'; values: string[]; resn?: string }
  | { kind: 'element'; value: string }
  | { kind: 'atoms'; atoms: string };

export interface Step { op: 'add' | 'remove'; rule: Rule; note?: string }
export interface Group { role: 'reference' | 'selection'; name: string; tone: Tone; steps: Step[] }

/** A name as the field writes it: quoted when it holds a comma, a space or a quote, or is `and` (which would read as a joiner). */
const quoteName = (name: string) => (/[\s,"]/.test(name) || name.toLowerCase() === 'and' ? '"' + name + '"' : name);

/** `O1, O2 or O3` in words; a single name as itself. */
const listText = (values: string[]) => {
  const names = values.map(quoteName);
  return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1];
};

/**
 * What the field says, as names (R1a, T92): commas, spaces and `and` separate; a quoted name is taken as it is
 * (so an atom really named AND is `"AND"`). Duplicates go; matching stays exact and case-sensitive.
 */
export function parseNames(text: string): { values: string[]; problems: string[] } {
  const values: string[] = [], problems: string[] = [];
  for (const token of text.match(/"[^"]*"|[^\s,]+/g) ?? []) {
    if (token.startsWith('"')) {
      if (token.length < 2 || !token.endsWith('"')) problems.push('a closing quote is missing');
      else if (token.length > 2) values.push(token.slice(1, -1));
    } else if (token.toLowerCase() !== 'and') values.push(token);
  }
  const unique = [...new Set(values)];
  if (!unique.length && !problems.length) problems.push('a name is needed');
  return { values: unique, problems: [...new Set(problems)] };
}

/** The list as the field writes it: `O1, O2, O3`. */
export const formatNames = (values: string[]) => values.map(quoteName).join(', ');

/** A tick in the menu: the name added to the list, or taken out of it. */
export const toggleName = (text: string, name: string) => {
  const { values } = parseNames(text);
  return formatNames(values.includes(name) ? values.filter(v => v !== name) : [...values, name]);
};

/** The names in one residue name (or in every residue), with how many atoms each has, sorted. */
export function atomNameCounts(atoms: Atom[], resn?: string): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const a of atoms) if (!resn || a.resn === resn) counts.set(a.name, (counts.get(a.name) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, count]) => ({ name, count }));
}

export function ruleText(r: Rule): string {
  switch (r.kind) {
    case 'resname': return 'residue name ' + r.value;
    case 'resnr': return r.from === r.to ? 'residue number ' + r.from : 'residue numbers ' + r.from + '–' + r.to;
    case 'name': return 'atom name ' + r.value + (r.resn ? ' in every ' + r.resn : '');
    case 'names': return 'atom name ' + listText(r.values) + (r.resn ? ' in every ' + r.resn : '');
    case 'element': return 'element ' + r.value;
    case 'atoms': return 'atoms ' + r.atoms;
  }
}

/** Names as the file writes them: exact, so what a rule says is what it takes. */
function matches(a: Atom, r: Rule): boolean {
  switch (r.kind) {
    case 'resname': return a.resn === r.value;
    case 'resnr': return a.resi >= r.from && a.resi <= r.to;
    case 'name': return a.name === r.value && (!r.resn || a.resn === r.resn);
    case 'names': return r.values.includes(a.name) && (!r.resn || a.resn === r.resn);
    case 'element': return a.elem === r.value;
    case 'atoms': return false;
  }
}

function ruleAtoms(atoms: Atom[], r: Rule): number[] {
  return r.kind === 'atoms' ? fromRanges(r.atoms) : atoms.filter(a => matches(a, r)).map(a => a.nr);
}

/** The group's GROMACS atom numbers, sorted. Typed numbers beyond the structure are kept (and flagged by the caller). */
export function groupAtoms(atoms: Atom[], steps: Step[]): number[] {
  const set = new Set<number>();
  for (const s of steps) for (const nr of ruleAtoms(atoms, s.rule)) { if (s.op === 'add') set.add(nr); else set.delete(nr); }
  return [...set].sort((a, b) => a - b);
}

/** The atoms of the residue an atom is in: the run of neighbours with its residue name and number. */
function residueOf(atoms: Atom[], nr: number): number[] {
  const a = atoms[nr - 1], same = (b: Atom | undefined) => !!b && b.resi === a.resi && b.resn === a.resn;
  let i = nr - 1, j = nr - 1;
  while (same(atoms[i - 1])) i--;
  while (same(atoms[j + 1])) j++;
  return atoms.slice(i, j + 1).map(b => b.nr);
}

/**
 * A click (T15) as a step, toggling: an atom (merged into the last clicked step), its residue (shift), or
 * its atom name in every residue of its name (alt), which is a rule.
 */
export function clickStep(atoms: Atom[], steps: Step[], nr: number, how: 'atom' | 'residue' | 'name'): Step[] {
  const a = atoms[nr - 1], present = groupAtoms(atoms, steps).includes(nr), op = present ? 'remove' as const : 'add' as const;
  if (how === 'name') return [...steps, { op, rule: { kind: 'name', value: a.name, resn: a.resn } }];
  if (how === 'residue') return [...steps, { op, rule: { kind: 'atoms', atoms: toRanges(residueOf(atoms, nr)) }, note: 'shift-click on ' + a.resn + ' ' + a.resi }];
  const last = steps[steps.length - 1];
  if (last?.note === 'clicked' && last.rule.kind === 'atoms') {
    const now = new Set(fromRanges(last.rule.atoms));
    if (last.op === op) now.add(nr);
    else if (now.has(nr)) now.delete(nr);
    else return [...steps, { op, rule: { kind: 'atoms', atoms: String(nr) }, note: 'clicked' }];
    return now.size ? [...steps.slice(0, -1), { ...last, rule: { kind: 'atoms', atoms: toRanges([...now]) } }] : steps.slice(0, -1);
  }
  return [...steps, { op, rule: { kind: 'atoms', atoms: String(nr) }, note: 'clicked' }];
}

/** Why GROMACS couldn't use a name, or null (T18: one word, simple characters, unique ignoring case). */
export function nameProblem(name: string, others: string[]): string | null {
  if (!name) return 'a name is needed';
  if (/\s/.test(name)) return 'no spaces: GROMACS reads only the first word of a group name';
  if (!/^[A-Za-z0-9_+.:-]+$/.test(name)) return 'use letters, digits and _ - + . : only';
  if (name.length > 32) return 'at most 32 characters';
  const twin = others.find(o => o.toLowerCase() === name.toLowerCase());
  return twin ? 'another group is already called ' + twin : null;
}

/** The atoms of b that are also in a, in b's order. */
export function shared(a: number[], b: number[]): number[] {
  const s = new Set(a);
  return b.filter(x => s.has(x));
}

/**
 * The group C + click rotates around (T140): the one being picked if it holds the atom, else the first that does (the
 * reference comes first); null when no group has it, and the atom alone is the centre.
 */
export function groupHolding(nr: number, sets: number[][], preferred: number): number | null {
  if (sets[preferred]?.includes(nr)) return preferred;
  const i = sets.findIndex(s => s.includes(nr));
  return i < 0 ? null : i;
}
