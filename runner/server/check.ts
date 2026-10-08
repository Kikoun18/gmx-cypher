// The checks before anything runs (R2b, T13): files exist inside the allowed folders, and the atom counts
// of structure, run input and trajectory agree, as gmx itself reads them. Nothing reads more than a header
// or a first frame: gmx dump and gmx check are stopped once they have printed the count.

import { readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { countAtoms, structFormat } from '../../app/src/lib/structFile';
import { judgeInputs, type Counts } from '../src/lib/checks';
import { frameEstimate, parseCheckAtoms, parseDump } from '../src/lib/gmxText';
import type { Slot } from '../src/lib/inputs';
import { parseNdx } from '../src/lib/ndx';
import { inside } from './files';
import { capture, type GmxState } from './gmx';

export interface InputCheck {
  ok: boolean;
  problems: string[];
  files: Partial<Record<Slot, { path: string; size: number; mtime: number }>>;
  counts: Counts;
  index?: { groups: number; maxAtom: number };
  estimate?: { frames: number; start: number; end: number } | null;
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
  const [dump, check] = await Promise.all([
    capture(gmx.path, ['dump', '-s', files.runInput!.path], { cwd, until: /^\s*natoms\s*=\s*\d+/m }),
    capture(gmx.path, ['check', '-f', files.trajectory!.path], { cwd, until: /^# Atoms\s+\d+/m }),
  ]);
  const d = parseDump(dump.stdout);
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
