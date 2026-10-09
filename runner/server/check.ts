// The checks before anything runs (R2b, T13): files exist inside the allowed folders, and the atom counts
// of structure, run input and trajectory agree, as gmx itself reads them. Nothing reads more than a header
// or a first frame: gmx dump and gmx check are stopped once they have printed the count. Then each group's
// size as gmx select counts it (T21).

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { countAtoms, structFormat } from '../../app/src/lib/structFile';
import { judgeInputs, judgeSizes, type Counts } from '../src/lib/checks';
import { frameEstimate, parseCheckAtoms, parseDump, parseSizes, type Dump } from '../src/lib/gmxText';
import type { Slot } from '../src/lib/inputs';
import { parseNdx, writeNdx } from '../src/lib/ndx';
import { gmxError } from '../src/lib/progress';
import { inside, newFolder } from './files';
import { capture, type GmxState } from './gmx';

export interface InputCheck {
  ok: boolean;
  problems: string[];
  files: Partial<Record<Slot, { path: string; size: number; mtime: number }>>;
  counts: Counts;
  index?: { groups: number; maxAtom: number };
  estimate?: { frames: number; start: number; end: number } | null;
}

/** The run input's parameters and atom count as gmx reads them (`gmx dump -s`, stopped at `natoms`). */
export async function dumpRunInput(gmx: GmxState, runInput: string, cwd: string): Promise<Dump> {
  return parseDump((await capture(gmx.path!, ['dump', '-s', runInput], { cwd, until: /^\s*natoms\s*=\s*\d+/m })).stdout);
}

const NEEDED: [Slot, string][] = [['runInput', 'no run input'], ['structure', 'no structure']];

export async function checkInputs(inputs: Partial<Record<Slot, string>>, gmx: GmxState, roots: string[]): Promise<InputCheck> {
  const problems: string[] = [], files: InputCheck['files'] = {}, counts: Counts = { structure: null, runInput: null, trajectory: null };
  for (const [slot, missing] of [['trajectory', 'no trajectory'], ...NEEDED] as [Slot, string][]) if (!inputs[slot]) problems.push(missing);
  for (const [slot, p] of Object.entries(inputs) as [Slot, string][]) {
    try { const r = inside(p, roots), st = statSync(r); files[slot] = { path: r, size: st.size, mtime: Math.round(st.mtimeMs) }; }
    catch (e) { problems.push((e as Error).message); }
  }
  if (problems.length) return { ok: false, problems, files, counts };
  if (!gmx.ok || !gmx.path) return { ok: false, problems: ['no working gmx'], files, counts };

  const cwd = dirname(files.trajectory!.path);
  const text = readFileSync(files.structure!.path, 'utf8'), format = structFormat(files.structure!.path, text);
  counts.structure = (format && countAtoms(format, text)) || null;
  const [d, check] = await Promise.all([
    dumpRunInput(gmx, files.runInput!.path, cwd),
    capture(gmx.path, ['check', '-f', files.trajectory!.path], { cwd, until: /^# Atoms\s+\d+/m }),
  ]);
  counts.runInput = d.natoms ?? null;
  counts.trajectory = parseCheckAtoms(check.stdout + check.stderr);
  let index: InputCheck['index'];
  if (files.index) {
    const groups = parseNdx(readFileSync(files.index.path, 'utf8'));
    index = { groups: groups.length, maxAtom: groups.reduce((m, g) => g.atoms.reduce((a, b) => Math.max(a, b), m), 0) };
  }
  problems.push(...judgeInputs(counts, index));
  return { ok: !problems.length, problems, files, counts, ...(index ? { index } : {}), estimate: frameEstimate(d, files.trajectory!.path) };
}

export interface SizeCheck { ok: boolean; problems: string[]; sizes: number[] | null; dir: string }

/**
 * The groups written as an index into a new <home>/checks/<id>/ and counted by gmx select against the run
 * input: `-select 'group 0' 'group 1' …` (T17), so names can't be matched by prefix.
 */
export async function checkSizes(gmx: GmxState, runInput: string, groups: { name: string; atoms: number[] }[], home: string): Promise<SizeCheck> {
  const dir = newFolder(home, 'checks');
  writeFileSync(join(dir, 'groups.ndx'), writeNdx(groups), { flag: 'wx' });
  const r = await capture(gmx.path!, ['select', '-s', runInput, '-n', 'groups.ndx', '-select', ...groups.map((_, i) => 'group ' + i), '-os', 'sizes.xvg'], { cwd: dir });
  if (r.code !== 0) return { ok: false, problems: [gmxError(r.stderr) || 'gmx select failed (exit ' + r.code + ')'], sizes: null, dir };
  const sizes = parseSizes(readFileSync(join(dir, 'sizes.xvg'), 'utf8'));
  const problems = judgeSizes(groups.map(g => ({ name: g.name, count: g.atoms.length })), sizes);
  return { ok: !problems.length, problems, sizes, dir };
}
