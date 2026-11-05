// Saved build plans (R3a, T209): <state>/builds/<name>.json, refused twice under one name unless replacing, written
// through a .part file; a plan from a newer gmx-cypher is listed with why, never read as this one's.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listPlans, readPlan, savePlan } from '../server/builds';
import { DEFAULT_PLAN } from '../src/lib/build/plan';
import { tmp } from './helpers';

describe('saved build plans', () => {
  it('saves under the name, lists and reads it back, and leaves no .part behind', () => {
    const home = tmp('builds');
    expect(savePlan(home, DEFAULT_PLAN)).toEqual({ id: 'peptide × saccharide · awh and pull' });
    expect(readdirSync(join(home, 'builds'))).toEqual(['peptide × saccharide · awh and pull.json']);
    expect(listPlans(home)).toEqual([{ id: 'peptide × saccharide · awh and pull', name: DEFAULT_PLAN.name, problems: [] }]);
    expect(readPlan(home, 'peptide × saccharide · awh and pull')).toEqual(DEFAULT_PLAN);
  });
  it('refuses a second plan of the same name unless replacing; replaces it whole', () => {
    const home = tmp('builds');
    savePlan(home, DEFAULT_PLAN);
    expect(() => savePlan(home, DEFAULT_PLAN)).toThrow('a build plan named "peptide × saccharide · awh and pull" is saved already');
    const changed = { ...DEFAULT_PLAN, science: { ...DEFAULT_PLAN.science, maxwarn: 2 } };
    savePlan(home, changed, true);
    expect(readPlan(home, 'peptide × saccharide · awh and pull').science.maxwarn).toBe(2);
  });
  it('refuses what is not a plan, and a name that is not a file name', () => {
    const home = tmp('builds');
    expect(() => savePlan(home, { format: 'x' })).toThrow(/^not a build plan/);
    expect(() => readPlan(home, '../recipes/x')).toThrow('not a build plan name: ../recipes/x');
    expect(existsSync(join(home, 'builds'))).toBe(false);
  });
  it('lists a plan from a newer gmx-cypher with why, and will not read it', () => {
    const home = tmp('builds');
    mkdirSync(join(home, 'builds'));
    writeFileSync(join(home, 'builds', 'later.json'), JSON.stringify({ ...DEFAULT_PLAN, name: 'later', version: 2 }));
    expect(listPlans(home)[0].problems).toEqual(['this build plan was made by a newer gmx-cypher (version 2); this one reads version 1']);
    expect(() => readPlan(home, 'later')).toThrow(/newer gmx-cypher/);
    expect(JSON.parse(readFileSync(join(home, 'builds', 'later.json'), 'utf8')).version).toBe(2);
  });
});
