// `gmx mindist` (R9d): the minimum distance between the reference and each other group over time, and with -on the
// number of their atom pairs within -d. It asks for its groups on stdin: the reference, then -ng groups. Every rule
// here was checked with GROMACS 2025.4 on the test system.
import type { CommandOption } from './commands';
import { checkOptions, numberProblems, optionArgs, valueProblems } from './form';
import type { HelpOption } from './gmxText';
import type { Options } from './rdf';

/** The options offered; `contacts` switches -on on and gmx-cypher names its file. -pi, -max, -or and -ox are not offered. */
export const MINDIST_FORM: CommandOption[] = [
  { flag: 'contacts', group: 'contacts', label: 'contacts too', what: 'the number of atom pairs within the contact distance, over time: a second file, not sent to the vault (the Matrix gives it no type)', switch: 'on' },
  { flag: 'd', group: 'contacts', label: 'contact distance', unit: 'nm', what: 'pairs closer than this count as contacts' },
  { flag: 'group', group: 'contacts', label: 'one per atom of the other group', what: 'an atom of the other group near several atoms of the reference counts once' },
  { flag: 'b', group: 'frames', label: 'first', unit: 'ps', what: 'frames before this time are skipped' },
  { flag: 'e', group: 'frames', label: 'last', unit: 'ps', what: '0 = to the end of the trajectory' },
  { flag: 'dt', group: 'frames', label: 'every', unit: 'ps', what: 'one frame per this many ps; 0 = every frame' },
  { flag: 'pbc', group: 'periodic boundaries', label: 'periodic boundaries', what: 'distances across the box edges' },
];

export const mindistOptionProblems = (options: Options, help: HelpOption[]) => [...numberProblems(options, help, ['d'], ['d']), ...valueProblems(options, MINDIST_FORM, help)];

export type MindistIo = { trajectory: string; runInput: string; index: string; output: string; contacts: string };

/** The argument list: the files, -on when contacts are asked for, -ng for more than one group, the options that differ. */
export function mindistArgv(r: { options: Options; selections: number }, io: MindistIo, help: HelpOption[]): string[] {
  const form = checkOptions('mindist', MINDIST_FORM, r.options, help);
  return ['mindist', '-f', io.trajectory, '-s', io.runInput, '-n', io.index, '-od', io.output, ...(r.options.contacts === true ? ['-on', io.contacts] : []),
    ...(r.selections > 1 ? ['-ng', String(r.selections)] : []), ...optionArgs(form, r.options, help)];
}

/** Its prompts ("Select a group:"), answered by number: the reference (0), then each other group (1, 2, …). */
export const mindistStdin = (selections: number) => Array.from({ length: selections + 1 }, (_, i) => String(i)).join('\n') + '\n';

export const mindistNames = (stem: string, options: Options) =>
  ({ xvg: stem + '.xvg', ndx: stem + '.ndx', record: stem + '.run.json', ...(options.contacts === true ? { more: [stem + '_contacts.xvg'] } : {}) });
export const MINDIST_SUFFIXES = ['_contacts.xvg'];
