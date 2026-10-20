// `gmx density` (R16a): the density of each group along one box axis, in slices. It asks for its groups on stdin: with
// -center (or -symm, which turns it on) first the group to centre on, then -ng groups. gmx-cypher centres on the first
// group. Every rule here was checked with GROMACS 2025.4 on the test system; 2023.3's -h is the same.
import type { CommandOption } from './commands';
import { checkOptions, numberProblems, optionArgs, valueProblems } from './form';
import type { HelpOption } from './gmxText';
import type { Options } from './rdf';

/** The options offered. Electron density is offered only once an electrons file is given: gmx stops without one. */
export const DENSITY_FORM: CommandOption[] = [
  { flag: 'd', group: 'profile', label: 'axis', what: 'X, Y or Z: the profile along this box axis (a bilayer\'s normal)' },
  { flag: 'sl', group: 'profile', label: 'slices', what: 'the box cut into this many slices along the axis' },
  { flag: 'dens', group: 'profile', label: 'density', what: 'mass (kg m⁻³), number or charge (per nm³), or electron (with an electrons file)', only: { electron: 'ei' } },
  { flag: 'ei', group: 'profile', label: 'electrons file', what: 'the whole path of a file giving the electrons of each atom name (gmx density -h shows its form)' },
  { flag: 'center', group: 'centring', label: 'centre on the first group', what: 'each frame binned around the first group\'s centre, from −box/2 to +box/2: a bilayer stays put while the box breathes' },
  { flag: 'symm', group: 'centring', label: 'symmetrise', what: 'the profile made symmetric around the centre (centres too)' },
  { flag: 'b', group: 'frames', label: 'first', unit: 'ps', what: 'frames before this time are skipped' },
  { flag: 'e', group: 'frames', label: 'last', unit: 'ps', what: '0 = to the end of the trajectory' },
  { flag: 'dt', group: 'frames', label: 'every', unit: 'ps', what: 'one frame per this many ps; 0 = every frame' },
];

export function densityOptionProblems(options: Options, help: HelpOption[]): string[] {
  const p = [...numberProblems(options, help, ['sl'], ['sl'], ['sl']), ...valueProblems(options, DENSITY_FORM, help)];
  const d = options.d, ei = typeof options.ei === 'string' ? options.ei.trim() : '', electron = options.dens === 'electron';
  if (d !== undefined && d !== '' && !['X', 'Y', 'Z'].includes(String(d).toUpperCase())) p.push('-d: X, Y or Z');
  if (electron && !ei) p.push('electron density needs an electrons file (-ei): the number of electrons of each atom name');
  else if (!electron && ei) p.push('an electrons file is read only for electron density: choose it, or clear the file');
  else if (ei && !ei.startsWith('/')) p.push('-ei: the whole path of the electrons file (gmx runs in the output\'s folder)');
  return p;
}

export type DensityIo = { trajectory: string; runInput: string; index: string; output: string };

/** The argument list: the files, -ng for more than one group, the options that differ (-ei with electron density). */
export function densityArgv(r: { options: Options; selections: number }, io: DensityIo, help: HelpOption[]): string[] {
  const form = checkOptions('density', DENSITY_FORM, r.options, help), groups = r.selections + 1;
  return ['density', '-f', io.trajectory, '-s', io.runInput, '-n', io.index, '-o', io.output, ...(groups > 1 ? ['-ng', String(groups)] : []), ...optionArgs(form, r.options, help)];
}

/** Its prompts, answered by number: the group to centre on when centring (the first, 0), then each group (0, 1, …). */
export const densityStdin = (selections: number, options: Options) =>
  [...(options.center === true || options.symm === true ? ['0'] : []), ...Array.from({ length: selections + 1 }, (_, i) => String(i))].join('\n') + '\n';
