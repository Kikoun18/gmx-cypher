// gmx-cypher's own space in the vault (R14a, T158): its paths, the record copy that names nothing of this machine,
// exclusive writes, and — with the Matrix's own code, read-only — a vault that reads the same with the space as without.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeBackend } from '../../matrix/scripts/node-backend';
import { Vault } from '../../matrix/src/lib/storage/vault';
import { newVault, withAnalysis, withStructure } from '../../matrix/test/helpers';
import { portableRecord, spacePaths } from '../src/lib/space';
import type { RunRecord } from '../src/lib/record';
import { copyRecord, ensureSpace, writeInSpace } from '../server/space';
import { ReadOnlyBackend } from '../server/vault';
import { RUNNER, tmp } from './helpers';

const F = RUNNER + 'test/fixtures/decypher/';
const record = (): RunRecord => JSON.parse(readFileSync(F + 'rdf_o111_Methionine_H.run.json', 'utf8'));
const SHA = 'a'.repeat(64);

describe('the record copy names nothing of this machine (T158)', () => {
  it('paths inside an allowed folder become relative to it; others keep only their name; the environment keeps its names', () => {
    const r = record(), sims = r.command.cwd.split('/').slice(0, 4).join('/');
    const p = portableRecord({ ...r, env: { GMX_MAXBACKUP: '99', GMXLIB: '/home/me/top' }, log: 'Working dir:  ' + r.command.cwd + '\nby /home/me/bin/gmx' }, [sims], '/home/me');
    expect(p.command.cwd).toBe(r.command.cwd.slice(sims.length + 1));
    expect(p.inputs.trajectory!.path).toBe(r.inputs.trajectory!.path.slice(sims.length + 1));
    expect(p.outputs.map(o => o.path)).toEqual(r.outputs.map(o => o.path.slice(sims.length + 1)));
    expect(p.gmx.path).toBe(r.gmx.path.split('/').pop());
    expect(p.env).toEqual({});
    expect(p.envNames).toEqual(['GMXLIB', 'GMX_MAXBACKUP']);
    expect(p.log).toBe('Working dir:  ' + r.command.cwd.slice(sims.length + 1) + '\nby ~/bin/gmx');
    expect(JSON.stringify(p)).not.toContain(sims + '/');
    // The data stays: groups, options, hashes and the job's state.
    expect(p.groups).toEqual(r.groups);
    expect(p.outputs.map(o => o.sha256)).toEqual(r.outputs.map(o => o.sha256));
    expect(p.copy).toMatchObject({ paths: 'relative to their allowed folder', env: 'names only' });
  });

  it('builds paths only from a SHA-256, a Matrix ID and a plain name', () => {
    expect(spacePaths.record(SHA)).toBe('gmx-cypher/records/' + SHA + '.run.json');
    expect(spacePaths.view('pmvfksx5zt9oen', 'two runs')).toBe('gmx-cypher/projects/pmvfksx5zt9oen/views/two runs.json');
    expect(() => spacePaths.record('../x')).toThrow('not a SHA-256');
    expect(() => spacePaths.view('../p', 'v')).toThrow('not a Matrix ID');
    expect(() => spacePaths.view('p1', '../v')).toThrow('not a plain name');
  });
});

describe('writing in the space (R14a)', () => {
  it('creates the space once, with space.json and a README, and refuses a folder of that name that is not its own', () => {
    const v = tmp('vault');
    ensureSpace(v, 'gmx-cypher 0.1.0');
    ensureSpace(v, 'gmx-cypher 0.1.0');
    expect(readdirSync(join(v, 'gmx-cypher')).sort()).toEqual(['README.md', 'space.json']);
    expect(JSON.parse(readFileSync(join(v, 'gmx-cypher/space.json'), 'utf8'))).toMatchObject({ format: 'gmx-cypher space', version: 1, by: 'gmx-cypher 0.1.0' });
    expect(readFileSync(join(v, 'gmx-cypher/README.md'), 'utf8')).toContain('The Matrix does not read this folder');
    const w = tmp('vault');
    mkdirSync(join(w, 'gmx-cypher'));
    writeFileSync(join(w, 'gmx-cypher/mine.txt'), 'mine\n');
    expect(() => ensureSpace(w, 'x')).toThrow("gmx-cypher is not gmx-cypher's space (it has no space.json)");
    expect(readdirSync(join(w, 'gmx-cypher'))).toEqual(['mine.txt']);
  });

  it('creates every file exclusively: an existing one is left as it is; nothing outside the space', () => {
    const v = tmp('vault');
    expect(copyRecord(v, SHA, record(), [], '/home/me', 'gmx-cypher 0.1.0')).toBe('written');
    const first = readFileSync(join(v, spacePaths.record(SHA)), 'utf8');
    expect(copyRecord(v, SHA, { ...record(), log: 'other' }, [], '/home/me', 'gmx-cypher 0.1.0')).toBe('exists');
    expect(readFileSync(join(v, spacePaths.record(SHA)), 'utf8')).toBe(first);
    expect(() => writeInSpace(v, 'gmx-cypher/../escape.json', '{}', 'x')).toThrow('outside gmx-cypher/');
    expect(() => writeInSpace(v, 'project--p1/x.json', '{}', 'x')).toThrow('outside gmx-cypher/');
    expect(readdirSync(v)).toEqual(['gmx-cypher']);
  });
});

/** Every file outside the space, with the SHA-256 of its bytes. */
function outside(root: string, rel = ''): string[] {
  return readdirSync(join(root, rel)).sort().flatMap(n => {
    const p = rel ? rel + '/' + n : n;
    if (p === 'gmx-cypher') return [];
    return statSync(join(root, p)).isDirectory() ? [p + '/', ...outside(root, p)] : [p + ' ' + createHash('sha256').update(readFileSync(join(root, p))).digest('hex')];
  });
}

/** What the Matrix itself makes of the vault, opened read-only (a lock it doesn't get makes it so; nothing is written). */
async function matrixView(dir: string) {
  const vault = await Vault.open(new ReadOnlyBackend(new NodeBackend(dir)), { lock: { acquire: async () => null } });
  expect(vault.readOnly).toBe(true);
  const projects = await vault.listProjects(), out: unknown[] = [];
  for (const p of projects) {
    const svc = await vault.openProject(p.id, { notes: 'eager' });
    await svc.verified;
    const { untracked, missing, warnings, conflicts, conflictCopies, relinked } = svc.report;
    out.push({ id: p.id, name: p.name, untracked, missing, warnings, conflicts, conflictCopies, relinked, seqs: svc.store.seqs.map(q => q.name) });
  }
  return { manifest: vault.manifest, projects: out };
}

describe('the Matrix reads the vault the same with the space as without (R14a, proved with its own code)', () => {
  it('Vault.open and every project load report are identical, and no file outside the space changes', async () => {
    // The vault of the browser test (e2e/make-vault.ts): Methionine × PG with two RDFs and the peptide's structure.
    const dir = tmp('vault'), bytes = (n: string) => new Uint8Array(readFileSync(F + n));
    const { svc, vault } = await newVault(new NodeBackend(dir));
    const a = withAnalysis(svc.store, { name: 'Methionine', col: 'pg', slot: 'a', type: 'rdf', file: 'rdf_o111_Methionine_S.xvg', bytes: bytes('rdf_o111_Methionine_S.xvg') });
    const b = withAnalysis(a.store, { name: 'Methionine', col: 'pg', slot: 'b', type: 'rdf', file: 'rdf_o111_Methionine_H.xvg', bytes: bytes('rdf_o111_Methionine_H.xvg') });
    const st = withStructure(b.store, b.rowId, 'mmmmmmmm.gro', bytes('mmmmmmmm.gro'), 'gro');
    svc.commit(st.store, new Map([...a.uploads, ...b.uploads, ...st.uploads]));
    await svc.flush();
    await vault.close();

    const before = await matrixView(dir), files = outside(dir);
    expect(before.projects).toHaveLength(1);
    ensureSpace(dir, 'gmx-cypher 0.1.0');
    copyRecord(dir, SHA, record(), [], '/home/me', 'gmx-cypher 0.1.0');
    const pid = (before.projects[0] as { id: string }).id;
    writeInSpace(dir, spacePaths.view(pid, 'two runs'), '{}\n', 'x');
    expect(await matrixView(dir)).toEqual(before);
    expect(outside(dir)).toEqual(files);
  });
});
