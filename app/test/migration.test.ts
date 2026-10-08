import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pjoin } from 'node:path';
import { MemoryBackend } from '../src/lib/storage/backend/memory';
import { NodeBackend } from '../scripts/node-backend';
import { interpretDump, parseDump, type LegacyDump } from '../src/lib/storage/migration/legacy';
import { migrateLegacy } from '../src/lib/storage/migration/migrate';
import { sha256Hex } from '../src/lib/storage/json';
import { NotEmptyError, Vault } from '../src/lib/storage/vault';
import { readManifest } from '../src/lib/storage/manifest';
import { VaultIO } from '../src/lib/storage/io';
import { fixture, newVault } from './helpers';

const dumpText = readFileSync(new URL('./fixtures/legacy-dump.json', import.meta.url), 'utf8');
const dump = () => parseDump(dumpText);
const tmpDirs: string[] = [];
afterEach(() => { for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

async function openFirst(b: MemoryBackend | NodeBackend, name: string) {
  const vault = await Vault.open(b);
  const p = (await vault.listProjects()).find(x => x.name === name)!;
  const svc = await vault.openProject(p.id, { notes: 'eager' });
  await svc.verified;
  return { vault, svc };
}

describe('legacy migration', () => {
  for (const kind of ['memory', 'node'] as const) {
    it('migrates the fixture end to end and verifies it (' + kind + ' backend)', async () => {
      let b: MemoryBackend | NodeBackend;
      if (kind === 'memory') b = new MemoryBackend();
      else { const d = mkdtempSync(pjoin(tmpdir(), 'pmf-mig-')); tmpDirs.push(d); b = new NodeBackend(d); }
      const { report, vault } = await migrateLegacy(b, interpretDump(dump()));
      await vault.close();
      expect(report.ok).toBe(true);
      expect(report.projects.map(p => [p.id, p.name])).toEqual([['pmf2k81000', 'Sugar PMFs'], ['pmf3a00000', 'Ion pairs 2027'], ['pmf4b00000', 'Recovered pmf4b00000']]);
      expect(report.projects[0].counts).toEqual({ rows: 3, runs: 5, analyses: 2, curves: 3, structures: 3, rowNotes: 1, cellNotes: 2, literature: 1, pages: 2, columns: 4 });
      expect(report.projects.every(p => p.problems.length === 0)).toBe(true);
      expect(report.prefs).toEqual({ dark: true, laserKey: 'l', laserMode: 'hold', laserColor: '#00c853', laserSize: 'l', laserTrail: false });
      expect(report.warnings.some(w => w.includes('not in the project index'))).toBe(true);

      // Manifest provenance.
      const m = await readManifest(new VaultIO(b));
      expect(m!.migratedFrom).toContain('http://localhost:8000');
      expect(m!.migration!.verified).toBe(true);

      const { svc } = await openFirst(b, 'Sugar PMFs');
      // Structures from IndexedDB: same bytes, marked as migrated.
      const row = svc.store.seqs.find(s => s.id === 'smf2k81q0a')!;
      for (const [sid, file] of [['stmf2k81q5f', 'test.pdb'], ['stmf2k81q6g', 'WTA.gro']] as const) {
        const st = row.structures.find(x => x.id === sid)!;
        expect(await sha256Hex(await svc.readUpload(st.fileId!))).toBe(await sha256Hex(fixture(file)));
        expect(svc.fileMeta(st.fileId!)!.origin).toBe('migrated-from-indexeddb');
      }
      // Reconstructed files: named and marked as such, with a header saying so.
      const run = row.runs.find(r => r.id === 'rmf2k81q1b')!;
      const meta = svc.fileMeta(run.src!.fileId)!;
      expect(meta.origin).toBe('reconstructed');
      expect(meta.path.endsWith('/hmrfast6_ha_a_t200000.reconstructed.xvg')).toBe(true);
      expect((await (await svc.readUpload(meta.id)).text()).startsWith('# RECONSTRUCTED')).toBe(true);
      expect(report.projects[0].reconstructed).toContain(meta.path);
      // The structure the prototype had already lost is kept, as a missing file.
      const lost = svc.store.seqs.find(s => s.id === 'smf2k81q7h')!.structures[0];
      expect(lost.name).toBe('lost-model.pdb');
      expect(lost.state).toBe('missing');
      // Notes as Markdown with frontmatter, text unchanged.
      const notePath = svc.state.notes.get('cell:cs:smf2k81qbl')!.path;
      expect(await b.readText(notePath)).toBe('---\nid: ' + svc.state.notes.get('cell:cs:smf2k81qbl')!.id + '\ntype: cell-note\nowner: smf2k81qbl\ncolumn: cs\n---\nÜnïcödé note — “quotes”, emoji 🙂\n');
    });
  }

  it('never changes the legacy data', async () => {
    const d = dump(), before = JSON.stringify(d);
    await migrateLegacy(new MemoryBackend(), interpretDump(d));
    expect(JSON.stringify(d)).toBe(before);
  });

  it('refuses a non-empty folder, and re-keys colliding project IDs when migrating into an existing vault', async () => {
    const c = new MemoryBackend();
    await c.writeText('thesis.docx', 'x');
    await expect(migrateLegacy(c, interpretDump(dump()))).rejects.toBeInstanceOf(NotEmptyError);

    const { b, vault } = await newVault();
    await vault.createProject('Clash', { id: 'pmf3a00000' });
    await vault.close();
    await expect(migrateLegacy(b, interpretDump(dump()))).rejects.toBeInstanceOf(NotEmptyError);
    const { report } = await migrateLegacy(b, interpretDump(dump()), { intoExisting: true });
    expect(report.ok).toBe(true);
    const ions = report.projects.find(p => p.name === 'Ion pairs 2027')!;
    expect(ions.id).not.toBe('pmf3a00000');
    expect(report.warnings.some(w => w.includes('already used'))).toBe(true);
  });

  it('verification catches data that did not survive', async () => {
    class Lossy extends MemoryBackend {
      async writeText(path: string, text: string) { return super.writeText(path, path.endsWith('note.md') ? text.replace('Binds', 'Bonds') : text); }
    }
    const { report } = await migrateLegacy(new Lossy(), interpretDump(dump()));
    expect(report.ok).toBe(false);
    expect(report.projects[0].problems.join('\n')).toMatch(/notes\.row/);
  });

  it('reads the single-dataset version (no project index), taking data settings from the settings key', async () => {
    const d = dump();
    const ls: LegacyDump['localStorage'] = { 'pmf-seq-store-v1': d.localStorage['pmf-seq-store-v1'], 'pmf-seq-settings-v1': JSON.stringify({ dark: false, temp: '298', pattern: '{name}_{column}.xvg' }) };
    const store = JSON.parse(ls['pmf-seq-store-v1']);
    delete store.settings;
    ls['pmf-seq-store-v1'] = JSON.stringify(store);
    const data = interpretDump({ ...d, localStorage: ls });
    expect(data.projects.map(p => p.name)).toEqual(['My project']);
    expect(data.projects[0].store.settings).toMatchObject({ temp: '298', pattern: '{name}_{column}.xvg' });
    expect(data.prefs).toEqual({ dark: false });
    const { report } = await migrateLegacy(new MemoryBackend(), data);
    expect(report.ok).toBe(true);
  });

  it('a lost file put back anywhere in the project folder is found again by name', async () => {
    const b = new MemoryBackend();
    const { vault } = await migrateLegacy(b, interpretDump(dump()));
    await vault.close();
    let { vault: v, svc } = await openFirst(b, 'Sugar PMFs');
    expect(svc.report.missing.map(m => m.path.split('/').pop())).toEqual(['lost-model.pdb']);
    await b.writeText(svc.projectDir + '/lost-model.pdb', 'ATOM      1  N   GLY A   1       0.000   0.000   0.000\n');
    await v.close();
    ({ vault: v, svc } = await openFirst(b, 'Sugar PMFs'));
    expect(svc.report.missing).toEqual([]);
    expect(svc.report.untracked).toEqual([]);
    expect(svc.store.seqs.find(s => s.id === 'smf2k81q7h')!.structures[0].state).toBeUndefined();
  });
});
