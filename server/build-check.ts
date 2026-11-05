// What a build reads, checked (R4): each file a system needs, found or not, in the base folder (settings), which must
// be inside the allowed folders. Only stat() and, for the mdp and topology files a person opens, a read: nothing is
// written. Names arrive from the page and become paths, so every one is checked first.

import { readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, normalize } from 'node:path';
import { inputsOf, type Input } from '../src/lib/build/inputs';
import { nameProblem, planProblems, systemsOf, type BuildPlan, type Systems } from '../src/lib/build/plan';
import { within } from './files';
import { HttpError } from './http';

/** The base folder, real and inside the allowed folders, or why not. */
export function baseFolder(base: string | null, roots: string[]): string {
  if (!base) throw new HttpError(409, 'no base folder: set it in settings → symbuilder');
  let real: string;
  try { real = realpathSync(base); if (!statSync(real).isDirectory()) throw new Error(); } catch { throw new HttpError(400, base + ' is not a folder'); }
  const ok = roots.flatMap(r => { try { return [realpathSync(r)]; } catch { return []; } }).some(r => within(real, r));
  if (!ok) throw new HttpError(403, 'the base folder must be inside an allowed folder: ' + base);
  return real;
}

const exists = (p: string) => { try { return statSync(p).isFile(); } catch { return false; } };

export function checkInputs(base: string, plan: unknown, systems: Systems): { base: string; files: (Input & { found: boolean })[]; missing: Record<string, string[]> } {
  const problems = planProblems(plan);
  if (problems.length) throw new HttpError(400, problems.join('; '));
  for (const [kind, names] of [['method', systems.methods], ['saccharide', systems.saccharides], ['sequence', systems.sequences]] as const)
    for (const n of names) { const p = nameProblem(kind, n); if (p) throw new HttpError(400, p); }
  const files = new Map<string, Input & { found: boolean }>(), missing: Record<string, string[]> = {};
  for (const sys of systemsOf(systems)) {
    for (const i of inputsOf(plan as BuildPlan, sys)) {
      if (!files.has(i.path)) files.set(i.path, { ...i, found: exists(join(base, i.path)) });
      if (!files.get(i.path)!.found) (missing[sys.dir] ??= []).push(i.path);
    }
  }
  return { base, files: [...files.values()], missing };
}

const TEXT = ['.mdp', '.itp', '.top'];
/** An mdp or topology file of the base folder, to read: relative, inside it, at most 256 kB. */
export function readText(base: string, rel: string): string {
  const n = normalize(rel);
  if (!rel || isAbsolute(rel) || n.startsWith('..') || !TEXT.includes(extname(n))) throw new HttpError(400, 'not an mdp or topology file of the base folder: ' + rel);
  let real: string;
  try { real = realpathSync(join(base, n)); } catch { throw new HttpError(404, 'no ' + rel + ' in the base folder'); }
  if (!within(real, base)) throw new HttpError(403, rel + ' leads outside the base folder');
  if (statSync(real).size > 256 * 1024) throw new HttpError(413, rel + ' is over 256 kB');
  return readFileSync(real, 'utf8');
}
