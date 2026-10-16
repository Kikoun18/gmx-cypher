import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { atomTable } from '../src/lib/atoms';
import type { Group } from '../src/lib/groups';
import { applyRecipe, draftFromRecipe, recipeFileProblems, recipeFromDraft, recipeId } from '../src/lib/recipe';

const nvt = atomTable(readFileSync(new URL('./fixtures/nvt/nvt.gro', import.meta.url), 'utf8'), 'gro');
// Another system of the same kind: two waters (TIP4P) and one sodium, numbered differently.
const gro = (rows: [number, string, string][]) => ['other', String(rows.length).padStart(5),
  ...rows.map(([resi, resn, name], i) => String(resi).padStart(5) + resn.padEnd(5) + name.padStart(5) + String(i + 1).padStart(5) + '   0.000   0.000   0.000'), '   1.0 1.0 1.0'].join('\n');
const small = atomTable(gro([[1, 'SOL', 'OW1'], [1, 'SOL', 'HW2'], [1, 'SOL', 'HW3'], [1, 'SOL', 'MW1'], [2, 'SOL', 'OW1'], [2, 'SOL', 'HW2'], [2, 'SOL', 'HW3'], [2, 'SOL', 'MW1'], [3, 'Na', 'Na']]), 'gro');
const groups: Group[] = [
  { role: 'reference', name: 'sodium', tone: 'coral', steps: [{ op: 'add', rule: { kind: 'resname', value: 'Na' } }] },
  { role: 'selection', name: 'water_O', tone: 'sky', steps: [{ op: 'add', rule: { kind: 'name', value: 'OW1', resn: 'SOL' } }] },
];
const draft = { inputs: { trajectory: { path: '/sim/nvt/nvt.xtc', why: 'picked' } }, groups, options: { rmax: '1.5', cn: true }, template: '{analysis}_{trajectory}', outDir: null };

describe('recipes (T37)', () => {
  it('round trip: the draft as a recipe, as JSON, and back; the inputs stay the draft\'s own', () => {
    const r = recipeFromDraft(draft, 'ion pairs', '2026-10-09T01:00:00.000Z');
    expect(r).toEqual({ format: 'gmx-cypher recipe', version: 3, name: 'ion pairs', analysis: 'rdf', saved: '2026-10-09T01:00:00.000Z', options: { rmax: '1.5', cn: true }, groups, template: '{analysis}_{trajectory}', outDir: null });
    const back = JSON.parse(JSON.stringify(r));
    expect(recipeFileProblems(back)).toEqual([]);
    const other = { inputs: { trajectory: { path: '/sim/other.xtc', why: 'picked' } }, groups: [], options: {} };
    expect(draftFromRecipe(back, other)).toEqual({ inputs: other.inputs, groups, options: { rmax: '1.5', cn: true }, template: '{analysis}_{trajectory}', outDir: null });
  });

  it('names what makes a file unusable as a recipe', () => {
    expect(recipeFileProblems({ format: 'something' })).toEqual(['not a gmx-cypher recipe']);
    expect(recipeFileProblems({ ...recipeFromDraft(draft, 'x'), version: 4 })).toEqual(['recipe version 4: this gmx-cypher reads versions 1 to 3']);
    expect(recipeFileProblems({ ...recipeFromDraft(draft, 'x'), groups: [groups[0]] })).toEqual(['a reference and at least one selection are needed']);
    expect(recipeFileProblems({ ...recipeFromDraft(draft, 'x'), groups: [groups[0], { ...groups[1], steps: [{ op: 'add', rule: { kind: 'nope' } }] }] })).toEqual(['water_O: step 1 is not a rule gmx-cypher knows']);
  });

  it('rules apply to another system of the same kind, with its own numbers', () => {
    expect(applyRecipe(recipeFromDraft(draft, 'x'), nvt)).toEqual({ counts: [12, 800], problems: [] });
    expect(applyRecipe(recipeFromDraft(draft, 'x'), small)).toEqual({ counts: [1, 2], problems: [] });
  });

  it('hand-picked atoms are checked against each system\'s atom count; a group that selects nothing is named', () => {
    const picked = { ...draft, groups: [groups[0], { ...groups[1], steps: [{ op: 'add' as const, rule: { kind: 'atoms' as const, atoms: '5-30:5' }, note: 'clicked' }] }] };
    expect(applyRecipe(recipeFromDraft(picked, 'x'), nvt)).toEqual({ counts: [12, 6], problems: [] });
    expect(applyRecipe(recipeFromDraft(picked, 'x'), small)).toEqual({ counts: [1, 1], problems: ['water_O: atoms 10-30:5 are beyond this system\'s 9'] });
    const none = { ...draft, groups: [groups[0], { ...groups[1], steps: [{ op: 'add' as const, rule: { kind: 'resname' as const, value: 'SO4' } }] }] };
    expect(applyRecipe(recipeFromDraft(none, 'x'), small).problems).toEqual(['water_O selects no atoms in this system']);
  });
});

describe('a recipe\'s file name', () => {
  it('is its name made safe as the Matrix makes file names, the same in the page and the server (review finding 11)', () => {
    expect(recipeId('ion pairs / v1')).toBe('ion pairs _ v1');
    expect(recipeId('ion pairs _ v1')).toBe(recipeId('ion pairs / v1'));
  });
});

describe('recipes in the state folder', () => {
  it('saved by name (a second save replaces it only when asked to, atomically), listed, read back; anything else refused', async () => {
    const { existsSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { apiServer } = await import('./helpers');
    const s = await apiServer(), r = recipeFromDraft(draft, 'ion pairs / v1', '2026-10-09T01:00:00.000Z');
    expect((await s.call('/api/recipes')).json).toEqual([]);
    expect((await s.call('/api/recipes', r)).json).toEqual({ id: 'ion pairs _ v1' });
    // A name taken, or one that becomes the same file name, is refused unless replacing is asked for (review finding 11).
    expect(await s.call('/api/recipes', { ...r, options: { bin: '0.01' } })).toEqual({ status: 409, json: { error: 'a recipe named "ion pairs / v1" is saved already' } });
    expect((await s.call('/api/recipes', { ...r, name: 'ion pairs _ v1' })).json).toEqual({ error: 'a recipe named "ion pairs / v1" is saved already' });
    expect((await s.call('/api/recipes?replace=1', { ...r, options: { bin: '0.01' }, saved: '2026-10-09T02:00:00.000Z' })).json).toEqual({ id: 'ion pairs _ v1' });
    expect(readdirSync(join(s.ctx.home, 'recipes'))).toEqual(['ion pairs _ v1.json']);
    expect((await s.call('/api/recipes')).json).toEqual([{ id: 'ion pairs _ v1', name: 'ion pairs / v1', saved: '2026-10-09T02:00:00.000Z' }]);
    expect((await s.call('/api/recipes/' + encodeURIComponent('ion pairs _ v1'))).json).toMatchObject({ name: 'ion pairs / v1', options: { bin: '0.01' } });
    expect((await s.call('/api/recipes', { format: 'x' })).json).toEqual({ error: 'not a gmx-cypher recipe' });
    expect((await s.call('/api/recipes/' + encodeURIComponent('../config'))).status).toBe(400);
    expect(existsSync(join(s.ctx.home, 'config.json'))).toBe(false);
    await s.close();
  });
});
