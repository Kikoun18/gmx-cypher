// pdb2gmx's menus from the force field (T230): GROMACS's filter_ter ported, run on the block names of your force
// field's .tdb files (test/fixtures/build/ff-menus: the [ headers ] only, no parameters), golden against the menus your
// notebook's pdb2gmx printed for HIS; then each sequence's answers: what they pick, what the plan's answers stand for,
// and the answers that pick it (1 8 1 1 for MET, as your notebook's comment says).
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAN } from '../src/lib/build/plan';
import { checkAnswers, standsFor, tdbNames, terMenu, waterModels, type ForceFieldMenus } from '../src/lib/build/pdb2gmx';
import { checkInputs, forceFieldMenus } from '../server/build-check';
import { baseFolder, RUNNER } from './helpers';

const DIR = RUNNER + 'test/fixtures/build/ff-menus/', FF = 'charmm36s-jul2022-prosECCo75';
const files = readdirSync(DIR).sort(), blocks = (end: string) => files.filter(f => f.endsWith('.' + end + '.tdb')).flatMap(f => tdbNames(readFileSync(DIR + f, 'utf8')));
const MENUS: ForceFieldMenus = { local: [FF + '.ff'], n: blocks('n'), c: blocks('c'), waters: waterModels(readFileSync(DIR + 'watermodels.dat', 'utf8')) };
/** The menus as your notebook's pdb2gmx printed them: `Select start terminus type for HIS-1` and so on. */
const printed = (title: RegExp) => {
  const lines = readFileSync(RUNNER + 'test/fixtures/build/notebook/tools/pdb2gmx.txt', 'utf8').split('\n'), at = lines.findIndex(l => title.test(l)), out: string[] = [];
  // The water menu has a blank line after each entry.
  for (let i = at + 1; /^\s*\d+: |^\s*$/.test(lines[i]); i++) if (lines[i].trim()) out.push(lines[i].replace(/^\s*\d+: /, '').trim());
  return out;
};

describe('filter_ter, on your force field', () => {
  it('the block names, keywords left out; the water models', () => {
    expect(tdbNames('[ None ]\n[ GLY-NH3+ ] ; glycine\n[ delete ]\nHT\n[ replace ]\n[ add ]\n[ NH3+ ]\n[ impropers ]\n')).toEqual(['None', 'GLY-NH3+', 'NH3+']);
    expect(MENUS.n).toEqual(['None', 'GLY-NH3+', 'NH3+', 'PRO-NH2+', 'GLY-NH2', 'NH2', 'None', 'None', 'None', 'HYD1', 'MET1', 'None', 'None', 'None', '5TER', '5MET', '5PHO', '5POM', 'None', 'None']);
    expect(MENUS.waters.map(w => w.name)).toEqual(['tip3p', 'tip3p_original', 'spc', 'spce', 'tip5p', 'tip4p', 'tip4pew']);
  });
  it('HIS: the menus your notebook\'s pdb2gmx printed, entry for entry', () => {
    expect(terMenu(MENUS.n, 'HIS')).toEqual(printed(/^Select start terminus type for HIS-1/));
    expect(terMenu(MENUS.c, 'HIS')).toEqual(printed(/^Select end terminus type for HIS-8/));
    expect([...MENUS.waters.map(w => w.label + ' ' + w.what), 'None'].map(w => w.replace(/\s+/g, ' '))).toEqual(printed(/^Select the Water Model/).map(w => w.replace(/\s+/g, ' ')));
  });
  it('GLY and PRO have their own N-termini first, and drop the generic ones they contain; MET matches the ethers\' caps by name', () => {
    expect(terMenu(MENUS.n, 'GLY')).toEqual(['GLY-NH3+', 'GLY-NH2', 'HYD1', 'MET1', '5TER', '5MET', '5PHO', '5POM', 'None']);
    expect(terMenu(MENUS.n, 'PRO')).toEqual(['PRO-NH2+', 'NH3+', 'HYD1', 'MET1', '5TER', '5MET', '5PHO', '5POM', 'None']);
    expect(terMenu(MENUS.n, 'MET')).toEqual(['MET1', 'NH3+', 'NH2', 'HYD1', '5TER', '5MET', '5PHO', '5POM', 'None']);
    expect(terMenu(MENUS.c, 'MET')).toEqual(['MET2', 'COO-', 'COOH', 'CT2', 'CT1', 'HYD2', '3TER', 'None']);
    // A |-separated name covers each residue it names (GROMACS's [ GLY|SER|ALA-NH3+ ]).
    expect(terMenu(['None', 'GLY|SER-NH3+', 'NH3+', 'NH2'], 'SER')).toEqual(['GLY|SER-NH3+', 'NH2', 'None']);
  });
  it('what NH3+ stands for: the residue\'s own of the same charge, or NH3+; none for a neutral NH2 on proline', () => {
    expect(['HIS', 'GLY', 'PRO', 'MET'].map(r => standsFor(terMenu(MENUS.n, r), r, 'NH3+'))).toEqual(['NH3+', 'GLY-NH3+', 'PRO-NH2+', 'NH3+']);
    expect(['GLY', 'PRO', 'MET'].map(r => standsFor(terMenu(MENUS.n, r), r, 'NH2'))).toEqual(['GLY-NH2', null, 'NH2']);
    expect(standsFor(terMenu(MENUS.c, 'MET'), 'MET', 'COO-')).toBe('COO-');
    expect(standsFor(terMenu(MENUS.n, 'MET'), 'MET', 'None')).toBe('None');
  });
});

describe('each sequence\'s answers', () => {
  const SEQ = ['dddddddd', 'gggggggg', 'hhhhhhhh', 'pppppppp', 'mmmmmmmm', 'mhhhhhhh', 'hhhhhhhm'];
  it('the plan\'s 1 8 0 0 is NH3+ and COO-; MET\'s ends need 1, as your notebook\'s comment says; the termini your notebook built', () => {
    const r = checkAnswers(MENUS, FF, '1 8 0 0', {}, SEQ);
    expect(r.general).toEqual([]);
    expect(r.water).toBe('None');
    expect(r.sequences.map(x => [x.sequence, x.want])).toEqual([['dddddddd', '1 8 0 0'], ['gggggggg', '1 8 0 0'], ['hhhhhhhh', '1 8 0 0'], ['pppppppp', '1 8 0 0'], ['mmmmmmmm', '1 8 1 1'], ['mhhhhhhh', '1 8 1 0'], ['hhhhhhhm', '1 8 0 1']]);
    // Your notebook's termini check: GLY's NH3+ and PRO's PRO-NH2+ are what 0 picks.
    expect(r.sequences.slice(0, 4).map(x => [x.first.picks, x.last.picks, x.problems])).toEqual([['NH3+', 'COO-', []], ['GLY-NH3+', 'COO-', []], ['NH3+', 'COO-', []], ['PRO-NH2+', 'COO-', []]]);
    expect(r.sequences[4].problems).toEqual([
      'the N-terminus answer, 0, picks MET1 for MET, not NH3+ (MET1, NH3+, NH2, HYD1, 5TER, 5MET, 5PHO, 5POM, None)',
      'the C-terminus answer, 0, picks MET2 for MET, not COO- (MET2, COO-, COOH, CT2, CT1, HYD2, 3TER, None)',
    ]);
  });
  it('a sequence\'s own answers are its own: said, not a problem, unless past its menu', () => {
    const r = checkAnswers(MENUS, FF, '1 8 0 0', { mmmmmmmm: '1 8 1 1', hhhhhhhh: '1 8 1 1', pppppppp: '1 8 9 0' }, ['mmmmmmmm', 'hhhhhhhh', 'pppppppp']);
    expect(r.sequences.map(x => [x.own, x.answers, x.first.picks, x.problems])).toEqual([
      [true, '1 8 1 1', 'NH3+', []],
      [true, '1 8 1 1', 'NH2', []],
      [true, '1 8 9 0', null, ['the N-terminus answer, 9, is past PRO\'s menu (PRO-NH2+, NH3+, HYD1, MET1, 5TER, 5MET, 5PHO, 5POM, None)']],
    ]);
  });
  it('the plan\'s own answers: another force field, a water model, a terminus past the menu, a neutral NH2 on proline', () => {
    expect(checkAnswers({ ...MENUS, local: ['amber.ff', FF + '.ff'] }, FF, '1 8 0 0', {}, []).general).toEqual(['the first answer, 1, picks amber.ff, not ' + FF + ' (2)']);
    expect(checkAnswers(MENUS, FF, '3 1 0 0', {}, []).general).toEqual(['the first answer, 3, picks one of GROMACS\'s own force fields, not ' + FF + ' (1)']);
    expect(checkAnswers(MENUS, FF, '1 1 0 0', {}, []).water).toBe('tip3p');
    expect(checkAnswers(MENUS, FF, '1 9 0 9', {}, []).general).toEqual([
      'the second answer, 9, is no water model: the menu has 7 and None (8)',
      'the C-terminus answer, 9, is past the menu (COO-, COOH, CT2, CT1, HYD2, MET2, 3TER, None)',
    ]);
    expect(checkAnswers(MENUS, 'other', '1 8 0 0', {}, []).general).toEqual(['ff/ has no other.ff: pdb2gmx would not find it']);
    const neutral = checkAnswers(MENUS, FF, '1 8 1 1', {}, ['pppppppp', 'gggggggg']).sequences;
    expect(neutral.map(x => [x.want, x.problems])).toEqual([
      [null, ['PRO has no NH2 (N-terminus menu: PRO-NH2+, NH3+, HYD1, MET1, 5TER, 5MET, 5PHO, 5POM, None)']],
      ['1 8 1 1', []],
    ]);
  });
});

describe('POST /api/build/check reads the menus from the base folder\'s force field', () => {
  it('ff/<forcefield>.ff\'s .tdb files and watermodels.dat, and each sequence\'s answers; none without pdb2gmx in the build', () => {
    // The test base folder holds them (test/helpers.ts), as yours does.
    const base = baseFolder(), dir = join(base, 'ff', FF + '.ff');
    expect(forceFieldMenus(base, FF)).toEqual(MENUS);
    expect(forceFieldMenus(base, 'other')).toBeNull();
    // A force field folder with no terminus files: nothing to check against.
    mkdirSync(join(base, 'ff/bare.ff'));
    writeFileSync(join(base, 'ff/bare.ff/forcefield.itp'), '; bare\n');
    expect(forceFieldMenus(base, 'bare')).toBeNull();
    expect(forceFieldMenus(base, FF)!.local).toEqual(['bare.ff', FF + '.ff']);
    rmSync(join(base, 'ff/bare.ff'), { recursive: true });
    expect(readdirSync(dir).filter(f => f.endsWith('.tdb')).length).toBe(18);
    const systems = { methods: ['hmr+fast+6'], saccharides: ['o111'], sequences: ['hhhhhhhh', 'mmmmmmmm'], repeats: 0 };
    const r = checkInputs(base, DEFAULT_PLAN, systems).pdb2gmx!;
    expect(r.sequences.map(x => [x.sequence, x.want, x.problems.length])).toEqual([['hhhhhhhh', '1 8 0 0', 0], ['mmmmmmmm', '1 8 1 1', 2]]);
    const off = { ...DEFAULT_PLAN, stages: DEFAULT_PLAN.stages.map(s => (s.id === 'sb' ? { ...s, tiles: s.tiles.map(t => ({ ...t, on: t.type !== 'pdb2gmx' && t.on })) } : s)) };
    expect(checkInputs(base, off, systems).pdb2gmx).toBeNull();
  });
});
