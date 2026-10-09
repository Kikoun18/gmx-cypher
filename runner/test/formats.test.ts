// The frozen v1 files (R1-0, section 1.5 of batch 2): written by the unchanged code from a real RDF run, never regenerated.
// Every later version must still read them the way they read them here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { recipeFileProblems, recipeFromDraft } from '../src/lib/recipe';
import { recipeFromRecord, recordProblems, type RunRecord } from '../src/lib/record';

const FIX = new URL('./fixtures/formats/', import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, FIX), 'utf8'));

describe('the frozen v1 files', () => {
  it('the v1 recipe loads without problems and keeps its groups and options', () => {
    const r = read('recipe-v1.json');
    expect(recipeFileProblems(r)).toEqual([]);
    expect(r.groups.map((g: { name: string }) => g.name)).toEqual(['sulfur', 'water_O', 'sodium']);
    expect(r.options).toEqual({ cn: true });
  });

  it('the v1 run record loads, and its recipe is the frozen recipe again', () => {
    const run = read('run-v1.run.json') as RunRecord;
    expect(recordProblems(run)).toEqual([]);
    const recipe = read('recipe-v1.json');
    expect(recipeFromRecord(run).groups).toEqual(recipe.groups.map((g: { role: string; name: string; tone: string; steps: unknown[] }) => ({ role: g.role, name: g.name, tone: g.tone, steps: g.steps })));
    expect(recipeFromRecord(run).options).toEqual(recipe.options);
  });

  it('a recipe written now is version 2 with the frozen shape (its groups and options are the frozen ones)', () => {
    const recipe = read('recipe-v1.json');
    expect(recipeFromDraft({ groups: recipe.groups, options: recipe.options }, 'ion pairs v1', recipe.saved)).toEqual({ ...recipe, version: 2 });
  });

  it('a newer version is refused in words, not read', () => {
    expect(recipeFileProblems({ ...read('recipe-v1.json'), version: 3 })).toEqual(['recipe version 3: this gmx-cypher reads versions 1 and 2']);
  });
});
