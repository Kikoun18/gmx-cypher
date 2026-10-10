// `gmx rms` (R9a): the RMSD of each group over time, after a least-squares fit of the fit group onto the run input's
// structure (-s). It asks for its groups on stdin: the fit group, then the groups to measure (-ng of them). The fit
// group is always the first measured: the usual "fit on the backbone, RMSD of the backbone"; each further group is
// measured after the same fit. Every rule here was checked with GROMACS 2025.4 on the test system.
import type { CommandOption } from './commands';
import { checkOptions, numberProblems, optionArgs, valueProblems } from './form';
import type { HelpOption } from './gmxText';
import type { Options } from './rdf';

/** The options offered, in the form's order; -what stays rmsd (PMF Sequences' RMSD type), -tu ps and -xvg xmgrace. */
export const RMS_FORM: CommandOption[] = [
  { flag: 'fit', group: 'fit', label: 'fit', what: "onto the run input's structure: rotation and translation, translation only, or none" },
  { flag: 'mw', group: 'fit', label: 'mass-weighted fit', what: 'masses from the run input' },
  { flag: 'prev', group: 'fit', label: 'against an earlier frame', what: "0 = against the run input's structure; N = the frame N frames before each one" },
  { flag: 'b', group: 'frames', label: 'first', unit: 'ps', what: 'frames before this time are skipped' },
  { flag: 'e', group: 'frames', label: 'last', unit: 'ps', what: '0 = to the end of the trajectory' },
  { flag: 'dt', group: 'frames', label: 'every', unit: 'ps', what: 'one frame per this many ps; 0 = every frame' },
];

/** What gmx rms would refuse among the options, in words. */
export const rmsOptionProblems = (options: Options, help: HelpOption[]) => [...numberProblems(options, help, ['prev'], [], ['prev']), ...valueProblems(options, RMS_FORM, help)];

export type RmsIo = { trajectory: string; runInput: string; index: string; output: string };

/** The argument list: the files, -ng when more than the fit group is measured, then the options that differ. */
export function rmsArgv(r: { options: Options; selections: number }, io: RmsIo, help: HelpOption[]): string[] {
  const form = checkOptions('rms', RMS_FORM, r.options, help);
  return ['rms', '-f', io.trajectory, '-s', io.runInput, '-n', io.index, '-o', io.output, ...(r.selections ? ['-ng', String(r.selections + 1)] : []), ...optionArgs(form, r.options, help)];
}

/**
 * Its prompts, answered by number in its own index: the fit group (0), then the groups measured (0, 1, …). With
 * `-fit none` gmx asks for no fit group (2025.4, checked): an answer for it would shift every group by one (review).
 */
export const rmsStdin = (selections: number, options: Options = {}) =>
  [...(options.fit === 'none' ? [] : ['0']), ...Array.from({ length: selections + 1 }, (_, i) => String(i))].join('\n') + '\n';
