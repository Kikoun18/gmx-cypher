// Atom names as lists (R1a, decisions T92–T93): one rule for `OH1, OH2 OH3 and OH4`, the same set in any spelling.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { atomTable } from '../src/lib/atoms';
import { atomNameCounts, formatNames, groupAtoms, parseNames, ruleText, toggleName, type Rule } from '../src/lib/groups';
import { recipeFileProblems } from '../src/lib/recipe';
import { recordProblems } from '../src/lib/record';

const nvt = atomTable(readFileSync(new URL('./fixtures/nvt/nvt.gro', import.meta.url), 'utf8'), 'gro');
const FIX = new URL('./fixtures/formats/', import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, FIX), 'utf8'));
const so4 = (values: string[]): Rule => ({ kind: 'names', values, resn: 'SO4' });

describe('parseNames: the same set however it is spelled', () => {
  it.each<[string, string[]]>([
    ['OH1, OH2 OH3 and OH4', ['OH1', 'OH2', 'OH3', 'OH4']],
    ['OH1 OH2 OH3', ['OH1', 'OH2', 'OH3']],
    ['OH1 and OH2 AND OH3', ['OH1', 'OH2', 'OH3']],
    ['  , ,O1 ,', ['O1']],
    ['O1 O1 o1', ['O1', 'o1']],
    ['"AND"', ['AND']],
    ['"and" OH1', ['and', 'OH1']],
    ['"O1, O2"', ['O1, O2']],
  ])('%s', (text, values) => {
    expect(parseNames(text)).toEqual({ values, problems: [] });
  });

  it('refuses nothing to select, and says what is wrong', () => {
    expect(parseNames('')).toEqual({ values: [], problems: ['a name is needed'] });
    expect(parseNames('and')).toEqual({ values: [], problems: ['a name is needed'] });
    expect(parseNames('"O1')).toEqual({ values: [], problems: ['a closing quote is missing'] });
    expect(parseNames('""')).toEqual({ values: [], problems: ['a name is needed'] });
  });
});

describe('the field text and the menu', () => {
  it('writes a list back with commas, quoting only what it must', () => {
    expect(formatNames(['O1', 'O2', 'O3'])).toBe('O1, O2, O3');
    expect(formatNames(['AND', 'a b'])).toBe('"AND", "a b"');
    expect(parseNames(formatNames(['AND', 'a b', 'O1'])).values).toEqual(['AND', 'a b', 'O1']);
  });

  it('a tick adds or removes one name, in the list', () => {
    expect(toggleName('O1, O2', 'O3')).toBe('O1, O2, O3');
    expect(toggleName('O1, O2', 'O1')).toBe('O2');
    expect(toggleName('', 'O1')).toBe('O1');
  });

  it('the menu lists the names in the chosen residue name, with counts, sorted', () => {
    expect(atomNameCounts(nvt, 'SO4')).toEqual([
      { name: 'O1', count: 6 }, { name: 'O2', count: 6 }, { name: 'O3', count: 6 }, { name: 'O4', count: 6 }, { name: 'S1', count: 6 },
    ]);
    expect(atomNameCounts(nvt, 'SO4').length).toBe(5);
  });
});

describe('the rule says it in words', () => {
  it.each<[Rule, string]>([
    [{ kind: 'names', values: ['O1'] }, 'atom name O1'],
    [so4(['O1', 'O2', 'O3', 'O4']), 'atom name O1, O2, O3 or O4 in every SO4'],
    [{ kind: 'names', values: ['OH1', 'OH2'] }, 'atom name OH1 or OH2'],
  ])('%j', (rule, text) => expect(ruleText(rule)).toBe(text));
});

describe('what the rule selects on nvt.gro', () => {
  it('the list selects the atoms of each name, and only those', () => {
    const four = groupAtoms(nvt, [{ op: 'add', rule: so4(['O1', 'O2', 'O3', 'O4']) }]);
    expect(four.length).toBe(24);
    const each = ['O1', 'O2', 'O3', 'O4'].flatMap(n => groupAtoms(nvt, [{ op: 'add', rule: { kind: 'name', value: n, resn: 'SO4' } }]));
    expect(four).toEqual(each.sort((a, b) => a - b));
  });

  it('a name the structure does not have selects nothing (and the menu counts it as 0)', () => {
    expect(groupAtoms(nvt, [{ op: 'add', rule: so4(['XX']) }])).toEqual([]);
  });

  it('a list of one name selects what the old single-name rule selects (WATER OW1)', () => {
    const old = groupAtoms(nvt, [{ op: 'add', rule: { kind: 'name', value: 'OW1', resn: 'SOL' } }]);
    expect(groupAtoms(nvt, [{ op: 'add', rule: { kind: 'names', values: ['OW1'], resn: 'SOL' } }])).toEqual(old);
    expect(old.length).toBe(800);
  });
});

describe('recipe and record versions with lists', () => {
  it('a version 2 recipe with a list loads; a version 3 one is refused in words', () => {
    const v2 = { ...read('recipe-v1.json'), version: 2, groups: [read('recipe-v1.json').groups[0], { role: 'selection', name: 'oxygens', tone: 'sky', steps: [{ op: 'add', rule: { kind: 'names', values: ['O1', 'O2'], resn: 'SO4' } }] }] };
    expect(recipeFileProblems(v2)).toEqual([]);
    expect(recipeFileProblems({ ...v2, version: 4 })).toEqual(['recipe version 4: this gmx-cypher reads versions 1 to 3']);
  });

  it('the frozen v1 record still loads (versions 1 and 2 are read)', () => {
    expect(recordProblems(read('run-v1.run.json'))).toEqual([]);
    expect(recordProblems({ ...read('run-v1.run.json'), version: 4 })).toEqual(['run record version 4: this gmx-cypher reads versions 1 to 3']);
  });
});
