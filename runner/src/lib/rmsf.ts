// `gmx rmsf` (R9b): the fluctuation of each atom (or residue, -res) of one group around its average position, after a
// fit of the group onto the run input's structure (-fit, on by default). It asks for the group on stdin. Its x is the
// atom's number in the system (or the residue's), not its place in the group (checked with 2025.4: sodium is 31–42).
import type { CommandOption } from './commands';
import { checkOptions, numberProblems, optionArgs } from './form';
import type { HelpOption } from './gmxText';
import type { Options } from './rdf';

/** The options offered; -oq, -ox and the other files are not (no vault type, and PDB files). */
export const RMSF_FORM: CommandOption[] = [
  { flag: 'res', group: 'what is measured', label: 'per residue', what: "each residue's average over its atoms; off: per atom" },
  { flag: 'fit', group: 'what is measured', label: 'fit first', what: "each frame fitted onto the run input's structure; off: the fluctuation includes the group's own motion" },
  { flag: 'b', group: 'frames', label: 'first', unit: 'ps', what: 'frames before this time are skipped' },
  { flag: 'e', group: 'frames', label: 'last', unit: 'ps', what: '0 = to the end of the trajectory' },
  { flag: 'dt', group: 'frames', label: 'every', unit: 'ps', what: 'one frame per this many ps; 0 = every frame' },
];

export const rmsfOptionProblems = (options: Options, help: HelpOption[]) => numberProblems(options, help, []);

export type RmsfIo = { trajectory: string; runInput: string; index: string; output: string };

/** The argument list: the files, then the options that differ (gmx rmsf has no -tu: its x is atoms or residues). */
export function rmsfArgv(r: { options: Options }, io: RmsfIo, help: HelpOption[]): string[] {
  const form = checkOptions('rmsf', RMSF_FORM, r.options, help);
  return ['rmsf', '-f', io.trajectory, '-s', io.runInput, '-n', io.index, '-o', io.output, ...optionArgs(form, r.options, help)];
}

/** Its one prompt: the group, number 0 of its index. */
export const rmsfStdin = () => '0\n';
