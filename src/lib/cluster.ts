// Cluster jobs (R10b): what `qq jobs` and `gmx-eta -a` print, read by pure functions from your real samples
// (test/fixtures/cluster-tools), merged by job number. Nothing here runs anything. A line or field that isn't
// understood is kept and shown, never dropped. qq is read as the table you sent: no `--yaml` sample has come yet.

/** A job state: the letter qq prints, its word and its hue (yours: queued purple, running blue, finished green). */
export interface JobState { letter: string; word: string; tone: 'lilac' | 'sky' | 'mint' | 'butter' | 'stone' }
const STATES: Record<string, Omit<JobState, 'letter'>> = {
  Q: { word: 'queued', tone: 'lilac' }, R: { word: 'running', tone: 'sky' }, F: { word: 'finished', tone: 'mint' },
  E: { word: 'exiting', tone: 'sky' }, H: { word: 'held', tone: 'butter' }, S: { word: 'suspended', tone: 'butter' },
};
/** The letter as qq prints it, in words; an unknown letter stays itself, in a neutral hue. */
export const stateOf = (letter: string): JobState => ({ letter, ...(STATES[letter] ?? { word: letter, tone: 'stone' }) });

/** One row of the `qq jobs` table. Times are in seconds; what a row doesn't have is null. */
export interface QqJob {
  /** As printed, and its number for the merge with gmx-eta (`1374603`; a `1374603.server` would give the same). */
  id: string; key: string;
  state: JobState;
  user: string;
  /** The name as printed; qq cuts long names with "…" (`truncated`), and gmx-eta gives them whole. */
  name: string; truncated: boolean;
  queue: string; cpus: number | null; gpus: number | null; nodes: number | null;
  /** A running job's "runtime / walltime"; a queued job shows one time, kept as `waiting` (time in the queue, as it reads). */
  runtime: number | null; walltime: number | null; waiting: number | null;
  /** A running job's node; a queued one's plan as qq prints it ("node9 in 03:55"), not interpreted. */
  node: string | null; planned: string | null;
  cpu: number | null; mem: number | null;
  /** What `qq jobs -e` prints under the row (R15): where the job was submitted from, its input folder, qq's comment. */
  inputMachine: string | null; inputDir: string | null; comment: string | null;
  /** The row as printed, without the table's borders. */
  raw: string;
}
export interface QqTable { jobs: QqJob[]; counts: Record<string, number>; other: string[] }

/** ANSI colour codes (ESC [ … letter), which a tool may print even into a pipe. */
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*[A-Za-z]', 'g');
/** Strip colour codes and the box-drawing borders (│ ╭ ╰ …) of qq's table. */
const plain = (line: string) => line.replace(ANSI, '').replace(/^\s*[│┃|]/, '').replace(/[│┃|]\s*$/, '').trimEnd();

/** "00:48:36" (hours may run past 24), or with days as qq prints a day of walltime ("1d 00:00:00"), in seconds; null if it isn't one. */
export function clock(t: string): number | null {
  const m = /^(?:(\d+)d\s+)?(\d+):(\d{2}):(\d{2})$/.exec(t);
  return m ? +(m[1] ?? 0) * 86400 + +m[2] * 3600 + +m[3] * 60 + +m[4] : null;
}
/** A time among a row's words at `i`, one word or two ("1d" "00:00:00"): its seconds and how many words it took. */
const timeAt = (w: string[], i: number): [number, number] | null => {
  if (/^\d+d$/.test(w[i] ?? '') && clock(w[i] + ' ' + (w[i + 1] ?? '')) !== null) return [clock(w[i] + ' ' + w[i + 1])!, 2];
  const c = clock(w[i] ?? '');
  return c === null ? null : [c, 1];
};
/** What -e prints under a row, by its label. */
const DETAILS: Record<string, 'inputMachine' | 'inputDir' | 'comment'> = { 'Input machine': 'inputMachine', 'Input directory': 'inputDir', Comment: 'comment' };
const num = (t: string | undefined) => (t !== undefined && /^\d+(\.\d+)?$/.test(t) ? Number(t) : null);

/**
 * `qq jobs` as the table you sent: a header with "Job ID", then one row per job (state, ID, user, name, queue, NCPUs,
 * NGPUs, NNodes, times, node, %CPU, %Mem; a queued job has one time and a plan in place of the node). The totals line
 * ("Jobs R 9 Q 2 Σ 11") gives `counts`; every other line with text is kept in `other`.
 */
export function parseQqJobs(text: string): QqTable {
  const jobs: QqJob[] = [], other: string[] = [], counts: Record<string, number> = {};
  for (const line of text.split('\n')) {
    if (/^\s*[╭╰┌└+]/.test(line)) continue;
    const l = plain(line), t = l.trim().split(/\s+/);
    if (!l.trim()) continue;
    if (/\bJob ID\b/.test(l)) continue;
    // `qq jobs -e`: "> Input directory: /path" under a row belongs to that job (R15).
    const detail = /^>\s+([^:]+):\s*(.*)$/.exec(l.trim()), last = jobs[jobs.length - 1];
    if (detail && last && DETAILS[detail[1].trim()]) { last[DETAILS[detail[1].trim()]] = detail[2].trim() || null; continue; }
    const row = /^[A-Z]$/.test(t[0]) && /^\d+(\.\S+)?$/.test(t[1] ?? '') ? t : null;
    if (!row || row.length < 9) {
      const total = /\bJobs\s+((?:[A-ZΣ]\s+\d+\s+)*[A-ZΣ]\s+\d+)/.exec(l);
      if (total) for (const m of total[1].matchAll(/([A-ZΣ])\s+(\d+)/g)) counts[m[1]] = Number(m[2]);
      other.push(l.trim());
      continue;
    }
    const [letter, id, user, name, queue, cpus, gpus, nodes, ...rest] = row;
    let runtime: number | null = null, walltime: number | null = null, waiting: number | null = null, i = 0;
    const first = timeAt(rest, 0), second = first && rest[first[1]] === '/' ? timeAt(rest, first[1] + 1) : null;
    if (first && second) { runtime = first[0]; walltime = second[0]; i = first[1] + 1 + second[1]; }
    else if (first) { waiting = first[0]; i = first[1]; }
    const tail = rest.slice(i);
    // A running job ends with its node, then %CPU and %Mem when the batch system gives them (Slurm doesn't); a
    // queued one with a plan, kept as printed (review: a running row with its node alone is not a plan).
    const usage = (tail.length === 3 && num(tail[1]) !== null && num(tail[2]) !== null) || (['R', 'E'].includes(letter) && tail.length === 1);
    jobs.push({
      id, key: id.replace(/\..*$/, ''), state: stateOf(letter), user, name: name.replace(/…$/, ''), truncated: name.endsWith('…'), queue,
      cpus: num(cpus), gpus: num(gpus), nodes: num(nodes), runtime, walltime, waiting,
      node: usage ? tail[0] : null, planned: usage || !tail.length ? null : tail.join(' '), cpu: usage ? num(tail[1]) : null, mem: usage ? num(tail[2]) : null,
      inputMachine: null, inputDir: null, comment: null,
      raw: l.trim(),
    });
  }
  return { jobs, counts, other };
}

/** A job that was running and has ended between two reads (R15, T169). */
export interface Ended { key: string; name: string; word: 'finished' | 'no longer running'; inputDir: string | null }

/**
 * The jobs running in `before` that have ended in `after`: "finished" only when the list says so (`qq jobs -a` keeps
 * finished jobs), "no longer running" when it no longer lists them. Their input folder is what `qq jobs -e` printed (in
 * either read, or an earlier one, `dirs`), never guessed.
 */
export function endedBetween(before: QqJob[], after: QqJob[], dirs: Map<string, string> = new Map()): Ended[] {
  const now = new Map(after.map(j => [j.key, j]));
  return before.filter(j => ['R', 'E'].includes(j.state.letter)).flatMap(j => {
    const a = now.get(j.key), word = !a ? 'no longer running' : a.state.letter === 'F' ? 'finished' : null;
    return word ? [{ key: j.key, name: j.name, word, inputDir: j.inputDir ?? a?.inputDir ?? dirs.get(j.key) ?? null } satisfies Ended] : [];
  });
}

/** One job in `gmx-eta -a`: its time left, or gmx-eta's reason for none, and its whole message. */
export interface EtaLine { id: string; key: string; script: string; eta: number | null; reason: string | null; message: string }

/** "00:39:48", or with days ("1 day, 02:00:00", "2 days 3:04:05"), in seconds; null if it isn't one. */
export function duration(t: string): number | null {
  const m = /^(?:(\d+)\s+days?,?\s+)?(\d+):(\d{2}):(\d{2})$/.exec(t.trim());
  return m ? +(m[1] ?? 0) * 86400 + +m[2] * 3600 + +m[3] * 60 + +m[4] : null;
}

/**
 * `gmx-eta -a`: "[ID] script: Simulation will finish in HH:MM:SS." or "[ID] script: No information is available: …".
 * A line that doesn't start with "[" continues the message before it (gmx-eta passes on a remote cat's error so).
 */
export function parseGmxEta(text: string): { lines: EtaLine[]; other: string[] } {
  const lines: EtaLine[] = [], other: string[] = [];
  for (const raw of text.split('\n')) {
    const l = raw.replace(ANSI, '').trim();
    if (!l) continue;
    const m = /^\[([^\]]+)\]\s+(.+?):\s+(.*)$/.exec(l);
    if (!m) { if (lines.length) lines[lines.length - 1].message += ' ' + l; else other.push(l); continue; }
    lines.push({ id: m[1], key: m[1].replace(/\..*$/, ''), script: m[2], eta: null, reason: null, message: m[3] });
  }
  for (const e of lines) {
    const fin = /^Simulation will finish in (.+?)\.?$/.exec(e.message), none = /^No information is available:\s*(.*)$/.exec(e.message);
    if (fin) e.eta = duration(fin[1]);
    else if (none) e.reason = none[1].trim();
  }
  return { lines, other };
}

/** A job as the cluster view shows it: what qq says and what gmx-eta says, either of which can be missing. */
export interface ClusterRow { key: string; qq: QqJob | null; eta: EtaLine | null }

/** The two merged by job number, in qq's order, then the jobs only gmx-eta lists (in its order). */
export function mergeJobs(jobs: QqJob[], etas: EtaLine[]): ClusterRow[] {
  const byKey = new Map(etas.map(e => [e.key, e])), seen = new Set<string>();
  const rows: ClusterRow[] = jobs.map(j => { seen.add(j.key); return { key: j.key, qq: j, eta: byKey.get(j.key) ?? null }; });
  for (const e of etas) if (!seen.has(e.key)) { seen.add(e.key); rows.push({ key: e.key, qq: null, eta: e }); }
  return rows;
}

/** A span in words: "45 s", "39 min", "2 h 10 min", "1 d 3 h". */
export function span(s: number): string {
  const m = Math.round(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (s < 60) return Math.round(s) + ' s';
  if (h < 1) return m + ' min';
  if (d < 1) return h + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
  return d + ' d' + (h % 24 ? ' ' + (h % 24) + ' h' : '');
}

/** The time a job finishes, in your time zone ("Fri 03:40"); the browser's zone unless one is given (tests). */
export function finishText(at: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(timeZone ? { timeZone } : {}) }).formatToParts(at);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return get('weekday') + ' ' + get('hour') + ':' + get('minute');
}

/**
 * The ETA of a row read at `read` (the time the tools ran): the time left and when it finishes, or "—" with the reason;
 * and a warning in words when it needs more time than its walltime has left.
 */
export function etaOf(row: ClusterRow, read: Date, timeZone?: string): { left: string | null; finishes: string | null; why: string | null; warning: string | null } {
  const { qq, eta } = row;
  if (qq && qq.state.letter !== 'R' && !(eta && eta.eta !== null)) return { left: null, finishes: null, why: qq.state.letter === 'Q' ? 'not running yet' : qq.state.word, warning: null };
  if (!eta) return { left: null, finishes: null, why: 'gmx-eta lists no such job: not a GROMACS job, or no mdrun -v', warning: null };
  if (eta.eta === null) return { left: null, finishes: null, why: eta.reason ?? eta.message, warning: null };
  const left = qq && qq.runtime !== null && qq.walltime !== null ? qq.walltime - qq.runtime : null;
  return {
    left: span(eta.eta), finishes: finishText(new Date(read.getTime() + eta.eta * 1000), timeZone), why: null,
    warning: left !== null && eta.eta > left ? 'needs ' + span(eta.eta - left) + ' more than its walltime' : null,
  };
}

/** The wait before the next read, in seconds: 60 (question 5), doubled after each failed one, at most 10 min. */
export const nextPoll = (failures: number) => Math.min(60 * 2 ** Math.max(0, failures), 600);

/** "updated just now", "updated 3 min ago": how old a read is. */
export const ageText = (at: string, now: number) => {
  const s = Math.max(0, (now - Date.parse(at)) / 1000);
  return 'updated ' + (s < 60 ? 'just now' : span(s) + ' ago');
};
