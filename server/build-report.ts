// SymBuilder's reports (R9), from what a build left on disk: each system's build.json (its charge before the salt,
// its ions, its time, its warnings per stage), the pull's pullx.xvg, the walkers' folders, and the topology's Protein
// moleculetype. Read only, except the build summary, written once per build into <base>/logs/ (dated, never replaced).

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { NAMES } from '../src/lib/build/plan';
import { molSections, pullReport, summaryText, TERMINI_HEAD, terminiFooter, terminiRow, termini, walkerMark, walkerReport, type SummaryRow, type WalkerMark } from '../src/lib/build/report';
import { pullx } from '../src/lib/build/text';
import { linkIn, readRecord, type BuildRun } from './build-run';

const two = (n: number) => String(n).padStart(2, '0');
const local = (iso: string) => { const d = new Date(iso); return { d, day: d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()), hm: two(d.getHours()) + ':' + two(d.getMinutes()) }; };

/** A system's line of the summary: OK for built or waiting for the cluster, RETRIED once a later build took it again. */
function summaryRow(run: BuildRun, i: number): SummaryRow {
  const s = run.systems[i], rec = readRecord(join(run.base, s.dir)), v = rec?.values ?? {};
  const range = pullRange(join(run.base, s.dir));
  const status = s.retried ? 'RETRIED' : s.status === 'built' || s.status === 'cluster' ? 'OK' : s.status === 'failed' ? 'FAILED' : 'SKIPPED';
  const t = (x?: string) => (x ? Date.parse(x) : NaN), elapsed = Math.max(0, Math.round((t(s.ended) - t(s.started)) / 1000)) || 0;
  return {
    name: s.method + '/' + s.saccharide + '/' + s.sequence, charge: v.net != null ? Number(v.net) : null, ions: v.np != null && v.nn != null ? [Number(v.np), Number(v.nn)] : null,
    min: range?.min ?? null, elapsed, status, warn: Object.entries(rec?.warnings ?? {}), note: s.error ?? (s.status === 'skipped' || s.status === 'cancelled' ? s.notes.at(-1) ?? s.status : ''),
  };
}

function pullRange(root: string): { min: number; max: number } | null {
  try { const d = pullx(readFileSync(join(root, NAMES.pull, 'pullx.xvg'), 'utf8')).dists; return d.length ? { min: Math.min(...d), max: Math.max(...d) } : null; } catch { return null; }
}

/** Every report of one build: the summary (text and rows), the pull report, the walker report, the termini check. */
export function reportOf(run: BuildRun, gmxVersion: string) {
  const at = local(run.created), rows = run.systems.map((_, i) => summaryRow(run, i)), walkers = run.systems.length ? (readRecord(join(run.base, run.systems[0].dir))?.plan.science.walkers.length ?? 8) : 8;
  const pull = run.systems.map(s => {
    const root = join(run.base, s.dir), rec = readRecord(root), r = pullRange(root);
    const charge = rec?.notes.map(n => /^net charge after npt: (-?[\d.]+) e$/.exec(n)).find(Boolean)?.[1];
    return { name: s.method + '/' + s.saccharide + '/' + s.sequence, charge: charge != null ? Number(charge) : null, min: r?.min ?? null, max: r?.max ?? null };
  });
  const marks = run.systems.map(s => {
    const w = join(run.base, s.dir, NAMES.walkers);
    return { name: s.method + '/' + s.saccharide + '/' + s.sequence, marks: Array.from({ length: walkers }, (_, k): WalkerMark => {
      const d = join(w, String(k + 1));
      return walkerMark(existsSync(d) && readdirSync(d).some(f => f.endsWith('.xvg')), existsSync(join(d, NAMES.walkers + '.tpr')));
    }) };
  });
  const odd: string[] = [], terminiLines: { name: string; line: string; odd: boolean; missing?: boolean }[] = [];
  for (const s of run.systems) {
    const root = join(run.base, s.dir), top = join(root, s.sequence + '.top'), name = s.method + '/' + s.saccharide + '/' + s.sequence;
    if (!existsSync(top)) continue;
    const { atoms, bonds } = molSections(readFileSync(top, 'utf8'), inc => { try { return readFileSync(join(dirname(top), inc), 'utf8'); } catch { return null; } });
    // As the notebook: said on its line, not counted as a mismatch.
    if (!atoms.length) { terminiLines.push({ name, line: name.padEnd(34) + '  no Protein moleculetype', odd: false, missing: true }); continue; }
    const t = termini(atoms, bonds), r = terminiRow(name, atoms[0].resname, atoms[atoms.length - 1].resname, t, atoms.reduce((q, a) => q + a.q, 0));
    terminiLines.push({ name, ...r });
    if (r.odd) odd.push(name);
  }
  return {
    summary: summaryText(rows, at.day + ' ' + at.hm, gmxVersion), rows, log: run.log ?? null,
    pull: pullReport(pull), pullRows: pull, walkers: walkerReport(marks, walkers), walkerRows: marks,
    termini: [TERMINI_HEAD, ...terminiLines.map(l => l.line), '', terminiFooter(odd)].join('\n') + '\n', terminiRows: terminiLines,
  };
}

/** The build summary of a build that ended, written to <base>/logs/build_summary_<YYYYMMDD_HHMM>.log; a name taken gets _2, _3. */
export function writeSummary(run: BuildRun, gmxVersion: string): string {
  const at = local(run.ended ?? run.created), stamp = at.day.replaceAll('-', '') + '_' + at.hm.replace(':', ''), dir = join(run.base, 'logs');
  const link = linkIn(run.base, dir);
  if (link) throw new Error(link + ' is a link: nothing is written through it');
  mkdirSync(dir, { recursive: true });
  const text = reportOf(run, gmxVersion).summary;
  for (let k = 1; ; k++) {
    const name = 'build_summary_' + stamp + (k > 1 ? '_' + k : '') + '.log';
    try { writeFileSync(join(dir, name), text, { flag: 'wx' }); return 'logs/' + name; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  }
}
