// What gmx prints on stderr while it reads a trajectory (T8), as in test/fixtures/gmx-2025.4/rdf-run.stderr:
// "\rReading frame      12 time   12.000   " …, "\rLast frame …", "Analyzed 21 frames, last time 20.000".

export interface Progress { frame?: number; time?: number; analysed?: { frames: number; lastTime: number } }

/** The last complete frame record, and the summary once it is printed. */
export function parseProgress(stderr: string): Progress {
  const tail = stderr.slice(-8192), out: Progress = {};
  // A record counts once whitespace follows its time, so a line cut mid-number is never read.
  const frames = [...tail.matchAll(/(?:Reading|Last) frame\s+(\d+)\s+time\s+(\S+)\s/g)];
  const last = frames[frames.length - 1];
  if (last) { out.frame = Number(last[1]); out.time = Number(last[2]); }
  const done = /Analyzed (\d+) frames, last time (\S+)/.exec(tail);
  if (done) out.analysed = { frames: Number(done[1]), lastTime: Number(done[2]) };
  return out;
}

const RULE = '-------------------------------------------------------';

/** gmx's own message from its error block, without Program / Source file / Function and the website pointer. */
export function gmxError(stderr: string): string | null {
  const a = stderr.indexOf(RULE);
  if (a < 0) return null;
  const b = stderr.indexOf(RULE, a + RULE.length);
  const body = stderr.slice(a + RULE.length, b < 0 ? undefined : b).split('\n').filter(l => !/^(Program|Source file|Function):/.test(l));
  const end = body.findIndex(l => l.startsWith('For more information'));
  return body.slice(0, end < 0 ? undefined : end).join('\n').trim() || null;
}

/** Each line as a terminal leaves it: what follows the last \r (the frame counter overwrites itself). */
export const asTerminal = (log: string) => log.split('\n').map(l => l.split('\r').filter(Boolean).pop() ?? '').join('\n');
