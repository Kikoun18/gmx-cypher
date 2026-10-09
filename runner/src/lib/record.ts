// The run record (R5, T31): one JSON file next to the outputs that says exactly what ran, on what, with
// which groups and options, and what it wrote. It goes back into the form for "run again" (section 11.4).

import { toRanges, type Atom } from './atoms';
import type { HelpOption } from './gmxText';
import { groupAtoms, type Group } from './groups';
import type { Slot } from './inputs';
import type { Progress } from './progress';
import { commandOf } from './commands';
import type { EnergyStats } from './energy';
import { FORM, isDefault, type Options } from './rdf';

export interface FileInfo { path: string; size: number; mtime: string; sha256?: string }
/** A file a run wrote: an .xvg, RDF's cumulative number and index, or gmx wham's window lists (R6). */
export interface Output { kind: 'xvg' | 'cn' | 'ndx' | 'list'; path: string; size: number; sha256: string }
type Status = 'running' | 'done' | 'failed' | 'cancelled' | 'interrupted';

export interface RunRecord {
  format: 'gmx-cypher run';
  version: 1 | 2 | 3;
  /** The command (version 3): its tool name. Versions 1 and 2 are RDF. */
  analysis?: string;
  runner: { name: 'gmx-cypher'; version: string };
  gmx: { path: string; version: string };
  job: string;
  command: { cwd: string; file: string; args: string[] };
  /** Environment variables starting GMX (module add sets them). */
  env: Record<string, string>;
  started: string | null;
  ended: string | null;
  status: Status;
  exit: { code: number | null; signal: string | null } | null;
  frames: { analysed: number; lastTime: number } | null;
  log: string;
  inputs: Partial<Record<Slot, FileInfo>>;
  /** In -ref/-sel order: group N of the .ndx. `count` is gmx-cypher's, `gmxCount` gmx select's (T21). */
  groups: (Group & { index: number; atoms: string; count: number; gmxCount: number | null })[];
  /** The answers the program read on stdin (version 3, R4): for gmx energy, the term numbers and the closing 0. */
  stdin?: string;
  /** gmx energy's statistics block, read from its output (version 3, R4); null when gmx printed none. */
  statistics?: EnergyStats | null;
  /** gmx wham's windows (version 3, R6): each window's run input and pull file, hashed, in the order of the lists. */
  windows?: { tpr: FileInfo; pull: FileInfo }[];
  /** Every option of the form this gmx has, with its value and whether that is the installed default. */
  options: { flag: string; value: string | boolean | null; default: string | boolean | null; isDefault: boolean }[];
  outputs: Output[];
  recipe: { options: Options; template: string; outDir: string | null; terms?: number[]; windows?: { tpr: string; pull: string }[]; pull?: 'pullx' | 'pullf' };
  problems: string[];
}

export interface RecordParts {
  analysis: string;
  runner: string;
  gmx: { path: string; version: string };
  env: Record<string, string>;
  command: RunRecord['command'];
  inputs: RunRecord['inputs'];
  groups: Group[];
  atoms: Atom[];
  sizes: number[] | null;
  options: Options;
  help: HelpOption[];
  template: string;
  outDir: string | null;
  job: { id: string; status: Status; started?: string; ended?: string; exit?: RunRecord['exit']; progress: Progress; log: string };
  outputs: Output[];
  problems: string[];
  /** The command's options, in the order its form shows them; RDF's when left out. */
  form?: { flag: string }[];
  /** The frames a run wrote, when they are not gmx's progress (gmx awh's files, R5). */
  frames?: RunRecord['frames'];
  stdin?: string;
  terms?: number[];
  statistics?: EnergyStats | null;
  windows?: { tpr: FileInfo; pull: FileInfo }[];
  pull?: 'pullx' | 'pullf';
}

export function buildRecord(p: RecordParts): RunRecord {
  const by = new Map(p.help.map(o => [o.flag, o.flag === 'cn' ? { ...o, type: 'bool', default: false } : o]));
  return {
    format: 'gmx-cypher run', version: 3, analysis: p.analysis, ...(p.stdin != null ? { stdin: p.stdin } : {}), ...(p.statistics !== undefined ? { statistics: p.statistics } : {}),
    ...(p.windows ? { windows: p.windows } : {}),
    runner: { name: 'gmx-cypher', version: p.runner }, gmx: p.gmx, job: p.job.id, command: p.command, env: p.env,
    started: p.job.started ?? null, ended: p.job.ended ?? null, status: p.job.status, exit: p.job.exit ?? null,
    frames: p.frames !== undefined ? p.frames : p.job.progress.analysed ? { analysed: p.job.progress.analysed.frames, lastTime: p.job.progress.analysed.lastTime } : null, log: p.job.log, inputs: p.inputs,
    groups: p.groups.map((g, index) => {
      const nrs = groupAtoms(p.atoms, g.steps);
      return { index, role: g.role, name: g.name, tone: g.tone, steps: g.steps, atoms: toRanges(nrs), count: nrs.length, gmxCount: p.sizes?.[index] ?? null };
    }),
    options: (p.form ?? FORM).filter(f => by.has(f.flag)).map(({ flag }) => {
      const o = by.get(flag)!, v = p.options[flag], set = v !== undefined && v !== '';
      return { flag, value: set ? v : o.default, default: o.default, isDefault: isDefault(o, v) };
    }),
    outputs: p.outputs,
    recipe: { options: p.options, template: p.template, outDir: p.outDir, ...(p.terms ? { terms: p.terms } : {}), ...(p.windows ? { windows: p.windows.map(w => ({ tpr: w.tpr.path, pull: w.pull.path })), pull: p.pull ?? 'pullx' } : {}) },
    problems: p.problems,
  };
}

/** What makes a parsed file unusable as a v1 record, in words; [] when it is one. */
export function recordProblems(x: unknown): string[] {
  const r = x as Partial<RunRecord> | null;
  if (!r || typeof r !== 'object' || r.format !== 'gmx-cypher run') return ['not a gmx-cypher run record'];
  if (r.version !== 1 && r.version !== 2 && r.version !== 3) return ['run record version ' + r.version + ': this gmx-cypher reads versions 1 to 3'];
  const p: string[] = [], need = (ok: boolean, what: string) => { if (!ok) p.push(what + ' is missing'); };
  if (r.version === 3 && typeof r.analysis !== 'string') p.push('analysis is missing: a version 3 record names its command');
  need(typeof r.command?.cwd === 'string' && typeof r.command.file === 'string', 'command');
  need(Array.isArray(r.command?.args), 'command.args');
  // The inputs the command cannot run without: a trajectory and a run input for RDF, an energy file for energy (R4).
  const required = commandOf(r.analysis ?? 'rdf')?.required ?? ['trajectory', 'runInput'];
  need(required.every(slot => typeof r.inputs?.[slot]?.path === 'string'), 'inputs');
  // A command without groups (R4) has none; the others need a reference and at least one selection.
  if (commandOf(r.analysis ?? 'rdf')?.groups !== false) {
    if (!Array.isArray(r.groups) || r.groups.length < 2) p.push('groups: a reference and at least one selection are needed');
    (r.groups || []).forEach((g, i) => { need(typeof g?.name === 'string', 'groups[' + i + '].name'); need(Array.isArray(g?.steps), 'groups[' + i + '].steps'); });
  }
  need(!!r.recipe && typeof r.recipe.options === 'object' && typeof r.recipe.template === 'string', 'recipe');
  return [...new Set(p)];
}

/** The record as the form's draft: same inputs, groups (as steps), options, template and folder. */
export function recipeFromRecord(r: RunRecord) {
  const why = 'from ' + (r.outputs.find(o => o.kind === 'xvg')?.path.split('/').pop()?.replace(/\.xvg$/, '') ?? r.job) + '.run.json';
  return {
    inputs: Object.fromEntries(Object.entries(r.inputs).map(([slot, f]) => [slot, { path: f!.path, why }])) as Partial<Record<Slot, { path: string; why: string }>>,
    // A command without groups (gmx energy) keeps the draft's groups: it has none of its own to bring back.
    ...(r.groups.length ? { groups: r.groups.map(({ role, name, tone, steps }) => ({ role, name, tone, steps })) } : {}),
    options: r.recipe.options, template: r.recipe.template, outDir: r.recipe.outDir, analysis: r.analysis ?? 'rdf', terms: r.recipe.terms,
    ...(r.recipe.windows ? { wham: { pull: r.recipe.pull ?? 'pullx', windows: r.recipe.windows } } : {}),
  };
}
