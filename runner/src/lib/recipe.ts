import { commandOf, rdfCommand, roleProblems, withCommand } from './commands';
// Recipes (R7a, T37): the saved form of a run, without its inputs: options, groups as steps (rules where
// possible, hand-picked atoms as ranges), the name template and output folder. One recipe serves other
// trajectories of the same system, and is checked against each system before it runs there.

import { toRanges } from '../core/index';
import type { Atom } from './atoms';
import { groupAtoms, type Group } from './groups';
import type { Options } from './rdf';
import { safeFileName } from '../../../matrix/src/lib/storage/path';

export interface Recipe {
  format: 'gmx-cypher recipe';
  version: 1 | 2 | 3;
  name: string;
  /** The command (its tool name); a version 1 or 2 recipe is RDF. */
  analysis: string;
  saved: string;
  options: Options;
  /** The reference first, then the selections. */
  groups: Group[];
  template: string;
  outDir: string | null;
}

/** What a recipe carries of the draft (its inputs stay behind). */
interface DraftLike { groups: Group[]; options: Options; template?: string; outDir?: string | null; analysis?: string }

export function recipeFromDraft(d: DraftLike, name: string, saved = new Date().toISOString()): Recipe {
  return { format: 'gmx-cypher recipe', version: 3, name, analysis: d.analysis ?? 'rdf', saved, options: d.options, groups: d.groups, template: d.template ?? '{analysis}_{trajectory}', outDir: d.outDir ?? null };
}

/** The draft with the recipe's command, groups, options, template and folder; its inputs are kept. */
export function draftFromRecipe<D extends DraftLike & { inputs: unknown }>(r: Recipe, d: D) {
  return { ...withCommand(d, r.analysis ?? 'rdf'), groups: r.groups, options: r.options, template: r.template, outDir: r.outDir };
}

const KINDS = new Set(['resname', 'resnr', 'name', 'names', 'element', 'atoms']);

/** What makes a parsed file unusable as a v1 recipe, in words; [] when it is one. */
export function recipeFileProblems(x: unknown): string[] {
  const r = x as Partial<Recipe> | null;
  if (!r || typeof r !== 'object' || r.format !== 'gmx-cypher recipe') return ['not a gmx-cypher recipe'];
  if (r.version !== 1 && r.version !== 2 && r.version !== 3) return ['recipe version ' + r.version + ': this gmx-cypher reads versions 1 to 3'];
  const p: string[] = [];
  if (typeof r.name !== 'string' || !r.name.trim()) p.push('a recipe needs a name');
  const analysis = r.analysis ?? 'rdf';
  if (!commandOf(String(analysis))) p.push('analysis ' + analysis + ' is not a command gmx-cypher knows');
  if (!r.options || typeof r.options !== 'object') p.push('options are missing');
  // A command without groups (R4) has none to check; the others need as many as their roles say (R9).
  const command = commandOf(String(analysis));
  if (command?.groups === false) return p;
  if (!Array.isArray(r.groups)) return [...p, 'a reference and at least one selection are needed'];
  const wrong = roleProblems(command ?? rdfCommand, r.groups.length);
  if (wrong.length) return [...p, ...wrong];
  r.groups.forEach(g => (Array.isArray(g?.steps) ? g.steps : [null]).forEach((s, i) => {
    if (!s || !KINDS.has(s.rule?.kind)) p.push((g?.name || '?') + ': step ' + (i + 1) + ' is not a rule gmx-cypher knows');
  }));
  return p;
}

/** The recipe's groups on one system: atoms each selects there, and what can't run (R7-1: shown, never hidden). */
export function applyRecipe(r: Recipe, atoms: Atom[]): { counts: number[]; problems: string[] } {
  const problems: string[] = [];
  const counts = r.groups.map(g => {
    const nrs = groupAtoms(atoms, g.steps), inside = nrs.filter(n => n <= atoms.length), beyond = nrs.filter(n => n > atoms.length);
    if (beyond.length) problems.push(g.name + ': atoms ' + toRanges(beyond) + " are beyond this system's " + atoms.length);
    else if (!inside.length) problems.push(g.name + ' selects no atoms in this system');
    return inside.length;
  });
  return { counts, problems };
}

/** The file a recipe is saved in, `<id>.json`: its name made safe as the Matrix makes file names. Two names can share one. */
export const recipeId = (name: string) => safeFileName(name + '.json').slice(0, -'.json'.length);
