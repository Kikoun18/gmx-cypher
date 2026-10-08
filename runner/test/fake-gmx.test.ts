import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectAna, getAnalyses, parseTable } from '../../app/src/lib/seq';
import { parseGmxHeader } from '../../app/src/lib/gmxHeader';
import { FAKE_GMX, tmp } from './helpers';

function system() {
  const dir = tmp('sys');
  writeFileSync(join(dir, 'g.ndx'), '[ sulfur ]\n   5   10\n[ water_O ]\n  43   47\n[ sodium ]\n  31   32\n');
  return dir;
}

describe('the fake gmx', () => {
  it('answers rdf -h with the real 2025.4 help on stdout', () => {
    const out = execFileSync(FAKE_GMX, ['rdf', '-h'], { encoding: 'utf8' });
    expect(out).toBe(readFileSync(new URL('./fixtures/gmx-2025.4/rdf-h.txt', import.meta.url), 'utf8'));
  });

  it('writes an RDF that PMF Sequences reads as an RDF, with its own command, working directory and group names', () => {
    const dir = system();
    const r = spawnSync(FAKE_GMX, ['rdf', '-f', 'nvt.xtc', '-s', 'nvt.tpr', '-n', 'g.ndx', '-ref', 'group 0', '-sel', 'group 1', 'group 2', '-o', 'rdf.xvg', '-cn', 'cn.xvg'], { cwd: dir, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('\rReading frame       3 time    3.000   ');
    expect(r.stderr).toContain('Analyzed 11 frames, last time 10.000');
    const text = readFileSync(join(dir, 'rdf.xvg'), 'utf8');
    const h = parseGmxHeader(text)!, t = parseTable(text);
    expect(h).toMatchObject({ tool: 'gmx rdf', version: '2025.4-PLUMED_spack', workdir: dir });
    expect(h.command).toBe("gmx_mpi rdf -f nvt.xtc -s nvt.tpr -n g.ndx -ref 'group 0' -sel 'group 1' 'group 2' -o rdf.xvg -cn cn.xvg");
    expect(t.head.legends).toEqual(['water_O', 'sodium']);
    expect(t.cols).toHaveLength(3);
    expect(detectAna(getAnalyses(null), 'rdf.xvg', t.head, h.tool).k).toBe('rdf');
    expect(parseTable(readFileSync(join(dir, 'cn.xvg'), 'utf8')).head.title).toBe('Cumulative Number RDF');
  });

  it('fails like GROMACS on a missing group, and on request', () => {
    const dir = system();
    const r = spawnSync(FAKE_GMX, ['rdf', '-f', 'x.xtc', '-s', 'x.tpr', '-n', 'g.ndx', '-ref', 'group 0', '-sel', 'group 7', '-o', 'o.xvg'], { cwd: dir, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Cannot match 'group 7', because no such index group can be found.");
    expect(existsSync(join(dir, 'o.xvg'))).toBe(false);
    const f = spawnSync(FAKE_GMX, ['rdf', '-n', 'g.ndx', '-ref', 'group 0', '-sel', 'group 1', '-o', 'o.xvg'], { cwd: dir, encoding: 'utf8', env: { ...process.env, FAKE_GMX_FAIL: '1' } });
    expect(f.status).toBe(1);
  });

  it('backs up an existing output as GROMACS does', () => {
    const dir = system();
    writeFileSync(join(dir, 'o.xvg'), 'mine');
    const r = spawnSync(FAKE_GMX, ['rdf', '-n', 'g.ndx', '-ref', 'group 0', '-sel', 'group 1', '-o', 'o.xvg'], { cwd: dir, encoding: 'utf8' });
    expect(r.stderr).toContain('Back Off! I just backed up o.xvg to ./#o.xvg.1#');
    expect(readFileSync(join(dir, '#o.xvg.1#'), 'utf8')).toBe('mine');
  });
});
