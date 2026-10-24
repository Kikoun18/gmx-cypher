// Readers of the text GROMACS prints. Each is pure and tested on real output (test/fixtures/).

/** `GROMACS version:    2025.4-PLUMED_spack` from `gmx --version`, else the banner's version, else null. */
export function parseVersion(text: string): string | null {
  const line = /^GROMACS version:\s+(\S+)/m.exec(text);
  if (line) return line[1];
  const banner = /:-\) GROMACS - .+?, (\S+) \(-:/.exec(text);
  return banner ? banner[1] : null;
}

export interface Dump { natoms?: number; tinit?: number; dt?: number; nsteps?: number; initStep?: number; nstxout?: number; nstxoutCompressed?: number; refT?: number[] }

/** The temperatures `gmx dump -s` gives for the run input's coupling groups (`ref-t:  300`), one per group (R6). */
export function parseRefT(dump: string): number[] {
  const m = /^\s*ref-t:\s+(.+)$/m.exec(dump);
  return m ? m[1].trim().split(/\s+/).map(Number).filter(Number.isFinite) : [];
}

const DUMP_KEYS: Record<string, Exclude<keyof Dump, 'refT'>> = { natoms: 'natoms', tinit: 'tinit', dt: 'dt', nsteps: 'nsteps', 'init-step': 'initStep', nstxout: 'nstxout', 'nstxout-compressed': 'nstxoutCompressed' };

/** The first value of each key in `gmx dump -s` (the run parameters, then `natoms = N`). */
export function parseDump(text: string): Dump {
  const out: Dump = {};
  for (const m of text.matchAll(/^\s*([a-z-]+)\s*=\s*(-?[\d.eE+-]+)\s*$/gm)) {
    const k = DUMP_KEYS[m[1]];
    if (k && out[k] === undefined) out[k] = Number(m[2]);
  }
  const refT = parseRefT(text);
  if (refT.length) out.refT = refT;
  return out;
}

/** Frames a trajectory written by that run holds (.trr: nstxout, else nstxout-compressed), and its times in ps. */
export function frameEstimate(d: Dump, trajectory: string): { frames: number; start: number; end: number } | null {
  const every = /\.trr$/i.test(trajectory) ? d.nstxout : d.nstxoutCompressed;
  if (!every || d.nsteps == null || d.dt == null) return null;
  const start = (d.tinit ?? 0) + (d.initStep ?? 0) * d.dt;
  return { frames: Math.floor(d.nsteps / every) + 1, start, end: Number((start + d.nsteps * d.dt).toPrecision(12)) };
}

/** `# Atoms  3242`, which gmx check prints after the first frame. */
export function parseCheckAtoms(text: string): number | null {
  const m = /^# Atoms\s+(\d+)/m.exec(text);
  return m ? Number(m[1]) : null;
}

/** Each selection's size from `gmx select -os` (the last row, after its time), or null without one. */
export function parseSizes(xvg: string): number[] | null {
  const rows = xvg.split('\n').filter(l => l.trim() && !'#@'.includes(l.trim()[0]));
  return rows.length ? rows[rows.length - 1].trim().split(/\s+/).slice(1).map(Number) : null;
}

export interface HelpOption {
  flag: string;
  section: 'input' | 'output' | 'other';
  /** `file` for [<.ext>] and <file>, `bool` for -[no]flag, else gmx's own word: time, real, int, enum, selection… */
  type: string;
  default: string | boolean | null;
  optional?: boolean;
  values?: string[];
  help: string;
}

const SECTIONS: Record<string, HelpOption['section']> = { 'Options to specify input files:': 'input', 'Options to specify output files:': 'output', 'Other options:': 'other' };

/** The OPTIONS part of `gmx <tool> -h`: each option with its type, default, enum values and help text (T22). */
export function parseHelp(text: string): HelpOption[] {
  const out: HelpOption[] = [];
  let section: HelpOption['section'] | null = null;
  for (const line of text.split('\n')) {
    if (SECTIONS[line.trim()]) { section = SECTIONS[line.trim()]; continue; }
    const m = section && /^ -(\[no\])?([\w-]+)\s*(\[<[^>]*>\]|<\w+>)?\s*(?:\(([^)]*)\))?\s*(\(Opt\.\))?\s*$/.exec(line);
    if (m) {
      const [, no, flag, kind, def, opt] = m, file = !!kind?.startsWith('[');
      out.push({ flag, section: section!, type: no ? 'bool' : file || kind === '<file>' ? 'file' : kind!.slice(1, -1), default: no ? def === 'yes' : def ?? null, ...(file ? { optional: !!opt } : {}), help: '' });
    } else if (out.length && /^ {11}\S/.test(line)) {
      const o = out[out.length - 1];
      o.help = (o.help + ' ' + line.trim()).trim();
    }
  }
  for (const o of out) if (o.type === 'enum') o.values = o.help.slice(o.help.lastIndexOf(':') + 1).split(',').map(v => v.trim());
  return out;
}
