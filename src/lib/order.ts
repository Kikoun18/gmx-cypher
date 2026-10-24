// `gmx order` (R16b): the order parameters of a lipid tail, one index group per carbon in tail order (question 27): the
// groups gmx-cypher writes to its index, in the order they are listed. For each carbon i gmx uses the vector from
// i−1 to i+1, so the first and the last give none. It reads every group of the index, asking nothing on stdin. Its own
// known issues: "This tool only works for saturated carbons and united atom force fields." Checked with GROMACS 2025.4;
// 2023.3's -h is the same.
import type { CommandOption } from './commands';
import { checkOptions, numberProblems, optionArgs, valueProblems } from './form';
import type { HelpOption } from './gmxText';
import { resultSeries, type Options } from './rdf';

/**
 * The options offered. -szonly is not: gmx then writes no S_CD (-od), the file the Matrix reads as Order parameters;
 * -sl goes with it. -permolecule, -radial and -calcdist are not offered either.
 */
export const ORDER_FORM: CommandOption[] = [
  { flag: 'd', group: 'what is measured', label: 'membrane normal', what: 'the axis S_CD is measured against' },
  { flag: 'b', group: 'frames', label: 'first', unit: 'ps', what: 'frames before this time are skipped' },
  { flag: 'e', group: 'frames', label: 'last', unit: 'ps', what: '0 = to the end of the trajectory' },
  { flag: 'dt', group: 'frames', label: 'every', unit: 'ps', what: 'one frame per this many ps; 0 = every frame' },
];

export const orderOptionProblems = (options: Options, help: HelpOption[]) => [...numberProblems(options, help, []), ...valueProblems(options, ORDER_FORM, help)];

export type OrderIo = { trajectory: string; runInput: string; index: string; output: string; tensor: string };

/** The argument list: the files (-o is always written, so gmx-cypher names it), then the options that differ. */
export function orderArgv(r: { options: Options }, io: OrderIo, help: HelpOption[]): string[] {
  const form = checkOptions('order', ORDER_FORM, r.options, help);
  return ['order', '-f', io.trajectory, '-s', io.runInput, '-n', io.index, '-o', io.tensor, '-od', io.output, ...optionArgs(form, r.options, help)];
}

/** S_CD (-od) the result, the order tensor's diagonal (-o) beside it. */
export const orderNames = (stem: string) => ({ xvg: stem + '.xvg', ndx: stem + '.ndx', record: stem + '.run.json', more: [stem + '_tensor.xvg'] });
export const ORDER_SUFFIXES = ['_tensor.xvg'];

/** S_CD by carbon: gmx numbers the inner carbons from 1, so its n-th is the group after the n-th; past them, gmx's number. */
export function scdByCarbon(text: string, carbons: string[]): { carbon: string; n: number; scd: number }[] {
  return (resultSeries(text)[0]?.points ?? []).map(([n, scd]) => ({ carbon: n >= 1 && n < carbons.length - 1 ? carbons[n] : 'carbon ' + n, n, scd }));
}
