import { useCallback, useEffect, useRef, useState } from 'react';
import App from './App';
import { loadPrefs, savePrefs } from './lib/prefs';
import { FsAccessBackend, fsAccessSupported, pickDirectory, queryWrite, requestWrite } from './lib/storage/backend/fsAccess';
import { MemoryBackend } from './lib/storage/backend/memory';
import { webLocks } from './lib/storage/locks';
import { NotAVaultError, NotEmptyError, Vault, isEmptyFolder, isVault } from './lib/storage/vault';
import { importAsProject } from './lib/storage/exchange';
import { forgetVault, listVaultHandles, rememberVault, type VaultHandle } from './lib/vaultHandles';
import { hasBrowserLegacy, interpretDump, parseDump, readBrowserLegacy, removeBrowserLegacy, type LegacyData } from './lib/storage/migration/legacy';
import { migrateLegacy, type MigrationReport } from './lib/storage/migration/migrate';
import { MigrationReportView } from './components/MigrationReport';

type Phase =
  | { k: 'boot' }
  | { k: 'start' }
  | { k: 'unsupported' }
  | { k: 'open'; vault: Vault; handle: FileSystemDirectoryHandle | null; startProject: string | null; viewer?: boolean }
  | { k: 'report'; report: MigrationReport; vault: Vault; handle: FileSystemDirectoryHandle; fromBrowser: boolean };

interface LegacySource { data: LegacyData; label: string; fromBrowser: boolean }
const legacySummary = (d: LegacyData) => {
  const rows = d.projects.reduce((n, p) => n + p.store.seqs.length, 0), runs = d.projects.reduce((n, p) => n + p.store.seqs.reduce((m, q) => m + q.runs.length, 0), 0);
  return d.projects.length + ' project' + (d.projects.length === 1 ? '' : 's') + ' · ' + rows + ' sequences · ' + runs + ' runs · ' + Object.keys(d.structures).length + ' structure files';
};

const errText = (e: unknown) => String((e as Error)?.message || e);
const aborted = (e: unknown) => (e as DOMException)?.name === 'AbortError';

/**
 * The vault picker. A vault is a folder the user owns; the app opens it with the
 * File System Access API, remembers the handle (only the handle) for next time,
 * and reconnects without a picker when the browser still grants access.
 */
export default function Root() {
  const [phase, setPhase] = useState<Phase>({ k: 'boot' });
  const [recent, setRecent] = useState<VaultHandle[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<{ handle: FileSystemDirectoryHandle } | null>(null);
  const [browserLegacy, setBrowserLegacy] = useState<LegacySource | null>(null);
  const [dumpLegacy, setDumpLegacy] = useState<LegacySource | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const dark = !!loadPrefs().dark;
  useEffect(() => { document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'); }, [dark]);

  const openVault = useCallback(async (handle: FileSystemDirectoryHandle, o: { create?: boolean; startProject?: string | null } = {}) => {
    const b = new FsAccessBackend(handle);
    let vault: Vault;
    if (o.create) {
      if (await isVault(b)) throw new Error('“' + handle.name + '” is already a vault — use Open vault.');
      vault = (await Vault.create(b, { projectName: 'My project', lock: webLocks })).vault;
    } else {
      if (!(await isVault(b))) throw new NotAVaultError();
      vault = await Vault.open(b, { lock: webLocks });
    }
    await rememberVault({ vaultId: vault.manifest.vaultId, name: handle.name, handle });
    const known = (await listVaultHandles()).find(v => v.vaultId === vault.manifest.vaultId);
    setPhase({ k: 'open', vault, handle, startProject: o.startProject ?? known?.lastProjectId ?? null });
  }, []);

  // Boot: reopen the last vault straight away if the browser still grants access.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      if (!fsAccessSupported()) { setPhase({ k: 'unsupported' }); return; }
      // Data from the prototype in this browser: offer to migrate it (read only; nothing is changed).
      if (hasBrowserLegacy()) {
        try { const data = interpretDump(await readBrowserLegacy()); if (data.projects.length) setBrowserLegacy({ data, label: 'this browser', fromBrowser: true }); } catch { /* unreadable: no offer */ }
      }
      const list = await listVaultHandles();
      setRecent(list);
      const last = list[0];
      if (last && (await queryWrite(last.handle).catch(() => 'denied')) === 'granted') {
        try { await openVault(last.handle, { startProject: last.lastProjectId }); return; } catch (e) { setErr(errText(e)); }
      }
      setPhase({ k: 'start' });
    })();
  }, [openVault]);

  const run = async (f: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await f(); } catch (e) { if (!aborted(e)) setErr(errText(e)); }
    setBusy(false);
  };

  const create = () => run(async () => {
    const h = await pickDirectory();
    try { await openVault(h, { create: true }); } catch (e) {
      if (e instanceof NotEmptyError) throw new Error('“' + h.name + '” isn’t empty. A new vault needs an empty folder (hidden system files and a bare .git are fine) — make one and pick it.');
      throw e;
    }
  });
  const open = () => run(async () => {
    const h = await pickDirectory();
    try { await openVault(h); } catch (e) {
      if (!(e instanceof NotAVaultError)) throw e;
      if (await isEmptyFolder(new FsAccessBackend(h))) { setAsk({ handle: h }); return; }
      throw new Error('“' + h.name + '” isn’t a PMF Sequences vault (it has no .matrix/manifest.json). Pick the vault folder itself, or create a new vault in an empty folder.');
    }
  });
  const reconnect = (v: VaultHandle) => run(async () => {
    const p = await requestWrite(v.handle);
    if (p !== 'granted') throw new Error('Access to “' + v.name + '” wasn’t granted.');
    await openVault(v.handle, { startProject: v.lastProjectId });
  });
  // Migration (spec §16): pick an empty folder (or confirm an existing vault), convert, verify, report.
  const migrate = (src: LegacySource) => run(async () => {
    const h = await pickDirectory();
    const b = new FsAccessBackend(h);
    let intoExisting = false;
    if (!(await isEmptyFolder(b))) {
      if (!(await isVault(b))) throw new Error('“' + h.name + '” isn’t empty. Migrate into an empty folder (hidden system files and a bare .git are fine), or into an existing vault.');
      if (!window.confirm('“' + h.name + '” is an existing vault. Add the migrated projects to it? (Projects whose ID is already used get a new one.)')) return;
      intoExisting = true;
    }
    setProgress('Migrating…');
    try {
      const { report, vault } = await migrateLegacy(b, src.data, { lock: webLocks, intoExisting, progress: setProgress });
      await rememberVault({ vaultId: vault.manifest.vaultId, name: h.name, handle: h });
      // Theme and laser settings from the old app, unless this browser already has preferences.
      if (report.ok && !Object.keys(loadPrefs()).length && Object.keys(report.prefs).length) savePrefs(report.prefs);
      setPhase({ k: 'report', report, vault, handle: h, fromBrowser: src.fromBrowser });
    } finally { setProgress(null); }
  });
  const loadDump = (file: File) => run(async () => {
    const data = interpretDump(parseDump(await file.text()));
    if (!data.projects.length) throw new Error(file.name + ' contains no projects.');
    setDumpLegacy({ data, label: file.name, fromBrowser: false });
  });

  const forget = async (v: VaultHandle) => { await forgetVault(v.vaultId); setRecent(await listVaultHandles()); };

  // Unsupported browsers: look at a JSON export in memory. Nothing is written anywhere.
  const viewJson = (file: File) => run(async () => {
    const prep = await importAsProject(await file.text());
    const mem = new MemoryBackend();
    const { vault, projectId } = await Vault.create(mem, { projectName: prep.name || file.name.replace(/\.json$/i, '') });
    const svc = await vault.openProject(projectId!, { notes: 'eager' });
    svc.commit({ ...prep.store, cols: prep.store.cols }, prep.uploads);
    await svc.flush();
    await svc.close();
    vault.io.readOnly = true;
    setPhase({ k: 'open', vault, handle: null, startProject: projectId, viewer: true });
  });

  const leave = useCallback(async () => {
    if (phase.k === 'open') await phase.vault.close();
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setRecent(await listVaultHandles());
    setPhase(fsAccessSupported() ? { k: 'start' } : { k: 'unsupported' });
  }, [phase]);

  if (phase.k === 'report') {
    const ph = phase;
    return (
      <div data-theme={dark ? 'dark' : 'light'} style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '40px 16px', background: 'var(--bg)', color: 'var(--ink)' }}>
        <MigrationReportView report={ph.report} vaultName={ph.handle.name} fromBrowser={ph.fromBrowser}
          onOpen={() => { setBrowserLegacy(null); setDumpLegacy(null); setPhase({ k: 'open', vault: ph.vault, handle: ph.handle, startProject: ph.report.projects[0]?.id || null }); }}
          onRemoveLegacy={async () => { if (!ph.report.ok) throw new Error('only after a verified migration'); await removeBrowserLegacy(); }} />
      </div>
    );
  }

  if (phase.k === 'open') {
    const h = phase.handle;
    return <App key={phase.vault.manifest.vaultId} vault={phase.vault} viewer={phase.viewer} startProject={phase.startProject} onLeave={() => void leave()}
      reconnect={h ? async () => (await requestWrite(h)) === 'granted' : undefined} />;
  }

  const card = { width: 'min(620px, 100%)', display: 'flex', flexDirection: 'column' as const, gap: 16, padding: '34px 34px 30px', background: 'var(--surf)', border: '1px solid var(--line)', borderRadius: 20 };
  const big = { padding: '11px 18px', border: 0, borderRadius: 10, background: 'var(--acc)', color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: '0.03em' };
  const plain = { padding: '10px 16px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg)', fontSize: 12 };
  const p = { margin: 0, fontSize: 12, lineHeight: 1.8, color: 'var(--mut)' };

  return (
    <div data-theme={dark ? 'dark' : 'light'} style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '40px 16px', background: 'var(--bg)', color: 'var(--ink)' }}>
      {phase.k === 'boot' ? <div style={p}>Opening…</div> : phase.k === 'unsupported' ? (
        <div style={card}>
          <div style={{ fontFamily: 'var(--arch)', fontWeight: 800, fontSize: 26 }}>PMF Sequences</div>
          <p style={p}>This app keeps your data in a folder on your computer — a <strong style={{ color: 'var(--ink)' }}>vault</strong> — and needs the File System Access API to read and write it. This browser doesn’t offer it (or the page isn’t served over https / localhost).</p>
          <p style={p}>Use a current <strong style={{ color: 'var(--ink)' }}>Chrome</strong>, <strong style={{ color: 'var(--ink)' }}>Edge</strong> or another Chromium browser on desktop.</p>
          <p style={p}>Meanwhile you can look at a dataset JSON export here. Nothing is saved: closing the tab forgets it.</p>
          <label className="h-accb" style={{ ...plain, alignSelf: 'flex-start', cursor: 'pointer' }}>
            {busy ? 'opening…' : 'Open a JSON export (read-only)'}
            <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) viewJson(f); }} />
          </label>
          {err && <p style={{ ...p, color: 'var(--acc)' }}>{err}</p>}
        </div>
      ) : (
        <div style={card}>
          <div style={{ fontFamily: 'var(--arch)', fontWeight: 800, fontSize: 26 }}>PMF Sequences</div>
          <p style={p}>Your data lives in a <strong style={{ color: 'var(--ink)' }}>vault</strong>: a folder you choose. Uploaded files are stored there unchanged, notes as Markdown, everything else as small JSON records — readable without the app, easy to back up or keep in Git.</p>

          {ask ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, border: '1px solid var(--acc)', borderRadius: 12 }}>
              <span style={{ fontSize: 12 }}>“{ask.handle.name}” is empty. Create a new vault there?</span>
              <span style={{ display: 'flex', gap: 8 }}>
                <button className="h-bright" style={big} disabled={busy} onClick={() => run(async () => { const h = ask.handle; setAsk(null); await openVault(h, { create: true }); })}>Create vault here</button>
                <button className="h-surf" style={plain} onClick={() => setAsk(null)}>Cancel</button>
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="h-bright" style={big} disabled={busy} onClick={create}>Create a new vault…</button>
              <button className="h-surf" style={plain} disabled={busy} onClick={open}>Open a vault…</button>
            </div>
          )}

          {[browserLegacy, dumpLegacy].filter((x): x is LegacySource => !!x).map(src => (
            <div key={src.label} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, border: '1px solid var(--acc)', borderRadius: 12, background: 'var(--bg)' }}>
              <span style={{ fontSize: 12, lineHeight: 1.7 }}>
                <strong>{src.fromBrowser ? 'Data from the earlier version is stored in this browser' : 'Legacy dump ' + src.label}</strong> — {legacySummary(src.data)}.
                {' '}Migrate it into a vault: pick an empty folder; everything is written there, read back and compared before it counts as done. {src.fromBrowser ? 'The browser copy is left as it is.' : ''}
              </span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="h-bright" style={big} disabled={busy} onClick={() => migrate(src)}>{progress || 'Migrate into a vault…'}</button>
                {!src.fromBrowser && <button className="h-surf" style={plain} disabled={busy} onClick={() => setDumpLegacy(null)}>Cancel</button>}
              </span>
            </div>
          ))}

          {recent.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="lbl-wide">Recent vaults</span>
              {recent.map(v => (
                <div key={v.vaultId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--bg)' }}>
                  <span style={{ fontWeight: 700, fontSize: 12, flex: 1 }} className="ellip">{v.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--mut)' }}>{v.lastOpened.slice(0, 10)}</span>
                  <button className="h-acc ob" disabled={busy} onClick={() => reconnect(v)} title="The browser asks once to allow access to this folder again">reconnect</button>
                  <button className="h-acc ob" style={{ color: 'var(--mut)' }} onClick={() => void forget(v)} title="Forget it here (the folder isn’t touched)">forget</button>
                </div>
              ))}
            </div>
          )}

          {err && <p style={{ ...p, color: 'var(--acc)' }}>{err}</p>}
          <p style={{ ...p, fontSize: 11 }}>The browser only remembers which folder you picked. If it asks again for permission, that’s normal — your data stays in the folder.</p>
          <label className="h-acc" style={{ ...p, fontSize: 11, cursor: 'pointer', textDecoration: 'underline', alignSelf: 'flex-start' }} title="A pmf-legacy-dump.json made in the old app's tab (for data kept under another address)">
            Migrate from a legacy dump file…
            <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) loadDump(f); }} />
          </label>
        </div>
      )}
    </div>
  );
}
