// Readers of the text GROMACS prints. Each is pure and tested on real output (test/fixtures/).

/** `GROMACS version:    2025.4-PLUMED_spack` from `gmx --version`, else the banner's version, else null. */
export function parseVersion(text: string): string | null {
  const line = /^GROMACS version:\s+(\S+)/m.exec(text);
  if (line) return line[1];
  const banner = /:-\) GROMACS - .+?, (\S+) \(-:/.exec(text);
  return banner ? banner[1] : null;
}

export interface Dump { natoms?: number; tinit?: number; dt?: number; nsteps?: number; initStep?: number; nstxout?: number; nstxoutCompressed?: number }

const DUMP_KEYS: Record<string, keyof Dump> = { natoms: 'natoms', tinit: 'tinit', dt: 'dt', nsteps: 'nsteps', 'init-step': 'initStep', nstxout: 'nstxout', 'nstxout-compressed': 'nstxoutCompressed' };

/** The first value of each key in `gmx dump -s` (the run parameters, then `natoms = N`). */
export function parseDump(text: string): Dump {
  const out: Dump = {};
  for (const m of text.matchAll(/^\s*([a-z-]+)\s*=\s*(-?[\d.eE+-]+)\s*$/gm)) {
    const k = DUMP_KEYS[m[1]];
    if (k && out[k] === undefined) out[k] = Number(m[2]);
  }
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
