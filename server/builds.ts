// Saved build plans in the state folder (R3a, T209): <state>/builds/<name>.json, as recipes are kept (T37): a plan
// saved again under its name is refused unless replacing is asked for; then it is replaced atomically (a .part file,
// then a rename, T5). A plan another gmx-cypher made newer is listed, never rewritten.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { planProblems, type BuildPlan } from '../src/lib/build/plan';
import { recipeId } from '../src/lib/recipe';
import { HttpError } from './http';

const dir = (home: string) => join(home, 'builds');

export function listPlans(home: string): { id: string; name: string; problems: string[] }[] {
  if (!existsSync(dir(home))) return [];
  return readdirSync(dir(home)).filter(f => f.endsWith('.json')).flatMap(f => {
    try { const p = JSON.parse(readFileSync(join(dir(home), f), 'utf8')) as BuildPlan; return [{ id: f.slice(0, -5), name: String(p.name ?? f), problems: planProblems(p) }]; } catch { return []; }
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function savePlan(home: string, p: unknown, replace = false): { id: string } {
  const problems = planProblems(p);
  if (problems.length) throw new HttpError(400, problems.join('; '));
  const id = recipeId((p as BuildPlan).name), path = join(dir(home), id + '.json');
  if (!replace && existsSync(path)) throw new HttpError(409, 'a build plan named "' + (p as BuildPlan).name + '" is saved already');
  mkdirSync(dir(home), { recursive: true });
  writeFileSync(path + '.part', JSON.stringify(p, null, 2) + '\n');
  renameSync(path + '.part', path);
  return { id };
}

export function readPlan(home: string, id: string): BuildPlan {
  if (!id || recipeId(id) !== id) throw new HttpError(400, 'not a build plan name: ' + id);
  const path = join(dir(home), id + '.json');
  if (!existsSync(path)) throw new HttpError(404, 'no build plan ' + id);
  const p = JSON.parse(readFileSync(path, 'utf8')) as BuildPlan, problems = planProblems(p);
  if (problems.length) throw new HttpError(422, problems.join('; '));
  return p;
}
