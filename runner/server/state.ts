// The state folder (T5): ~/.gmx-cypher, or $GMX_CYPHER_HOME. config.json is replaced atomically;
// nothing outside this folder is ever overwritten or deleted.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Config {
  /** gmx name or path; null: gmx_mpi, then gmx, on PATH. */
  gmx: string | null;
  /** Folders the file browser may show (R2a). */
  allow: string[];
  /** The Matrix vault folder (R6). */
  vault: string | null;
  /** The connected project of the vault, by its Matrix ID (R14b, T158): it names jobs, is the default for sends and owns saved views. */
  project: string | null;
  /** The Matrix's address, for a link to the project (R6c). */
  pmfUrl: string | null;
  /** Jobs at a time (R7b). */
  concurrency: number;
  /** SHA-256 of trajectories in run records (R5). */
  hashTrajectories: boolean;
  /** qq and gmx-eta, by name or path, for the cluster view (R10); null: found on PATH. */
  qq: string | null;
  gmxEta: string | null;
}

export const DEFAULT_CONFIG: Config = { gmx: null, allow: [], vault: null, project: null, pmfUrl: null, concurrency: 2, hashTrajectories: false, qq: null, gmxEta: null };

export const stateDir = (env: NodeJS.ProcessEnv = process.env) => env.GMX_CYPHER_HOME || join(homedir(), '.gmx-cypher');

export function loadConfig(dir: string): Config {
  const file = join(dir, 'config.json');
  return existsSync(file) ? { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(file, 'utf8')) } : { ...DEFAULT_CONFIG };
}

/** Written next to the old file, then renamed over it: never half-written. */
export function saveConfig(dir: string, c: Config) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'config.json'), part = file + '.' + process.pid + '.part';
  writeFileSync(part, JSON.stringify(c, null, 2) + '\n');
  renameSync(part, file);
}
