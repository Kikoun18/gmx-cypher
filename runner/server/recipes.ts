// Recipes in the state folder (R7a, T37): <state>/recipes/<name>.json. A recipe saved again under its
// name is replaced atomically (a .part file, then a rename), as the state folder's own files are (T5).

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeFileName } from '../../app/src/lib/storage/path';
import { recipeFileProblems, type Recipe } from '../src/lib/recipe';
import { HttpError } from './http';

const dir = (home: string) => join(home, 'recipes');
const idOf = (name: string) => safeFileName(name + '.json').slice(0, -'.json'.length);

export function listRecipes(home: string): { id: string; name: string; saved: string }[] {
  if (!existsSync(dir(home))) return [];
  return readdirSync(dir(home)).filter(f => f.endsWith('.json')).flatMap(f => {
    try { const r = JSON.parse(readFileSync(join(dir(home), f), 'utf8')) as Recipe; return recipeFileProblems(r).length ? [] : [{ id: f.slice(0, -5), name: r.name, saved: r.saved }]; } catch { return []; }
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function saveRecipe(home: string, r: unknown): { id: string } {
  const problems = recipeFileProblems(r);
  if (problems.length) throw new HttpError(400, problems.join('; '));
  const id = idOf((r as Recipe).name), path = join(dir(home), id + '.json');
  mkdirSync(dir(home), { recursive: true });
  writeFileSync(path + '.part', JSON.stringify(r, null, 2) + '\n');
  renameSync(path + '.part', path);
  return { id };
}

export function readRecipe(home: string, id: string): Recipe {
  if (!id || idOf(id) !== id) throw new HttpError(400, 'not a recipe name: ' + id);
  const path = join(dir(home), id + '.json');
  if (!existsSync(path)) throw new HttpError(404, 'no recipe ' + id);
  return JSON.parse(readFileSync(path, 'utf8')) as Recipe;
}
