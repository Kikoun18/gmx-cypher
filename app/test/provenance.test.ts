import { describe, expect, it } from 'vitest';
import { fixture, newVault, rdfFixture, reopen, withPmf } from './helpers';
import { runXvg } from '../src/lib/storage/reconstruct';

const XVG = 'hmrfast6_ha_a_t200000.xvg';
const want = {
  tool: 'gmx awh', version: '2025.4-PLUMED_spack', created: 'Mon Sep 21 12:27:52 2026',
  command: 'gmx_mpi awh -f 9.multiwalker.edr -s 9.multiwalker.tpr -o 9.multiwalker.xvg -skip 5',
  workdir: '/mnt/storage-brno14-ceitec/shared/softmatter/SHARED/forKrystof/walkers_for_denys/hmr+fast+6/ha/a/9.multiwalker/1',
};

async function project(bytes = fixture(XVG), origin?: 'reconstructed') {
  const v = await newVault();
  const a = withPmf(v.svc.store, { name: 'WRWYCR', col: 'ha', file: XVG, bytes });
  if (origin) for (const u of a.uploads.values()) u.origin = origin;
  v.svc.commit(a.store, a.uploads);
  await v.svc.flush();
  return { ...v, fileId: a.fileId };
}

describe('ProjectService.provenance (R1e)', () => {
  it('reads the original once and caches the parsed header', async () => {
    const { b, svc, fileId } = await project();
    expect(await svc.provenance(fileId)).toMatchObject(want);
    const sha = svc.fileMeta(fileId)!.sha256;
    expect(await b.stat('.matrix/cache/parsed/' + sha + '.gmx-header-1.json')).not.toBeNull();
  });
  it('survives close → reopen, and deleting .matrix/cache/', async () => {
    const { b, svc, fileId } = await project();
    await svc.provenance(fileId);
    expect(await (await reopen(b)).svc.provenance(fileId)).toMatchObject(want);
    await b.remove('.matrix/cache', { recursive: true });
    const again = await reopen(b);
    expect(await again.svc.provenance(fileId)).toMatchObject(want);
  });
  it('a file without a GROMACS header, and a reconstructed file, have none', async () => {
    const plain = await project(rdfFixture);
    expect(await plain.svc.provenance(plain.fileId)).toBeNull();
    const rec = await project(new TextEncoder().encode(runXvg({ id: 'r', sacch: 'ha', run: 'a', time: '', temp: 300, tags: [], file: XVG, added: '', x: [0, 1, 2, 3, 4], y: [1, 2, 3, 2, 1] }, 'test')), 'reconstructed');
    expect(await rec.svc.provenance(rec.fileId)).toBeNull();
  });
  it('an unknown file id has none', async () => {
    const { svc } = await project();
    expect(await svc.provenance('fnope')).toBeNull();
  });
});

describe('review fixes', () => {
  it('an original that can’t be read is an error, not "no provenance", and nothing is cached', async () => {
    const { b, svc, fileId } = await project();
    const f = svc.fileMeta(fileId)!;
    await b.remove(f.path);
    await expect(svc.provenance(fileId)).rejects.toThrow();
    expect(await b.stat('.matrix/cache/parsed/' + f.sha256 + '.gmx-header-1.json')).toBeNull();
  });
});
