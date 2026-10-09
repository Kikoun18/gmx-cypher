// The GROMACS commands gmx-cypher runs (R3a, T98): one definition each. A definition says what the command takes,
// which options it offers, what its files are called and how its argument list is built. Code is written only where
// a command really differs. RDF is the first; the rest come as their own definitions.
import type { HelpOption } from './gmxText';
import { FORM, rdfArgs, recipeProblems, type Options, type RdfIo } from './rdf';
import { outputNames } from './names';

export type InputSlot = 'trajectory' | 'runInput' | 'structure' | 'index';
export interface CommandOption { flag: string; group: string; label: string; unit?: string; what: string }

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
  /** Whether it takes atom groups (a reference and selections, picked in 3D). */
  groups: boolean;
  /** The options it offers, each with a note; the rest of gmx's options are not offered. */
  options: CommandOption[];
  /** The file names of one run, from its stem. */
  outputNames(stem: string): ReturnType<typeof outputNames>;
  /** What gmx would refuse, in words, before anything runs. */
  problems(options: Options, help: HelpOption[]): string[];
  /** The argument list, as gmx is given it. */
  argv(request: { options: Options; selections: number }, io: RdfIo, help: HelpOption[]): string[];
}

export const rdfCommand: CommandDef = {
  tool: 'rdf',
  title: 'radial distribution, g(r) per selection',
  section: 'trajectory and groups',
  inputs: ['trajectory', 'runInput', 'structure', 'index'],
  groups: true,
  options: FORM,
  outputNames,
  problems: recipeProblems,
  argv: rdfArgs,
};

export const COMMANDS: CommandDef[] = [rdfCommand];
export const commandOf = (tool: string) => COMMANDS.find(c => c.tool === tool);

/** The commands grouped by what they need, in the picker's order; a section without commands is left out. */
export const sectionsOf = (commands: CommandDef[] = COMMANDS) =>
  SECTIONS.map(section => ({ section, commands: commands.filter(c => c.section === section) })).filter(s => s.commands.length > 0);
