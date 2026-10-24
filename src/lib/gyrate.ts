// `gmx gyrate` (R9c): the radius of gyration of one group over time, in total and about the x, y and z axes. Two tools
// under GROMACS's names, as for H-bonds (T122): the selection tool (`gmx gyrate` from 2024; -sel) and the legacy one
// (`gmx gyrate-legacy` from 2024, and `gmx gyrate` before it: 2023.3 checked; its group asked on stdin). Each keeps its
// own options. On one molecule they agree to the last digit; on a group of several molecules they don't (2025.4, the
// fixtures): their criteria are never mixed.
import type { CommandOption } from './commands';
import { checkOptions, numberProblems, optionArgs, valueProblems } from './form';
import type { HelpOption } from './gmxText';
import type { Options } from './rdf';

/** Which tool a `gmx <name> -h` describes: -sel a selection (the selection tool), -nmol (legacy), or neither. */
export function gyrateKind(help: HelpOption[]): 'selection' | 'legacy' | null {
  const by = new Map(help.map(o => [o.flag, o]));
  if (by.get('sel')?.type === 'selection' && by.has('mode')) return 'selection';
  if (by.get('nmol')?.type === 'int' && !by.has('sel')) return 'legacy';
  return null;
}

const FRAMES: CommandOption[] = [
  { flag: 'b', group: 'frames', label: 'first', unit: 'ps', what: 'frames before this time are skipped' },
  { flag: 'e', group: 'frames', label: 'last', unit: 'ps', what: '0 = to the end of the trajectory' },
  { flag: 'dt', group: 'frames', label: 'every', unit: 'ps', what: 'one frame per this many ps; 0 = every frame' },
];

/** The selection tool's options. */
export const GYRATE_FORM: CommandOption[] = [
  { flag: 'mode', group: 'weighting', label: 'atoms weighted by', what: 'mass (the usual radius of gyration), charge, or geometry (each atom alike)' },
  ...FRAMES,
  { flag: 'rmpbc', group: 'periodic boundaries', label: 'make molecules whole', what: 'from the run input, in every frame' },
];

/** The legacy tool's options: mass weighting unless -q; -p, -moi and -nmol change what is written and are not offered. */
export const GYRATE_LEGACY_FORM: CommandOption[] = [
  { flag: 'q', group: 'weighting', label: 'weighted by charge', what: "each atom's charge, as an absolute value; off: by mass" },
  ...FRAMES,
];

/** What either tool would refuse: its numbers, and values outside its own form (each tool's, by `form`). */
export const gyrateOptionProblems = (form: CommandOption[]) => (options: Options, help: HelpOption[]) => [...numberProblems(options, help, []), ...valueProblems(options, form, help)];

export type GyrateIo = { trajectory: string; runInput: string; index: string; output: string };

/** The selection tool: the group by number (T17) as its one selection; it takes no more (2025.4: "Too many values"). */
export function gyrateArgv(r: { options: Options }, io: GyrateIo, help: HelpOption[]): string[] {
  const form = checkOptions('gyrate', GYRATE_FORM, r.options, help);
  return ['gyrate', '-f', io.trajectory, '-s', io.runInput, '-n', io.index, '-o', io.output, ...optionArgs(form, r.options, help), '-sel', 'group 0'];
}

/** The legacy tool: its group answered on stdin (gyrateLegacyStdin). gmx-cypher sets argv[0] to the tool found. */
export function gyrateLegacyArgv(r: { options: Options }, io: GyrateIo, help: HelpOption[]): string[] {
  const form = checkOptions('gyrate-legacy', GYRATE_LEGACY_FORM, r.options, help);
  return ['gyrate-legacy', '-f', io.trajectory, '-s', io.runInput, '-n', io.index, '-o', io.output, ...optionArgs(form, r.options, help)];
}
export const gyrateLegacyStdin = () => '0\n';
