// One definition per GROMACS command (R3a, T98): RDF moved in unchanged; records and recipes name their command (v3, T97).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { awhCommand, COMMANDS, commandOf, distanceCommand, energyCommand, hbondCommand, hbondLegacyCommand, rdfCommand, rmsCommand, rmsfCommand, roleProblems, rolesOf, sectionsOf, whamCommand, withCommand } from '../src/lib/commands';
import { parseHelp } from '../src/lib/gmxText';
import { FORM, rdfArgs, rdfIo, recipeProblems } from '../src/lib/rdf';
import { outputNames } from '../src/lib/names';
import { recipeFileProblems, recipeFromDraft } from '../src/lib/recipe';
import { recordProblems } from '../src/lib/record';
import { detectAna, getAnalyses, parseTable } from '../../app/src/lib/seq';
import { parseGmxHeader } from '../../app/src/lib/gmxHeader';

const read = (name: string) => JSON.parse(readFileSync(new URL('./fixtures/formats/' + name, import.meta.url), 'utf8'));

describe('one definition per command (R3a)', () => {
  it('each command is found by its tool name: rdf, distance (R7), hbond and hbond-legacy (R8), rms and rmsf (R9), energy (R4), awh (R5) and wham (R6)', () => {
    expect(COMMANDS.map(c => c.tool)).toEqual(['rdf', 'distance', 'hbond', 'hbond-legacy', 'rms', 'rmsf', 'energy', 'awh', 'wham']);
    expect(commandOf('rdf')).toBe(rdfCommand);
    expect(commandOf('energy')).toBe(energyCommand);
    expect(commandOf('wham')).toBe(whamCommand);
    expect(commandOf('distance')).toBe(distanceCommand);
    expect(commandOf('hbond')).toBe(hbondCommand);
    expect(commandOf('hbond-legacy')).toBe(hbondLegacyCommand);
    expect(commandOf('rms')).toBe(rmsCommand);
    expect(commandOf('sasa')).toBeUndefined();
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
  it('only the sections with commands are shown: rdf under its section, energy under its own', () => {
    expect(sectionsOf()).toEqual([
      { section: 'trajectory and groups', commands: [rdfCommand, distanceCommand, hbondCommand, hbondLegacyCommand, rmsCommand, rmsfCommand] },
      { section: 'an energy file', commands: [energyCommand, awhCommand] },
      { section: 'window lists', commands: [whamCommand] },
    ]);
  });
});

describe('each command keeps its own options (review finding 1)', () => {
  const draft = { analysis: undefined as string | undefined, options: { bin: '0.01', cn: true } as Record<string, string | boolean>, inputs: {} };

  it('picking energy puts RDF\'s options aside and starts energy with none', () => {
    const e = withCommand(draft, 'energy');
    expect(e).toMatchObject({ analysis: 'energy', options: {}, optionsBy: { rdf: { bin: '0.01', cn: true } }, inputs: {} });
  });

  it('coming back gives each its own again', () => {
    const e = { ...withCommand(draft, 'energy'), options: { sum: true, b: '2' } };
    const r = withCommand(e, 'rdf');
    expect(r).toMatchObject({ analysis: 'rdf', options: { bin: '0.01', cn: true }, optionsBy: { energy: { sum: true, b: '2' } } });
    expect(withCommand(r, 'energy').options).toEqual({ sum: true, b: '2' });
  });

  it('the name template goes with its command too: an AWH stem never names an RDF run', () => {
    const a = { ...withCommand({ ...draft, template: '{analysis}_{trajectory}' }, 'awh'), template: 'hmrfast6_ha_WRWYCR' };
    const r = withCommand(a, 'rdf');
    expect(r.template).toBe('{analysis}_{trajectory}');
    expect(withCommand(r, 'awh').template).toBe('hmrfast6_ha_WRWYCR');
    expect(withCommand(withCommand({ ...draft, template: undefined }, 'energy'), 'rdf').template).toBeUndefined();
  });

  it('picking the command that is picked changes nothing', () => {
    expect(withCommand(draft, 'rdf')).toBe(draft);
  });
});

describe('what each command calls its groups, and how many it takes (R9)', () => {
  it('a reference and one or more selections, unless the definition says otherwise', () => {
    expect(rolesOf(rdfCommand)).toEqual({ first: 'reference', rest: 'selection', min: 1 });
    expect(roleProblems(rdfCommand, 2)).toEqual([]);
    expect(roleProblems(rdfCommand, 1)).toEqual(['a reference and at least one selection are needed']);
    expect(roleProblems(distanceCommand, 9)).toEqual([]);
  });

  it('the run record and the recipe say the same, in the same words', () => {
    const rec = { ...read('run-v1.run.json'), version: 3, analysis: 'rdf' };
    expect(recordProblems({ ...rec, groups: rec.groups.slice(0, 1) })).toEqual(['groups: a reference and at least one selection are needed']);
    expect(recordProblems({ ...rec, analysis: 'rms', groups: rec.groups.slice(0, 1) })).toEqual([]);
    const recipe = recipeFromDraft({ groups: read('recipe-v1.json').groups, options: {} }, 'x', '2026-10-10T00:00:00.000Z');
    expect(recipeFileProblems({ ...recipe, analysis: 'hbond' })).toEqual(['gmx hbond takes one target group after the reference, not 2']);
  });
});

describe('every output has a PMF Sequences type decision (R3a, section 3)', () => {
  it.each(COMMANDS.map(c => [c.tool, c] as const))('%s: each file has a type, or none with the reason; one goes to the vault by default', (_, c) => {
    expect(c.outputs.length).toBeGreaterThan(0);
    for (const o of c.outputs) expect(o.type !== null || !!o.why).toBe(true);
    expect(c.outputs.filter(o => o.vault)).toHaveLength(1);
    expect(c.outputs.find(o => o.vault)!.file).toBe('xvg');
  });

  // The decision checked against PMF Sequences itself, on real 2025.4 output under the default name gmx-cypher gives it.
  it.each([
    ['rdf', 'xvg', 'gmx-2025.4/rdf_nvt.xvg', 'rdf_nvt.xvg'],
    ['energy', 'xvg', 'gmx-2025.4/energy-potential.xvg', 'energy_rerun.xvg'],
    ['awh', 'xvg', 'awh/out/awh_t20.xvg', 'awh_awh_t20.xvg'],
    ['wham', 'xvg', 'wham/out/histo.xvg', 'wham_us_histo.xvg'],
    ['distance', 'xvg', 'distance/com/distance_nvt.xvg', 'distance_nvt.xvg'],
    ['distance', 'all', 'distance/com/distance_nvt_all.xvg', 'distance_nvt_all.xvg'],
    ['hbond', 'xvg', 'hbond/new/hbond_nvt.xvg', 'hbond_nvt.xvg'],
    ['hbond-legacy', 'xvg', 'hbond/legacy/hbond_nvt.xvg', 'hbond-legacy_nvt.xvg'],
    ['rms', 'xvg', 'r9/rms/rmsd_nvt.xvg', 'rms_nvt.xvg'],
    ['rmsf', 'xvg', 'r9/rmsf/rmsf_nvt.xvg', 'rmsf_nvt.xvg'],
  ])('%s %s: PMF Sequences agrees on %s', (tool, file, fixture, name) => {
    const text = readFileSync(new URL('./fixtures/' + fixture, import.meta.url), 'utf8');
    const want = commandOf(tool)!.outputs.find(o => o.file === file)!.type;
    expect(detectAna(getAnalyses(null), name, parseTable(text).head, parseGmxHeader(text)?.tool ?? null).k).toBe(want);
  });
});

describe('a WHAM profile would be mistyped by PMF Sequences (question 28)', () => {
  it('real 2025.4 profile.xvg: its title "Umbrella potential" reads as Histogram, so it is not sent until you decide', () => {
    const text = readFileSync(new URL('./fixtures/wham/out/profile.xvg', import.meta.url), 'utf8');
    expect(whamCommand.outputs.find(o => o.file === 'profile')).toMatchObject({ type: null, vault: false });
    // What PMF Sequences does today, pinned so a change there is noticed: "umbrella" is a keyword of its Histogram type.
    expect(detectAna(getAnalyses(null), 'wham_us_profile.xvg', parseTable(text).head, parseGmxHeader(text)?.tool ?? null)).toEqual({ k: 'hist', from: 'header' });
  });
});
