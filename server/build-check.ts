// What a build reads, checked (R4): each file a system needs, found or not, in the base folder (settings), which must
// be inside the allowed folders. stat(), and reads: each mdp file's dt (T231), the force field's terminus block names
// and water models (T230), and the mdp and topology files a person opens. Nothing is written. Names arrive from the
// page and become paths, so every one is checked first.

import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, normalize } from 'node:path';
import { mergeSettings } from '../../matrix/src/lib/seq';
import type { Store } from '../../matrix/src/lib/types';
import { inputsOf, type Input } from '../src/lib/build/inputs';
import { systemLanding, type PmfLanding } from '../src/lib/build/landing';
import { mdpValue, timestepProblems } from '../src/lib/build/mdp';
import { checkAnswers, tdbNames, waterModels, type AnswersCheck, type ForceFieldMenus } from '../src/lib/build/pdb2gmx';
import { planProblems, systemsOf, systemsProblems, type BuildPlan, type Systems } from '../src/lib/build/plan';
import { within } from './files';
import { HttpError } from './http';

/** The base folder, real and inside the allowed folders, or why not. */
export function baseFolder(base: string | null, roots: string[]): string {
  if (!base) throw new HttpError(409, 'no base folder: set it in settings → symbuilder');
  let real: string;
  try { real = realpathSync(base); if (!statSync(real).isDirectory()) throw new Error(); } catch { throw new HttpError(400, base + ' is not a folder'); }
  const ok = roots.flatMap(r => { try { return [realpathSync(r)]; } catch { return []; } }).some(r => within(real, r));
  if (!ok) throw new HttpError(403, 'the base folder must be inside an allowed folder: ' + base);
  return real;
}

const exists = (p: string) => { try { return statSync(p).isFile(); } catch { return false; } };

/** A plan and systems from the page, checked: a build plan, and every name one that can be a folder. */
export function checkBuild(plan: unknown, systems: Systems): BuildPlan { return checked(plan, systems); }
function checked(plan: unknown, systems: Systems): BuildPlan {
  const problems = planProblems(plan);
  if (problems.length) throw new HttpError(400, problems.join('; '));
  const bad = systemsProblems(systems);
  if (bad.length) throw new HttpError(400, bad.join('; '));
  return plan as BuildPlan;
}

/**
 * pdb2gmx's menus from the base folder's force field (T230): the .ff folders in ff/ (pdb2gmx lists them first), the
 * terminus blocks of every .tdb, files in name order as GROMACS reads them, and the water models. Read only; null when
 * ff/ or the force field's folder can't be read, or it has no .n.tdb or .c.tdb blocks.
 */
export function forceFieldMenus(base: string, forcefield: string): ForceFieldMenus | null {
  try {
    const ff = join(base, 'ff'), dir = join(ff, forcefield + '.ff'), names = readdirSync(dir).sort();
    const local = readdirSync(ff, { withFileTypes: true }).filter(d => d.name.endsWith('.ff') && (d.isDirectory() || d.isSymbolicLink())).map(d => d.name).sort();
    const blocks = (end: string) => names.filter(n => n.endsWith('.' + end + '.tdb')).flatMap(n => tdbNames(readFileSync(join(dir, n), 'utf8')));
    const n = blocks('n'), c = blocks('c');
    // No terminus files: nothing to check the answers against (the files check says what is missing).
    if (!n.length || !c.length) return null;
    return { local, n, c, waters: names.includes('watermodels.dat') ? waterModels(readFileSync(join(dir, 'watermodels.dat'), 'utf8')) : [] };
  } catch { return null; }
}

export function checkInputs(base: string, plan: unknown, systems: Systems): { base: string; files: (Input & { found: boolean })[]; missing: Record<string, string[]>; pdb2gmx: AnswersCheck | null; timestep: string[] } {
  checked(plan, systems);
  const files = new Map<string, Input & { found: boolean }>(), missing: Record<string, string[]> = {};
  for (const sys of systemsOf(systems)) {
    for (const i of inputsOf(plan as BuildPlan, sys)) {
      if (!files.has(i.path)) files.set(i.path, { ...i, found: exists(join(base, i.path)) });
      if (!files.get(i.path)!.found) (missing[sys.dir] ??= []).push(i.path);
    }
  }
  // The answers matter only when pdb2gmx is in the build.
  const p = plan as BuildPlan, sc = p.science, on = p.stages.some(st => st.id === 'sb' && st.on && st.tiles.some(t => t.type === 'pdb2gmx' && t.on));
  const menus = on ? forceFieldMenus(base, sc.forcefield) : null;
  // Each mdp's time step, for the methods without hmr (T231): read once per file, a file not there or unread is no dt.
  const dts = new Map<string, number | null>(), dt = (path: string) => {
    if (!dts.has(path)) { let v: number | null = null; try { if (files.get(path)?.found) { const n = Number(mdpValue(readFileSync(join(base, path), 'utf8'), 'dt')); v = Number.isFinite(n) ? n : null; } } catch { /* no dt */ } dts.set(path, v); }
    return dts.get(path)!;
  };
  return { base, files: [...files.values()], missing, pdb2gmx: menus && checkAnswers(menus, sc.forcefield, sc.answers, sc.answersBySequence, systems.sequences), timestep: timestepProblems(p, systems.methods, dt) };
}

/** The most systems a landing check reads (the preview lists 200). */
export const LANDING_MAX = 200;
/**
 * Where each system's PMF would land in the connected project (R8b): the project read, nothing written. `base` is
 * the base folder as set (the folders a header would carry), or none. A system is null when its build has no PMF.
 */
export function checkLanding(read: { store: Store; state: { project: { name: string } } }, plan: unknown, systems: Systems, base: string | null) {
  const p = checked(plan, systems), all = systemsOf(systems), st = mergeSettings({}, read.store.settings);
  const out: Record<string, PmfLanding | null> = {};
  for (const sys of all.slice(0, LANDING_MAX)) out[sys.dir] = systemLanding(read.store, p, sys, base);
  return { project: { name: read.state.project.name, pattern: st.pattern, pathPattern: st.pathPattern }, systems: out, more: Math.max(0, all.length - LANDING_MAX) };
}

const TEXT = ['.mdp', '.itp', '.top'];
/** An mdp or topology file of the base folder, to read: relative, inside it, at most 256 kB. */
export function readText(base: string, rel: string): string {
  const n = normalize(rel);
  if (!rel || isAbsolute(rel) || n.startsWith('..') || !TEXT.includes(extname(n))) throw new HttpError(400, 'not an mdp or topology file of the base folder: ' + rel);
  let real: string;
  try { real = realpathSync(join(base, n)); } catch { throw new HttpError(404, 'no ' + rel + ' in the base folder'); }
  if (!within(real, base)) throw new HttpError(403, rel + ' leads outside the base folder');
  if (statSync(real).size > 256 * 1024) throw new HttpError(413, rel + ' is over 256 kB');
  return readFileSync(real, 'utf8');
}
