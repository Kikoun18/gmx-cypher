// The GROMACS commands gmx-cypher runs (R3a, T98): one definition each. A definition says what the command takes,
// which options it offers, what its files are called and how its argument list is built. Code is written only where
// a command really differs. RDF is the first; energy (R4) and awh (R5) follow, and the rest come as their own definitions.
import { AWH_FORM, awhArgv, awhOptionProblems } from './awh';
import { WHAM_FORM, whamArgv, whamOptionProblems, whamOutputNames, type WhamIo } from './wham';
import type { HelpOption } from './gmxText';
import { ENERGY_FORM, energyArgv, energyOptionProblems, energyStdin } from './energy';
import { outputNames } from './names';
import { FORM, rdfArgs, rdfIo, recipeProblems, relPath, type Options, type RdfIo } from './rdf';

export type InputSlot = 'trajectory' | 'runInput' | 'structure' | 'index' | 'edr';
/** A command's gmx paths by name, relative to its working directory (T29). */
export type RunIo = Record<string, string>;
export interface CommandOption { flag: string; group: string; label: string; unit?: string; what: string }
/** A run's files: `xvg` is the one sent to the vault; `more` are further .xvg files (gmx awh's earlier frames, R5). */
export interface OutputNames { xvg: string; record: string; cn?: string; ndx?: string; more?: string[] }

/** Every file name of a run, for the checks that nothing of the stem exists yet. */
export const allNames = (n: OutputNames) => [n.xvg, n.record, n.cn, n.ndx, ...(n.more ?? [])].filter((x): x is string => !!x);

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
  outputs: { file: 'xvg' | 'cn' | 'profile'; type: string | null; vault: boolean; why?: string }[];
  /** The paths gmx is given and the directory it runs in, for the outputs in `outDir`. */
  io(paths: Partial<Record<InputSlot, string>>, outDir: string, stem: string): { cwd: string; io: RunIo };
  /** What gmx would refuse, in words, before anything runs. */
  problems(options: Options, help: HelpOption[]): string[];
  /** The argument list, as gmx is given it. */
  argv(request: { options: Options; selections: number; pull?: 'pullx' | 'pullf' }, io: RunIo, help: HelpOption[]): string[];
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

/**
 * gmx awh (R5): the PMF of each stored frame, from the energy file and its run input. Its files are `<stem>_t<time>.xvg`;
 * which frames are written follows from a scan of the file (server/awh.ts), so the planner names them, not this definition.
 */
export const awhCommand: CommandDef = {
  tool: 'awh',
  title: 'AWH free-energy profiles (PMF), by time',
  section: 'an energy file',
  inputs: ['edr', 'runInput'],
  required: ['edr', 'runInput'],
  groups: false,
  options: AWH_FORM,
  outputNames: stem => ({ xvg: stem + '.xvg', record: stem + '.run.json' }),
  // Typed PMF from its header (tool gmx awh, title AWH), whatever its name; the last frame goes to the vault.
  outputs: [{ file: 'xvg', type: 'pmf', vault: true }],
  io: (p, outDir, stem) => {
    const edr = p.edr ?? '', cwd = edr.slice(0, edr.lastIndexOf('/')) || '/';
    return { cwd, io: { edr: relPath(cwd, edr), tpr: relPath(cwd, p.runInput ?? ''), output: relPath(cwd, outDir + '/' + stem + '.xvg') } };
  },
  problems: awhOptionProblems,
  argv: (r, io, help) => awhArgv(r, io as { edr: string; tpr: string; output: string }, help),
};

/**
 * gmx wham (R6): umbrella windows from lists gmx-cypher writes (a run input and a pull file per window, found with a
 * folder template). No input slots: the windows are its inputs, and the folder that holds them all names the run.
 */
export const whamCommand: CommandDef = {
  tool: 'wham',
  title: 'umbrella windows: the profile, its histograms and their overlap',
  section: 'window lists',
  inputs: [],
  required: [],
  groups: false,
  options: WHAM_FORM,
  outputNames: stem => whamOutputNames(stem, false),
  outputs: [
    { file: 'xvg', type: 'hist', vault: true, why: 'the histograms, typed Histogram by their title; sent by default (question 28)' },
    { file: 'profile', type: null, vault: false, why: 'PMF Sequences reads it as a Histogram (its title "Umbrella potential" has its keyword), and as a PMF it would get the AWH correction (+2kT ln r, tail at 0): not sent until you decide (question 28)' },
  ],
  io: (_p, outDir, stem) => {
    const cwd = outDir.slice(0, outDir.lastIndexOf('/')) || '/', out = (f: string) => relPath(cwd, outDir + '/' + stem + f);
    return { cwd, io: { tpr: out('_tpr-files.dat'), pull: out('_pull-files.dat'), profile: out('_profile.xvg'), hist: out('_histo.xvg'), bsres: out('_bsres.xvg'), bsprof: out('_bsprof.xvg') } };
  },
  problems: whamOptionProblems,
  argv: (r, io, help) => whamArgv({ options: r.options, pull: r.pull ?? 'pullx' }, io as WhamIo, help),
};

export const COMMANDS: CommandDef[] = [rdfCommand, energyCommand, awhCommand, whamCommand];
export const commandOf = (tool: string) => COMMANDS.find(c => c.tool === tool);

/** What a draft holds of commands: the picked one, its options and name template, and the others', kept aside. */
export interface CommandDraft { analysis?: string; options: Options; optionsBy?: Record<string, Options>; template?: string; templateBy?: Record<string, string | undefined> }

/**
 * The draft with another command picked: the options and template of the one left are kept aside, and the new one's
 * come back. They never cross commands: RDF's -bin is no option of gmx energy, energy's -sum none of gmx rdf (review
 * finding 1), and an AWH stem typed for PMF Sequences (`hmrfast6_ha_WRWYCR`) must not name an RDF run.
 */
export function withCommand<D extends CommandDraft>(d: D, tool: string): D {
  const from = d.analysis ?? 'rdf';
  if (from === tool) return d;
  const { [tool]: options = {}, ...others } = { ...d.optionsBy, [from]: d.options };
  const { [tool]: template, ...templates } = { ...d.templateBy, [from]: d.template };
  return { ...d, analysis: tool, options, optionsBy: others, template, templateBy: templates };
}

/** The commands grouped by what they need, in the picker's order; a section without commands is left out. */
export const sectionsOf = (commands: CommandDef[] = COMMANDS) =>
  SECTIONS.map(section => ({ section, commands: commands.filter(c => c.section === section) })).filter(s => s.commands.length > 0);
