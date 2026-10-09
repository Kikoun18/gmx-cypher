// One definition per GROMACS command (R3a, T98): RDF moved in unchanged; records and recipes name their command (v3, T97).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMANDS, commandOf, rdfCommand, sectionsOf } from '../src/lib/commands';
import { parseHelp } from '../src/lib/gmxText';
import { FORM, rdfArgs, rdfIo, recipeProblems } from '../src/lib/rdf';
import { outputNames } from '../src/lib/names';
import { recipeFileProblems, recipeFromDraft } from '../src/lib/recipe';
import { recordProblems } from '../src/lib/record';

const read = (name: string) => JSON.parse(readFileSync(new URL('./fixtures/formats/' + name, import.meta.url), 'utf8'));

describe('one definition per command (R3a)', () => {
  it('rdf is the one command so far, found by its tool name', () => {
    expect(COMMANDS.map(c => c.tool)).toEqual(['rdf']);
    expect(commandOf('rdf')).toBe(rdfCommand);
    expect(commandOf('energy')).toBeUndefined();
  });

  it('rdf says what it takes: four inputs, and a reference with selections', () => {
    expect(rdfCommand).toMatchObject({ tool: 'rdf', inputs: ['trajectory', 'runInput', 'structure', 'index'], groups: true });
    expect(rdfCommand.options).toBe(FORM);
  });

  it('its file names are the four of the first spec', () => {
    expect(rdfCommand.outputNames('rdf_nvt')).toEqual(outputNames('rdf_nvt'));
  });

  it('its argument list and its refusals are the ones RDF always had', () => {
    const help = parseHelp(readFileSync(new URL('./fixtures/gmx-2025.4/rdf-h.txt', import.meta.url), 'utf8'));
    const { io } = rdfIo({ trajectory: '/sim/nvt.xtc', runInput: '/sim/nvt.tpr' }, '/sim/rdf', 'rdf_nvt');
    const options = { cn: true, rmax: '1.5' };
    expect(rdfCommand.argv({ options, selections: 2 }, io, help)).toEqual(rdfArgs({ options, selections: 2 }, io, help));
    expect(rdfCommand.problems({ excl: true, seltype: 'mol_com' }, help)).toEqual(recipeProblems({ excl: true, seltype: 'mol_com' }, help));
  });
});

describe('records and recipes name their command (v3)', () => {
  it('a v3 run record needs its analysis; the frozen v1 one, read as RDF, needs none', () => {
    expect(recordProblems({ ...read('run-v1.run.json'), version: 3, analysis: 'rdf' })).toEqual([]);
    expect(recordProblems({ ...read('run-v1.run.json'), version: 3 })).toEqual(['analysis is missing: a version 3 record names its command']);
    expect(recordProblems(read('run-v1.run.json'))).toEqual([]);
  });

  it('a recipe names a command gmx-cypher knows, or is refused in words', () => {
    const recipe = recipeFromDraft({ groups: read('recipe-v1.json').groups, options: {} }, 'x', '2026-10-09T00:00:00.000Z');
    expect(recipe.version).toBe(3);
    expect(recipeFileProblems(recipe)).toEqual([]);
    expect(recipeFileProblems({ ...recipe, analysis: 'warp' })).toEqual(['analysis warp is not a command gmx-cypher knows']);
  });

  it('a newer version is refused, saying which versions are read', () => {
    expect(recipeFileProblems({ ...read('recipe-v1.json'), version: 4 })).toEqual(['recipe version 4: this gmx-cypher reads versions 1 to 3']);
    expect(recordProblems({ ...read('run-v1.run.json'), version: 4 })).toEqual(['run record version 4: this gmx-cypher reads versions 1 to 3']);
  });
});

describe('the picker groups the commands by what they need (R3b)', () => {
  it('only the sections with commands are shown, rdf under its section', () => {
    expect(sectionsOf()).toEqual([{ section: 'trajectory and groups', commands: [rdfCommand] }]);
  });
});
