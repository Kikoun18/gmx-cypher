import { chmodSync, existsSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectGmx, findOnPath } from '../server/gmx';
import { DEFAULT_CONFIG, loadConfig, saveConfig } from '../server/state';
import { FAKE_GMX, tmp } from './helpers';

describe('finding and checking gmx', () => {
  it('finds a name on PATH, as an absolute path', () => {
    const dir = tmp('bin');
    writeFileSync(join(dir, 'gmx_mpi'), '#!/bin/sh\n'); chmodSync(join(dir, 'gmx_mpi'), 0o755);
    expect(findOnPath('gmx_mpi', '/nowhere:' + dir)).toBe(join(dir, 'gmx_mpi'));
    expect(findOnPath('gmx', dir)).toBeNull();
  });

  it('accepts a configured path and records its version', async () => {
    const g = await detectGmx(FAKE_GMX, '');
    expect(g).toMatchObject({ ok: true, path: FAKE_GMX, version: '2025.4-PLUMED_spack' });
    expect(g.versionText).toContain('GROMACS version:');
  });

  it('tries gmx_mpi, then gmx, when nothing is configured', async () => {
    const dir = tmp('bin');
    const g = await detectGmx(null, dir);
    expect(g.ok).toBe(false);
    expect(g.error).toBe('neither gmx_mpi nor gmx is on PATH; set its path in settings, or start gmx-cypher after module add');
  });

  it('takes the first candidate that answers, so a gmx_mpi that needs mpirun falls back to gmx', async () => {
    const dir = tmp('bin'), mpi = join(dir, 'gmx_mpi');
    writeFileSync(mpi, '#!/bin/sh\necho "[vm:1] ORTE_ERROR_LOG: A system-required executable either could not be found" >&2\nexit 1\n'); chmodSync(mpi, 0o755);
    symlinkSync(FAKE_GMX, join(dir, 'gmx'));
    expect(await detectGmx(null, dir)).toMatchObject({ ok: true, path: join(dir, 'gmx'), version: '2025.4-PLUMED_spack' });
    unlinkSync(join(dir, 'gmx'));
    const g = await detectGmx(null, dir);
    expect(g).toMatchObject({ ok: false, path: mpi });
    expect(g.error).toBe(mpi + ' --version failed (exit 1): [vm:1] ORTE_ERROR_LOG: A system-required executable either could not be found');
  });

  it('says so when the binary does not answer --version as GROMACS', async () => {
    const dir = tmp('bin'), bad = join(dir, 'gmx');
    writeFileSync(bad, '#!/bin/sh\necho hello\n'); chmodSync(bad, 0o755);
    const g = await detectGmx(bad, '');
    expect(g).toMatchObject({ ok: false, path: bad });
    expect(g.error).toContain('not GROMACS');
    expect((await detectGmx('/no/such/gmx', '')).error).toBe('/no/such/gmx: not found');
  });
});

describe('the config file', () => {
  it('starts from the defaults and round-trips, replaced atomically', () => {
    const home = tmp('home');
    expect(loadConfig(home)).toEqual(DEFAULT_CONFIG);
    saveConfig(home, { ...DEFAULT_CONFIG, gmx: '/opt/gmx' });
    expect(loadConfig(home).gmx).toBe('/opt/gmx');
    expect(readdirSync(home)).toEqual(['config.json']);
    expect(existsSync(join(home, 'config.json'))).toBe(true);
  });
});
