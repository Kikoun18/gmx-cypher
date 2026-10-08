import { describe, expect, it } from 'vitest';
import { parseGmxHeader } from '../src/lib/gmxHeader';
import { MemoryBackend } from '../src/lib/storage/backend/memory';
import { readHeaderCache, writeHeaderCache } from '../src/lib/storage/cache';
import { runXvg } from '../src/lib/storage/reconstruct';
import { fixture, rdfFixture, text } from './helpers';

const AWH = text(fixture('hmrfast6_ha_a_t200000.xvg'));
const gmx = (f: string) => text(fixture('gmx/' + f));
const awhHeader = {
  version: '2025.4-PLUMED_spack', tool: 'gmx awh', created: 'Mon Sep 21 12:27:52 2026',
  executable: '/cvmfs/software.metacentrum.cz/spack23/software/linux-debian12-x86_64_v4/gcc-12.2.0/gromacs-2025.4-zy3xd7m7jk6bq4lrkbhtrymiidwpbjlf/bin/gmx_mpi',
  workdir: '/mnt/storage-brno14-ceitec/shared/softmatter/SHARED/forKrystof/walkers_for_denys/hmr+fast+6/ha/a/9.multiwalker/1',
  command: 'gmx_mpi awh -f 9.multiwalker.edr -s 9.multiwalker.tpr -o 9.multiwalker.xvg -skip 5',
};

describe('parseGmxHeader (R1a)', () => {
  it('the real gmx awh header', () => expect(parseGmxHeader(AWH)).toEqual(awhHeader));
  it('CRLF line endings give the same result', () => expect(parseGmxHeader(AWH.replace(/\n/g, '\r\n'))).toEqual(awhHeader));
  it('plain `gmx` as the binary', () => {
    expect(parseGmxHeader(AWH.replace('#   gmx_mpi awh', '#   gmx awh'))!.command).toBe('gmx awh -f 9.multiwalker.edr -s 9.multiwalker.tpr -o 9.multiwalker.xvg -skip 5');
  });
  it('no header, and a reconstructed file → null', () => {
    expect(parseGmxHeader(text(rdfFixture))).toBeNull();
    expect(parseGmxHeader(runXvg({ id: 'r1', sacch: 'ha', run: 'a', time: '', temp: 300, tags: [], file: 'x.xvg', added: '', x: [0, 1], y: [1, 2] }, 'test'))).toBeNull();
    expect(parseGmxHeader('')).toBeNull();
  });
  it('only the leading comment block is read', () => {
    expect(parseGmxHeader('0 1\n' + AWH)).toBeNull();
  });
  it.each([
    // file, tool, version, executable ends with, command starts with, workdir ends with, created
    ['hist_500000.xvg', 'gmx wham', '2022.3-plumed_2.8.1', '/gmx_mpi_sse4.1', 'gmx_mpi_sse4.1 wham -it tpr-files.dat', '/pulling_4028_vlastni_bins/wham', 'Thu Jan 23 09:44:49 2025'],
    ['07.md_rdf_protein_sugar.xvg', 'gmx rdf', '2021.4', '/gmx_mpi_sse4.1', 'gmx_mpi_sse4.1 rdf', '/tLys+O127/simulations/07_md', 'Tue Aug 26 16:05:53 2025'],
    ['07.md_mindist_protein_sugar.xvg', 'gmx mindist', '2021.4', '/gmx_mpi_sse4.1', 'gmx_mpi_sse4.1 mindist -f 07_md.xtc', '/tArg+O127/simulations/07_md', 'Tue Aug 26 13:30:32 2025'],
    ['07.md_hbdist_protein_sugar.xvg', 'gmx hbond', '2021.4-PLUMED-spack', '/bin/gmx_mpi', 'gmx_mpi hbond -f 07_md.xtc', '/tArg+O127/simulations/07_md', 'Tue Aug 26 15:51:08 2025'],
  ])('%s', (f, tool, version, exe, cmd, wd, created) => {
    const h = parseGmxHeader(gmx(f))!;
    expect([h.tool, h.version, h.created]).toEqual([tool, version, created]);
    expect(h.executable!.endsWith(exe)).toBe(true);
    expect(h.command!.startsWith(cmd)).toBe(true);
    expect(h.workdir!.endsWith(wd)).toBe(true);
    // The command ends before "# gmx … is part of G R O M A C S:" and the quip after it.
    expect(h.command).not.toMatch(/G R O M A C S|#/);
  });
  it('quoted arguments and the longest real command line are kept verbatim', () => {
    const line = gmx('07.md_hbdist_protein_sugar.xvg').split('\n').find(l => l.startsWith('#   gmx'))!.slice(4);
    expect(line.length).toBeGreaterThan(200);
    expect(parseGmxHeader(gmx('07.md_hbdist_protein_sugar.xvg'))!.command).toBe(line);
    const rdf = parseGmxHeader(gmx('07.md_rdf_protein_sugar.xvg'))!.command!;
    expect(rdf).toContain("-ref 'group 28' -sel 'group 1'");
  });
  it('a field missing from the header is null, not guessed', () => {
    const h = parseGmxHeader(AWH.replace(/^# Working dir:.*\n/m, ''))!;
    expect(h.workdir).toBeNull();
    expect(h.tool).toBe('gmx awh');
  });
});

describe('header cache', () => {
  it('round-trips, including "no header", and ignores another parser version', async () => {
    const b = new MemoryBackend();
    expect(await readHeaderCache(b, 'abc')).toBeUndefined();
    await writeHeaderCache(b, 'abc', parseGmxHeader(AWH));
    expect(await readHeaderCache(b, 'abc')).toEqual(awhHeader);
    await writeHeaderCache(b, 'none', null);
    expect(await readHeaderCache(b, 'none')).toBeNull();
    const p = '.matrix/cache/parsed/abc.gmx-header-1.json';
    await b.writeText(p, (await b.readText(p)).replace('gmx-header@1', 'gmx-header@0'));
    expect(await readHeaderCache(b, 'abc')).toBeUndefined();
  });
});
