// The four inputs of a run, and what picking a trajectory suggests for the others (T12).

export type Role = 'trajectory' | 'run input' | 'structure' | 'index';
export type Slot = 'trajectory' | 'runInput' | 'structure' | 'index';

const EXT: Record<string, Role | 'output'> = {
  '.xtc': 'trajectory', '.trr': 'trajectory', '.tng': 'trajectory', '.tpr': 'run input',
  '.gro': 'structure', '.pdb': 'structure', '.ndx': 'index', '.xvg': 'output',
};

const ext = (name: string) => { const i = name.lastIndexOf('.'); return i > 0 ? name.slice(i).toLowerCase() : ''; };
const stem = (name: string) => { const i = name.lastIndexOf('.'); return i > 0 ? name.slice(0, i) : name; };

/** What a file is to the runner, by its extension; null for anything else. */
export const inputRole = (name: string): Role | 'output' | null => EXT[ext(name)] ?? null;

export interface Suggestion { name: string; why: string }

/**
 * Picking `trajectory` (a name in `here`) suggests the run input, structure and index: the same stem first,
 * else the only one of its kind in the folder. For the index: the same name, index.ndx here, index.ndx in the
 * folder above (`parent`, as your commands use `-n ../index.ndx`), then a lone .ndx here. Two candidates: no guess.
 */
export function suggestInputs(trajectory: string, here: string[], parent: string[]): Partial<Record<Exclude<Slot, 'trajectory'>, Suggestion>> {
  const s = stem(trajectory), out: Partial<Record<Exclude<Slot, 'trajectory'>, Suggestion>> = {};
  const pick = (exts: string[], kind: string): Suggestion | undefined => {
    for (const e of exts) if (here.includes(s + e)) return { name: s + e, why: 'same name as the trajectory' };
    const all = here.filter(n => exts.includes(ext(n)) && n !== trajectory);
    return all.length === 1 ? { name: all[0], why: 'the only ' + kind + ' in the folder' } : undefined;
  };
  const runInput = pick(['.tpr'], '.tpr');
  const structure = ['.gro', '.pdb'].includes(ext(trajectory)) ? { name: trajectory, why: 'the trajectory itself' } : pick(['.gro', '.pdb'], 'structure');
  const index = here.includes(s + '.ndx') ? { name: s + '.ndx', why: 'same name as the trajectory' }
    : here.includes('index.ndx') ? { name: 'index.ndx', why: 'index.ndx in the same folder' }
    // Before a lone .ndx here: tools write index files next to their outputs (gmx hbond -hbn).
    : parent.includes('index.ndx') ? { name: '../index.ndx', why: 'index.ndx in the folder above' }
    : pick(['.ndx'], '.ndx');
  if (runInput) out.runInput = runInput;
  if (structure) out.structure = structure;
  if (index) out.index = index;
  return out;
}
