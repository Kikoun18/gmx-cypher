import { describe, expect, it } from 'vitest';
import { inputRole, suggestInputs } from '../src/lib/inputs';

describe('what a file is', () => {
  it.each([
    ['07_md.xtc', 'trajectory'], ['run.trr', 'trajectory'], ['a.TNG', 'trajectory'], ['nvt.tpr', 'run input'],
    ['nvt.gro', 'structure'], ['test.pdb', 'structure'], ['index.ndx', 'index'], ['rdf.xvg', 'output'], ['notes.pdf', null], ['nvt.edr', 'energy file'],
  ])('%s → %s', (name, role) => expect(inputRole(name)).toBe(role));
});

describe('picking a trajectory suggests the rest', () => {
  it.each([
    {
      case: 'your test system: the same name, and index.ndx',
      traj: 'nvt.xtc', here: ['index.ndx', 'nvt.edr', 'nvt.gro', 'nvt.log', 'nvt.tpr', 'nvt.xtc'], parent: [],
      want: { runInput: ['nvt.tpr', 'same name as the trajectory'], structure: ['nvt.gro', 'same name as the trajectory'], index: ['index.ndx', 'index.ndx in the same folder'] },
    },
    {
      case: 'your cluster layout: the index one folder up, as in your gmx commands (-n ../index.ndx)',
      traj: '07_md.xtc', here: ['07_md.gro', '07_md.tpr', '07_md.xtc'], parent: ['07_md', 'index.ndx'],
      want: { runInput: ['07_md.tpr', 'same name as the trajectory'], structure: ['07_md.gro', 'same name as the trajectory'], index: ['../index.ndx', 'index.ndx in the folder above'] },
    },
    {
      case: 'index.ndx one folder up beats an index some other tool wrote here (gmx hbond -hbn)',
      traj: '07_md.xtc', here: ['07.md_hbindex_protein_sugar.ndx', '07_md.tpr', '07_md.xtc'], parent: ['07_md', 'index.ndx'],
      want: { runInput: ['07_md.tpr', 'same name as the trajectory'], index: ['../index.ndx', 'index.ndx in the folder above'] },
    },
    {
      case: 'other names: the only one of its kind in the folder',
      traj: 'traj_comp.xtc', here: ['confout.gro', 'topol.tpr', 'traj_comp.xtc', 'groups.ndx'], parent: [],
      want: { runInput: ['topol.tpr', 'the only .tpr in the folder'], structure: ['confout.gro', 'the only structure in the folder'], index: ['groups.ndx', 'the only .ndx in the folder'] },
    },
    {
      case: 'an index with the same name wins over index.ndx',
      traj: 'md.xtc', here: ['index.ndx', 'md.ndx', 'md.pdb', 'md.tpr', 'md.xtc'], parent: [],
      want: { runInput: ['md.tpr', 'same name as the trajectory'], structure: ['md.pdb', 'same name as the trajectory'], index: ['md.ndx', 'same name as the trajectory'] },
    },
    {
      case: 'two run inputs and two structures: nothing is guessed',
      traj: 'md.xtc', here: ['a.gro', 'a.tpr', 'b.gro', 'b.tpr', 'md.xtc'], parent: ['index.ndx'],
      want: { index: ['../index.ndx', 'index.ndx in the folder above'] },
    },
    {
      case: 'a .gro trajectory is its own structure',
      traj: 'frames.gro', here: ['frames.gro', 'topol.tpr'], parent: [],
      want: { runInput: ['topol.tpr', 'the only .tpr in the folder'], structure: ['frames.gro', 'the trajectory itself'] },
    },
  ])('$case', ({ traj, here, parent, want }) => {
    const got = suggestInputs(traj, here, parent);
    expect(Object.fromEntries(Object.entries(got).map(([k, v]) => [k, [v!.name, v!.why]]))).toEqual(want);
  });
});
