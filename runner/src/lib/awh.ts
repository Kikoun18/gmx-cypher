// `gmx awh` (R5): which per-time files it writes, chosen as the last time, every N-th or all; their names; the
// target error in their header; and its argument list. Each behaviour was checked with GROMACS 2025.4 on a real AWH
// run (test/fixtures/awh/): `-o x.xvg` writes `x_t<time>.xvg` per stored frame (`x<bias>_t<time>.xvg` with more
// than one bias); `-b` and `-e` narrow the frames first, then `-skip N` keeps every N-th from the first left.
import type { HelpOption } from './gmxText';
import { isDefault, type Options } from './rdf';

export interface AwhFrame { suffix: string; bias: number | null; time: number }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The frames of the files gmx awh wrote for output stem `stem`, from their names, in time order (then bias). */
export function awhFrames(stem: string, names: string[]): AwhFrame[] {
  const re = new RegExp('^' + escape(stem) + '(\\d*)(_t(-?\\d+(?:\\.\\d+)?)\\.xvg)$');
  return names.flatMap(n => {
    const m = re.exec(n);
    return m ? [{ suffix: m[1] + m[2], bias: m[1] ? Number(m[1]) : null, time: Number(m[3]) }] : [];
  }).sort((a, b) => a.time - b.time || (a.bias ?? 0) - (b.bias ?? 0));
}

export type FrameChoice = { kind: 'last' } | { kind: 'every'; n: number } | { kind: 'all' };

/** The options a choice sets: the last time with -b, every N-th with -skip, all with neither. */
export function frameOptions(frames: AwhFrame[], choice: FrameChoice): Options {
  if (choice.kind === 'last') return frames.length ? { b: String(frames[frames.length - 1].time) } : {};
  if (choice.kind === 'every' && choice.n > 1) return { skip: String(choice.n) };
  return {};
}

/** The frames gmx awh will write with these options (as 2025.4 does: -b, -e, then -skip over the frames left). */
export function framesWritten(frames: AwhFrame[], options: Options): AwhFrame[] {
  const num = (f: string) => (options[f] === undefined || options[f] === '' ? 0 : Number(options[f]));
  const b = num('b'), e = num('e'), skip = Math.max(1, num('skip'));
  const kept = [...new Set(frames.map(f => f.time))].filter(t => t >= b && (e <= 0 || t <= e)).filter((_, i) => i % skip === 0);
  return frames.filter(f => kept.includes(f.time));
}

/** The files of these frames for an output stem. */
export const awhNames = (stem: string, frames: AwhFrame[]) => frames.map(f => stem + f.suffix);

/** `# AWH metadata: target error = 3.98 kT = 9.94 kJ/mol`, from a file's header. */
export function awhTargetError(xvg: string): { kT: number; kJ: number } | null {
  const m = /AWH metadata: target error = (\S+) kT = (\S+) kJ\/mol/.exec(xvg);
  return m ? { kT: Number(m[1]), kJ: Number(m[2]) } : null;
}

/** The options offered for gmx awh. Not -kt (vault outputs are kJ/mol, section 1.4) and not -fric (another file set). */
export const AWH_FORM: { flag: string; group: string; label: string; unit?: string; what: string }[] = [
  { flag: 'b', group: 'frames', label: 'from', unit: 'ps', what: 'frames before this time are left out' },
  { flag: 'e', group: 'frames', label: 'to', unit: 'ps', what: '0 = to the end of the file' },
  { flag: 'skip', group: 'frames', label: 'every', what: 'one frame in this many; 0 or 1 = every frame' },
  { flag: 'more', group: 'output', label: 'bias, target and distributions too', what: 'more columns in each file; not sent to the vault by default' },
];
const FORM_FLAGS = new Set(AWH_FORM.map(f => f.flag));

/** What gmx awh would refuse among the options, in words. */
export function awhOptionProblems(options: Options, _help: HelpOption[]): string[] {
  const p: string[] = [];
  for (const f of ['b', 'e', 'skip']) {
    const v = options[f];
    if (v === undefined || v === '') continue;
    if (typeof v !== 'string' || !v.trim() || !Number.isFinite(Number(v))) p.push('-' + f + ': not a number: ' + v);
    else if (Number(v) < 0) p.push('-' + f + ' must be 0 or more');
    else if (f === 'skip' && !Number.isInteger(Number(v))) p.push('-skip: a whole number: ' + v);
  }
  const b = Number(options.b || 0), e = Number(options.e || 0);
  if (!p.length && e > 0 && e <= b) p.push('-e must be after -b');
  return p;
}

/** gmx awh's argument list: the energy file, its run input and the output stem's file, then the options that differ. */
export function awhArgv(r: { options: Options }, io: { edr: string; tpr: string; output: string }, help: HelpOption[]): string[] {
  const has = new Set(help.map(o => o.flag));
  for (const k of Object.keys(r.options)) {
    if (!FORM_FLAGS.has(k)) throw new Error('-' + k + ' is not an option gmx-cypher sets for awh');
    if (!has.has(k)) throw new Error('this gmx awh has no -' + k);
  }
  const args = ['awh', '-f', io.edr, '-s', io.tpr, '-o', io.output];
  for (const o of help) {
    if (!FORM_FLAGS.has(o.flag)) continue;
    const v = r.options[o.flag];
    if (isDefault(o, v)) continue;
    args.push(...(o.type === 'bool' ? [(v ? '-' : '-no') + o.flag] : ['-' + o.flag, String(v)]));
  }
  return args;
}

/** How much a PMF moved between two frames: the largest |ΔPMF| and the RMS ΔPMF over the shared grid, kJ/mol. */
export interface PmfChange { max: number; rms: number }
export interface AwhConvergence { align: string; unit: 'kJ/mol'; frames: number; steps: { time: number; prev: PmfChange | null; final: PmfChange | null }[] }

const num = (v: number) => String(+v.toPrecision(6));

/**
 * AWH convergence (R7b, question 21): each frame against the one before it and against the final one, in time order.
 * A PMF is defined up to a constant, so each frame is first aligned by its mean over the shared grid (the
 * least-squares offset; a minimum would move with the noise at the bottom). Frames on different grids are refused.
 * No threshold: the numbers are shown as they are until one is chosen.
 */
export function awhConvergence(frames: { time: number; x: number[]; y: number[] }[]): AwhConvergence | { error: string } {
  const f = [...frames].sort((a, b) => a.time - b.time);
  if (f.length < 2) return { error: 'one frame: nothing to compare it with' };
  const [g] = f, same = (x: number[]) => x.length === g.x.length && x.every((v, i) => Math.abs(v - g.x[i]) <= 1e-9 * Math.max(1, Math.abs(v)));
  const odd = f.find(a => !same(a.x));
  if (odd) {
    const span = (a: typeof g) => a.x.length + ' points from ' + num(a.x[0]) + ' to ' + num(a.x[a.x.length - 1]);
    return { error: 'the frame at t = ' + num(odd.time) + ' ps has ' + span(odd) + ', the one at t = ' + num(g.time) + ' ps ' + span(g) + ": frames on different grids can't be compared point by point" };
  }
  const aligned = f.map(a => { const m = a.y.reduce((s, v) => s + v, 0) / a.y.length; return a.y.map(v => v - m) });
  const change = (a: number[], b: number[]): PmfChange => {
    let max = 0, sq = 0;
    a.forEach((v, i) => { const d = Math.abs(v - b[i]); if (d > max) max = d; sq += d * d });
    return { max, rms: Math.sqrt(sq / a.length) };
  };
  const last = aligned.length - 1;
  return {
    align: 'aligned by their mean over the shared grid', unit: 'kJ/mol', frames: f.length,
    steps: f.map((a, i) => ({ time: a.time, prev: i ? change(aligned[i], aligned[i - 1]) : null, final: i < last ? change(aligned[i], aligned[last]) : null })),
  };
}
