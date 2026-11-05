// Building (R5a): a system's folder is the build's own, a step writes only what does not exist and replaces only
// what this build wrote, nothing is written outside the system's folder, and every file written or replaced is in
// <system>/build.json with its size and SHA-256, GROMACS's backups included. gmx is a stand-in here that writes what
// each step says it writes, backing up an existing output as GROMACS does; R5b runs the fake tools.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Builder, type BuildRecord, type Exec } from '../server/build-run';
import { DEFAULT_PLAN, type BuildPlan } from '../src/lib/build/plan';
import { tmp } from './helpers';

const GRO = readFileSync(new URL('./fixtures/decypher/mmmmmmmm.gro', import.meta.url), 'utf8');
/** Only the saccharide's tiles: copy it, centre it (trjconv), shift and align it (editconf), and the rename back. */
const SACCHARIDE: BuildPlan = {
  ...DEFAULT_PLAN,
  stages: DEFAULT_PLAN.stages.map(s => (s.id === 'sb' ? { ...s, tiles: s.tiles.map(t => ({ ...t, on: t.type === 'saccharide' || t.mol === 'saccharide' })) } : { ...s, on: false })),
};
const SYSTEMS = { methods: ['hmr+fast+6'], saccharides: ['o111'], sequences: ['aaaaaaaa', 'cccccccc'], repeats: 0 };

/** Every file under a folder with its SHA-256: the before/after listing. */
function listing(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out[relative(dir, p)] = createHash('sha256').update(readFileSync(p)).digest('hex'); } };
  walk(dir);
  return out;
}

function setup(extra: (args: string[], cwd: string) => void = () => {}) {
  const home = tmp('home'), base = tmp('base');
  mkdirSync(join(base, 'molecules/saccharides'), { recursive: true });
  writeFileSync(join(base, 'molecules/saccharides/o111.gro'), GRO);
  mkdirSync(join(base, 'ff'));
  writeFileSync(join(base, 'ff/keep.itp'), '; yours\n');
  const runs: string[][] = [];
  let n = 0;
  // gmx as a stand-in: -o is a copy of -f, an existing -o backed up to #name.N# first, as GROMACS does.
  const exec: Exec = spec => {
    runs.push(spec.args);
    const id = 'j' + ++n, f = spec.args[spec.args.indexOf('-f') + 1], o = spec.args[spec.args.indexOf('-o') + 1];
    extra(spec.args, spec.cwd);
    const out = join(spec.cwd, o);
    if (existsSync(out)) { let k = 1; while (existsSync(join(spec.cwd, '#' + o + '.' + k + '#'))) k++; renameSync(out, join(spec.cwd, '#' + o + '.' + k + '#')); copyFileSync(join(spec.cwd, '#' + o + '.' + k + '#'), out); }
    else copyFileSync(join(spec.cwd, f), out);
    return { id, done: Promise.resolve({ status: 'done' as const, code: 0, log: '' }) };
  };
  const builder = new Builder({ home, version: '0', exec, tools: () => ({ gmx: '/usr/bin/gmx', python: null }) });
  return { home, base, builder, runs };
}

describe('a system\'s folder, its steps and its record', () => {
  it('creates the folder, runs each step in order, and records every file it wrote or replaced', async () => {
    const { base, builder, runs } = setup(), before = listing(base);
    const run = await builder.start(SACCHARIDE, { ...SYSTEMS, sequences: ['aaaaaaaa'] }, { base, ifExists: 'continue', onFailure: 'next' }).done;
    expect(run.status).toBe('done');
    expect(run.systems[0]).toMatchObject({ dir: 'solutions/hmr+fast+6/o111/aaaaaaaa', status: 'built', step: 4, steps: 4 });
    expect(runs.map(a => a[0])).toEqual(['trjconv', 'editconf']);
    const S = 'solutions/hmr+fast+6/o111/aaaaaaaa', rec: BuildRecord = JSON.parse(readFileSync(join(base, S, 'build.json'), 'utf8'));
    expect(rec).toMatchObject({ format: 'gmx-cypher build', version: 1, build: run.id, status: 'built', system: { dir: S, method: 'hmr+fast+6' } });
    expect(rec.steps.map(s => [s.label, s.status])).toEqual([['copy the saccharide', 'done'], ['centre the saccharide', 'done'], ['shift and align the saccharide', 'done'], ['o111_princ.gro → o111.gro', 'done']]);
    expect(rec.folders).toEqual(['solutions', 'solutions/hmr+fast+6', 'solutions/hmr+fast+6/o111', S]);
    // The renamed file is gone from the record; o111.gro is the rename's, and trjconv's backup is listed.
    expect(Object.keys(rec.files).sort()).toEqual([S + '/#o111.gro.1#', S + '/o111.gro']);
    expect(rec.backups).toEqual([S + '/#o111.gro.1#']);
    const gro = join(base, S, 'o111.gro');
    expect(rec.files[S + '/o111.gro']).toEqual({ size: statSync(gro).size, sha256: createHash('sha256').update(readFileSync(gro)).digest('hex'), step: 3 });
    // Nothing outside the system's folder changed.
    const after = listing(base);
    expect(Object.fromEntries(Object.entries(after).filter(([k]) => !k.startsWith(S + '/')))).toEqual(before);
  });

  it('refuses to overwrite a file it did not write, and says which', async () => {
    // trjconv's stand-in also leaves o111_princ.gro, which the next step (editconf) would write.
    const { base, builder } = setup((args, cwd) => { if (args[0] === 'trjconv') writeFileSync(join(cwd, 'o111_princ.gro'), 'not yours to overwrite\n'); });
    const run = await builder.start(SACCHARIDE, { ...SYSTEMS, sequences: ['aaaaaaaa'] }, { base, ifExists: 'continue', onFailure: 'next' }).done;
    const S = 'solutions/hmr+fast+6/o111/aaaaaaaa';
    expect(run.systems[0]).toMatchObject({ status: 'failed', error: 'SB · shift and align the saccharide: ' + S + '/o111_princ.gro exists, and this build did not write it: nothing is overwritten' });
    expect(readFileSync(join(base, S, 'o111_princ.gro'), 'utf8')).toBe('not yours to overwrite\n');
    const rec: BuildRecord = JSON.parse(readFileSync(join(base, S, 'build.json'), 'utf8'));
    expect(rec.steps.at(-1)).toMatchObject({ label: 'shift and align the saccharide', status: 'refused' });
  });

  it('leaves a folder that exists as it is', async () => {
    const { base, builder } = setup(), S = join(base, 'solutions/hmr+fast+6/o111/aaaaaaaa');
    mkdirSync(S, { recursive: true });
    writeFileSync(join(S, 'notes.txt'), 'mine\n');
    const run = await builder.start(SACCHARIDE, SYSTEMS, { base, ifExists: 'continue', onFailure: 'next' }).done;
    expect(run.systems.map(s => s.status)).toEqual(['skipped', 'built']);
    expect(readdirSync(S)).toEqual(['notes.txt']);
  });

  it('a failure stops that system; the build goes on, or stops, as asked', async () => {
    const fail = () => { throw new Error('the stand-in failed'); };
    const a = setup(args => args[0] === 'editconf' && fail());
    expect((await a.builder.start(SACCHARIDE, SYSTEMS, { base: a.base, ifExists: 'continue', onFailure: 'next' }).done).systems.map(s => s.status)).toEqual(['failed', 'failed']);
    const b = setup(args => args[0] === 'editconf' && fail());
    const stopped = await b.builder.start(SACCHARIDE, SYSTEMS, { base: b.base, ifExists: 'continue', onFailure: 'stop' }).done;
    expect(stopped.systems.map(s => [s.status, s.notes])).toEqual([['failed', []], ['skipped', ['the build stopped at solutions/hmr+fast+6/o111/aaaaaaaa']]]);
    expect(stopped.status).toBe('failed');
    expect(existsSync(join(b.base, 'solutions/hmr+fast+6/o111/cccccccc'))).toBe(false);
  });

  it('GROMACS\'s fatal text stops a system whatever the exit code; strict mode stops on any non-zero exit', async () => {
    const fatal = readFileSync(new URL('./fixtures/build/notebook/grompp-awh-fatal.txt', import.meta.url), 'utf8');
    const { base, home } = setup();
    const exec = (log: string, code: number): Exec => () => ({ id: 'j', done: Promise.resolve({ status: code ? 'failed' as const : 'done' as const, code, log }) });
    const one = { ...SYSTEMS, sequences: ['aaaaaaaa'] };
    const r1 = await new Builder({ home, version: '0', exec: exec(fatal, 0), tools: () => ({ gmx: 'gmx', python: null }) }).start(SACCHARIDE, one, { base, ifExists: 'continue', onFailure: 'next' }).done;
    expect(r1.systems[0].error).toBe('SB · centre the saccharide: Fatal error:\nDistance between pull groups 1 and 2 (3.657996 nm) is larger than 0.49 times\nthe box size (3.406945).');
    const strict = { ...SACCHARIDE, science: { ...SACCHARIDE.science, strict: true } }, b2 = tmp('base');
    mkdirSync(join(b2, 'molecules/saccharides'), { recursive: true }); writeFileSync(join(b2, 'molecules/saccharides/o111.gro'), GRO);
    const r2 = await new Builder({ home: tmp('home'), version: '0', exec: exec('', 2), tools: () => ({ gmx: 'gmx', python: null }) }).start(strict, one, { base: b2, ifExists: 'continue', onFailure: 'next' }).done;
    expect(r2.systems[0].error).toBe('SB · centre the saccharide: exit 2');
  });

  it('one build at a time; a run gmx-cypher stopped during is interrupted, not invented', async () => {
    const { base, home, builder } = setup();
    const { done } = builder.start(SACCHARIDE, SYSTEMS, { base, ifExists: 'continue', onFailure: 'next' });
    expect(() => builder.start(SACCHARIDE, SYSTEMS, { base, ifExists: 'continue', onFailure: 'next' })).toThrow('a build is running: one at a time');
    const run = await done;
    const file = join(home, 'builds/runs', run.id + '.json');
    writeFileSync(file, JSON.stringify({ ...run, status: 'running', ended: undefined, systems: run.systems.map((s, i) => ({ ...s, status: i ? 'waiting' : 'building' })) }));
    const again = new Builder({ home, version: '0', exec: () => { throw new Error('nothing runs'); }, tools: () => ({ gmx: null, python: null }) });
    expect(again.get(run.id)).toMatchObject({ status: 'interrupted', systems: [{ status: 'cancelled', error: 'gmx-cypher stopped while this build ran' }, { status: 'cancelled' }] });
  });
});
