// gmx awh's frames (R5): which times an energy file holds AWH data for, and the target error. Read once per gmx and
// file version by running gmx awh into a scratch folder that is removed afterwards: the file names it writes are the
// frames, in its own naming, so the planner knows each file a run will write before it starts.
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { awhFrames, awhTargetError, type AwhFrame } from '../src/lib/awh';
import { capture, type GmxState } from './gmx';

export interface AwhScan { frames: AwhFrame[]; targetError: { kT: number; kJ: number } | null }

const scans = new Map<string, Promise<AwhScan>>();
const version = (p: string) => { const st = statSync(p); return p + '\0' + st.size + '\0' + st.mtimeMs; };

/** The AWH frames of an energy file and its run input; a failed read is tried again next time. */
export function awhScan(g: GmxState, edr: string, tpr: string): Promise<AwhScan> {
  const key = [g.path, version(edr), version(tpr)].join('\0');
  if (!scans.has(key)) {
    const read = (async () => {
      const dir = mkdtempSync(join(tmpdir(), 'gmx-cypher-awh-'));
      try {
        const r = await capture(g.path!, ['awh', '-f', edr, '-s', tpr, '-o', join(dir, 'x.xvg')], { cwd: dir, timeoutMs: 600_000 });
        const frames = awhFrames('x', readdirSync(dir));
        if (r.code && !frames.length) throw new Error('gmx awh could not read ' + edr + ' (exit ' + r.code + '): ' + (r.stderr.trim().split('\n').filter(Boolean).pop() ?? ''));
        const last = frames[frames.length - 1];
        return { frames, targetError: last ? awhTargetError(readFileSync(join(dir, 'x' + last.suffix), 'utf8')) : null };
      } finally { rmSync(dir, { recursive: true, force: true }); }
    })();
    scans.set(key, read);
    read.catch(() => scans.delete(key));
  }
  return scans.get(key)!;
}
