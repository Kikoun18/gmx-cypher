// The configured gmx (T4): found on PATH or by path, checked with --version, recorded as an absolute path.
// Every gmx call goes through capture(): an argument array, never a shell.

import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, isAbsolute, join, resolve } from 'node:path';
import { parseHelp, parseVersion, type HelpOption } from '../src/lib/gmxText';
import { commandOf, type CommandDef } from '../src/lib/commands';

export interface GmxState { ok: boolean; name: string; path?: string; version?: string; versionText?: string; error?: string }

export const executable = (p: string) => { try { accessSync(p, constants.X_OK); return statSync(p).isFile(); } catch { return false; } };

export function findOnPath(name: string, PATH = process.env.PATH || ''): string | null {
  for (const dir of PATH.split(delimiter).filter(Boolean)) if (executable(join(dir, name))) return join(dir, name);
  return null;
}

export interface Captured { code: number | null; stdout: string; stderr: string }

/**
 * Runs a program without a shell and collects its output; `until` stops it once the output matches; `env` adds to the
 * environment. With `group` it runs in a process group of its own, and a stop stops everything it started (the cluster
 * tools, which start programs of their own: review).
 */
export function capture(file: string, args: string[], o: { cwd?: string; until?: RegExp; timeoutMs?: number; stdin?: string; env?: Record<string, string>; group?: boolean } = {}): Promise<Captured & { timedOut?: boolean }> {
  return new Promise((done, fail) => {
    const p = spawn(file, args, { cwd: o.cwd, shell: false, stdio: [o.stdin == null ? 'ignore' : 'pipe', 'pipe', 'pipe'], detached: !!o.group, ...(o.env ? { env: { ...process.env, ...o.env } } : {}) }) as ChildProcessByStdio<Writable | null, Readable, Readable>;
    const kill = (signal: NodeJS.Signals) => { try { if (o.group && p.pid) process.kill(-p.pid, signal); else p.kill(signal); } catch { p.kill(signal); } };
    if (o.stdin != null) { p.stdin!.on('error', () => { /* the process ended before reading its answers */ }); p.stdin!.end(o.stdin); }
    let stdout = '', stderr = '', finished = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; kill('SIGKILL'); }, o.timeoutMs ?? 60_000);
    const check = () => { if (o.until && !finished && o.until.test(stdout + '\n' + stderr)) { finished = true; kill('SIGTERM'); } };
    p.stdout.on('data', d => { stdout += d; check(); });
    p.stderr.on('data', d => { stderr += d; check(); });
    p.on('error', e => { clearTimeout(timer); fail(e); });
    p.on('close', code => { clearTimeout(timer); done({ code: finished ? 0 : code, stdout, stderr, ...(timedOut ? { timedOut } : {}) }); });
  });
}

/** One candidate: its `--version` must name a GROMACS version. */
async function check(path: string): Promise<GmxState> {
  const name = path.split('/').pop()!;
  if (!executable(path)) return { ok: false, name, path, error: path + ': not found' };
  try {
    const r = await capture(path, ['--version'], { timeoutMs: 30_000 });
    const versionText = r.stdout + r.stderr, version = parseVersion(versionText), first = versionText.trim().split('\n')[0] || 'no output';
    if (version) return { ok: true, name, path, version, versionText };
    return { ok: false, name, path, error: path + ' --version ' + (r.code ? 'failed (exit ' + r.code + '): ' + first : 'is not GROMACS: ' + first) };
  } catch (e) {
    return { ok: false, name, path, error: path + ': ' + (e as Error).message };
  }
}

/** The configured gmx, or the first of gmx_mpi and gmx on PATH that answers --version (a gmx_mpi may need mpirun). */
export async function detectGmx(configured: string | null, PATH = process.env.PATH || ''): Promise<GmxState> {
  if (configured) {
    const path = configured.includes('/') ? (isAbsolute(configured) ? configured : resolve(configured)) : findOnPath(configured, PATH);
    return path ? check(path) : { ok: false, name: configured, error: configured + ': not on PATH' };
  }
  let first: GmxState | null = null;
  for (const n of ['gmx_mpi', 'gmx']) {
    const path = findOnPath(n, PATH);
    if (!path) continue;
    const g = await check(path);
    if (g.ok) return g;
    first ??= g;
  }
  return first || { ok: false, name: 'gmx', error: 'neither gmx_mpi nor gmx is on PATH; set its path in settings, or start gmx-cypher after module add' };
}

const helps = new Map<string, Promise<HelpOption[]>>();

/** `gmx <tool> -h` of this gmx, read once per binary, version and tool (T22); a failed read is tried again next time. */
export function toolHelp(g: GmxState, tool: string): Promise<HelpOption[]> {
  const key = g.path + '\0' + g.version + '\0' + tool;
  if (!helps.has(key)) {
    const read = capture(g.path!, [tool, '-h'], { timeoutMs: 30_000 }).then(r => {
      const options = parseHelp(r.stdout);
      if (!options.length) throw new Error(g.path + ' ' + tool + ' -h listed no options' + (r.code ? ' (exit ' + r.code + ')' : ''));
      return options;
    });
    helps.set(key, read);
    read.catch(() => helps.delete(key));
  }
  return helps.get(key)!;
}

export type Found = { ok: true; tool: string; help: HelpOption[] } | { ok: false; why: string };

/**
 * The gmx tool a command runs, with its -h (R8): its own name, or the first of its `find.tools` whose -h it accepts.
 * Refused in words when none is, or when this gmx has the command it gives way to (`find.unless`).
 */
export async function findTool(g: GmxState, cmd: CommandDef): Promise<Found> {
  if (!cmd.find) return { ok: true, tool: cmd.tool, help: await toolHelp(g, cmd.tool) };
  const other = cmd.find.unless && commandOf(cmd.find.unless.tool);
  if (other && (await findTool(g, other)).ok) return { ok: false, why: cmd.find.unless!.why };
  for (const tool of cmd.find.tools) {
    // A name this gmx doesn't know (gmx hbond-legacy before 2024) fails its -h: the next name is tried.
    const help = await toolHelp(g, tool).catch(() => null);
    if (help && cmd.find.accepts(help)) return { ok: true, tool, help };
  }
  return { ok: false, why: cmd.find.missing };
}

/** `gmx rdf -h` (T22). */
export const rdfHelp = (g: GmxState) => toolHelp(g, 'rdf');
