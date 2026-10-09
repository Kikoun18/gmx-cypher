// Groups of atoms (R3b, T15–T20): each is built from steps (rules, clicked atoms, typed atoms) applied in
// order to the whole atom table, so every step stays readable in the run record and rules carry over to
// other trajectories of the same system (R7).

import { fromRanges, toRanges, type Atom } from './atoms';
import type { Tone } from './tones';

export type Rule =
  | { kind: 'resname'; value: string }
  | { kind: 'resnr'; from: number; to: number }
  | { kind: 'name'; value: string; resn?: string }
  | { kind: 'element'; value: string }
  | { kind: 'atoms'; atoms: string };

export interface Step { op: 'add' | 'remove'; rule: Rule; note?: string }
export interface Group { role: 'reference' | 'selection'; name: string; tone: Tone; steps: Step[] }

export function ruleText(r: Rule): string {
  switch (r.kind) {
    case 'resname': return 'residue name ' + r.value;
    case 'resnr': return r.from === r.to ? 'residue number ' + r.from : 'residue numbers ' + r.from + '–' + r.to;
    case 'name': return 'atom name ' + r.value + (r.resn ? ' in every ' + r.resn : '');
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
