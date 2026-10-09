// The GROMACS commands gmx-cypher runs (R3a, T98): one definition each. A definition says what the command takes,
// which options it offers, what its files are called and how its argument list is built. Code is written only where
// a command really differs. RDF is the first; energy (R4) is the second, and the rest come as their own definitions.
import type { HelpOption } from './gmxText';
import { ENERGY_FORM, energyArgv, energyOptionProblems, energyStdin } from './energy';
import { outputNames } from './names';
import { FORM, rdfArgs, rdfIo, recipeProblems, relPath, type Options, type RdfIo } from './rdf';

export type InputSlot = 'trajectory' | 'runInput' | 'structure' | 'index' | 'edr';
/** A command's gmx paths by name, relative to its working directory (T29). */
export type RunIo = Record<string, string>;
export interface CommandOption { flag: string; group: string; label: string; unit?: string; what: string }
export interface OutputNames { xvg: string; record: string; cn?: string; ndx?: string }

/** What a command needs, as the picker groups them (R3b). */
export type Section = 'trajectory and groups' | 'an energy file' | 'window lists';
const SECTIONS: Section[] = ['trajectory and groups', 'an energy file', 'window lists'];

export interface CommandDef {
  /** The gmx tool, as typed after `gmx`. */
  tool: string;
  /** One line for the picker. */
  title: string;
  section: Section;
  /** The inputs the command asks for, in the order the inputs step shows them. */
  inputs: InputSlot[];
  /** The inputs a run cannot start without. The first names the folder of its outputs: `<its folder>/<tool>`. */
  required: InputSlot[];
  /** Whether it takes atom groups (a reference and selections, picked in 3D). */
  groups: boolean;
  /** The options it offers, each with a note; the rest of gmx's options are not offered. */
  options: CommandOption[];
  /** The file names of one run, from its stem. */
  outputNames(stem: string): OutputNames;
  /**
   * Each file a run writes: the PMF Sequences type it lands as (section 3), or null with the reason it has none,
   * and whether "send to vault" sends it. Checked against PMF Sequences' own detectAna on real output (tests).
   */
  outputs: { file: 'xvg' | 'cn'; type: string | null; vault: boolean; why?: string }[];
  /** The paths gmx is given and the directory it runs in, for the outputs in `outDir`. */
  io(paths: Partial<Record<InputSlot, string>>, outDir: string, stem: string): { cwd: string; io: RunIo };
  /** What gmx would refuse, in words, before anything runs. */
  problems(options: Options, help: HelpOption[]): string[];
  /** The argument list, as gmx is given it. */
  argv(request: { options: Options; selections: number }, io: RunIo, help: HelpOption[]): string[];
  /** The answers gmx reads on stdin, for a command that asks questions (T99): from the terms picked by number. */
  stdin?(terms: number[]): string;
}

export const rdfCommand: CommandDef = {
  tool: 'rdf',
  title: 'radial distribution, g(r) per selection',
  section: 'trajectory and groups',
  inputs: ['trajectory', 'runInput', 'structure', 'index'],
  required: ['trajectory', 'runInput'],
  groups: true,
  options: FORM,
  outputNames,
  outputs: [
    { file: 'xvg', type: 'rdf', vault: true },
    { file: 'cn', type: null, vault: false, why: 'PMF Sequences reads its title "Cumulative Number RDF" as another RDF (T35)' },
  ],
  io: (p, outDir, stem) => rdfIo({ trajectory: p.trajectory ?? '', runInput: p.runInput ?? '' }, outDir, stem),
  problems: recipeProblems,
  argv: (r, io, help) => rdfArgs(r, io as RdfIo, help),
};

/** gmx energy (R4): its terms come on stdin as numbers, its statistics on stdout; no groups. */
export const energyCommand: CommandDef = {
  tool: 'energy',
  title: 'terms over time, with their statistics',
  section: 'an energy file',
  // The run input is optional (section 11): given, it goes in as -s.
  inputs: ['edr', 'runInput'],
  required: ['edr'],
  groups: false,
  options: ENERGY_FORM,
  outputNames: stem => ({ xvg: stem + '.xvg', record: stem + '.run.json' }),
  // Typed Energy by its name only: its title "GROMACS Energies" misses PMF Sequences' keyword (T103).
  outputs: [{ file: 'xvg', type: 'energy', vault: true, why: 'typed from its file name, which must contain "energy"' }],
  io: (p, outDir, stem) => {
    const edr = p.edr ?? '', cwd = edr.slice(0, edr.lastIndexOf('/')) || '/';
    return { cwd, io: { edr: relPath(cwd, edr), ...(p.runInput ? { tpr: relPath(cwd, p.runInput) } : {}), output: relPath(cwd, outDir + '/' + stem + '.xvg') } };
  },
  problems: energyOptionProblems,
  argv: (r, io, help) => energyArgv(r, io as { edr: string; tpr?: string; output: string }, help),
  stdin: energyStdin,
};

export const COMMANDS: CommandDef[] = [rdfCommand, energyCommand];
export const commandOf = (tool: string) => COMMANDS.find(c => c.tool === tool);

/** What a draft holds of commands: the picked one, its options, and the options of the others, kept aside. */
export interface CommandDraft { analysis?: string; options: Options; optionsBy?: Record<string, Options> }

/**
 * The draft with another command picked: the options of the one left are kept aside, and the new one's come back.
 * Options never cross commands: RDF's -bin is no option of gmx energy, and energy's -sum none of gmx rdf (review finding 1).
 */
export function withCommand<D extends CommandDraft>(d: D, tool: string): D {
  const from = d.analysis ?? 'rdf';
  if (from === tool) return d;
  const { [tool]: options = {}, ...others } = { ...d.optionsBy, [from]: d.options };
  return { ...d, analysis: tool, options, optionsBy: others };
}

/** The commands grouped by what they need, in the picker's order; a section without commands is left out. */
export const sectionsOf = (commands: CommandDef[] = COMMANDS) =>
  SECTIONS.map(section => ({ section, commands: commands.filter(c => c.section === section) })).filter(s => s.commands.length > 0);
