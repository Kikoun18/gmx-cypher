import { useEffect, useState } from 'react';
import * as lib from '../lib/seq';
import type { Vault } from '../lib/storage/vault';
import type { ProjectService } from '../lib/storage/project';
import type { TrashItem } from '../lib/storage/trash';
import { basename } from '../lib/storage/path';
import { countAtoms, structFormat, structTitle } from '../lib/structFile';
import { readLocal } from '../lib/storage/files';
import type { StructMeta } from '../lib/types';
import { useApp } from '../ctx';
import { plural, stop, useConfirm } from './ui';

const DATA = /\.(xvg|dat|txt)$/i, STRUCT = /\.(pdb|ent|gro)$/i;
const lab = { fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--mut)' };
const small = { fontSize: 11, color: 'var(--mut)', lineHeight: 1.6 };
const ob = { padding: '4px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', fontSize: 11, whiteSpace: 'nowrap' as const };
const rowBox = { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--surf)', flexWrap: 'wrap' as const };

function Head({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 8px' }}>
      <span className="lbl-wide">{label}</span>
      <span className="rule" />
      {children}
    </div>
  );
}

/**
 * The vault behind the open project: where it is, files that are missing or
 * untracked (attach or ignore them), the trash (restore or delete for good),
 * and reload from disk.
 */
export function VaultDialog({ vault, svc, readOnly, onClose, onAttachData, onChanged, onLeave }: {
  vault: Vault; svc: ProjectService; readOnly: boolean; onClose: () => void;
  onAttachData: (path: string) => void; onChanged: () => void; onLeave: () => void;
}) {
  const { store, commit } = useApp();
  const [trash, setTrash] = useState<TrashItem[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [structRow, setStructRow] = useState<Record<string, string>>({});
  const [armed, confirm] = useConfirm();
  const report = svc.report;

  const [trashTick, setTrashTick] = useState(0);
  useEffect(() => {
    let dead = false;
    // This project's items, plus vault-wide ones (deleted projects, upgrade backups).
    vault.listTrash().catch(() => [] as TrashItem[]).then(all => {
      if (!dead) setTrash(all.filter(t => !t.manifest || t.manifest.projectId === svc.pid || t.manifest.type === 'project' || t.manifest.projectId == null).reverse());
    });
    return () => { dead = true; };
  }, [vault, svc, trashTick]);

  const act = async (f: () => Promise<string | void>) => {
    setBusy(true);
    try { const m = await f(); if (m) setMsg(m); } catch (e) { setMsg(String((e as Error).message || e)); }
    setBusy(false);
    setTrashTick(t => t + 1);
    onChanged();
  };

  const restore = (t: TrashItem) => act(async () => {
    if (t.manifest?.type === 'project') return (await vault.restoreProject(t)).message;
    return (await svc.restore(t)).message;
  });
  const attachStructure = (path: string) => act(async () => {
    const rowId = structRow[path] || store.seqs[0]?.id;
    if (!rowId) return 'Add a sequence first — structures belong to a sequence.';
    const { fileId, upload } = await svc.adoptUntracked(path);
    const { text, sha256 } = await readLocal(upload.blob);
    const same = await svc.findSame(sha256);
    if (same && !window.confirm(same + '. Attach ' + basename(path) + ' anyway?')) return;
    const format = structFormat(upload.name, text);
    if (!format) return basename(path) + ' is not a .pdb or .gro file.';
    const meta: StructMeta = { id: 'st' + fileId.slice(1), name: upload.name, format, added: new Date().toISOString().slice(0, 10), size: upload.blob.size, atoms: countAtoms(format, text), note: structTitle(format, text), fileId };
    commit(lib.addStructure(store, rowId, meta), new Map([[fileId, { ...upload, sha256 }]]));
    await svc.flush();
    return basename(path) + ' attached to ' + (store.seqs.find(s => s.id === rowId)?.name || 'the sequence') + ' (moved, not copied).';
  });
  const ignore = (paths: string[]) => act(async () => { await svc.setIgnored(paths); });

  const typeLabel = (t: TrashItem) => (t.manifest ? t.manifest.type : 'unknown');
  const otherProject = (t: TrashItem) => !!t.manifest && t.manifest.type !== 'project' && t.manifest.projectId != null && t.manifest.projectId !== svc.pid;

  return (
    <div className="scrim" onClick={onClose} style={{ zIndex: 15 }}>
      <div className="card" onClick={stop} style={{ width: 'min(760px, 100%)' }}>
        <div className="card-head">
          <div style={{ minWidth: 0 }}>
            <div className="title22">Vault · {vault.name}</div>
            <div style={{ ...small, letterSpacing: '0.04em', marginTop: 4, overflowWrap: 'anywhere' }}>
              This project is the folder <strong style={{ color: 'var(--ink)' }}>{svc.projectDir}</strong> inside the vault. Its files, notes and records are plain files you can open, back up or put in Git; the app keeps <code>.matrix/</code> for its records, journal, trash and cache.
            </div>
          </div>
          <button className="x-btn h-surf" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '0 20px 20px' }}>
          {msg && <div style={{ ...rowBox, marginTop: 14, background: 'var(--bg)', fontSize: 12 }}><span style={{ flex: 1 }}>{msg}</span><button className="h-surf" style={ob} onClick={() => setMsg(null)}>OK</button></div>}

          <Head label={'Missing files · ' + report.missing.length} />
          {!report.missing.length
            ? <div style={small}>Every file the records point to is in the folder.</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={small}>These were moved or deleted outside the app. Their records are kept and their values are left out. Put the file back at the same path (or anywhere in the project folder with the same name) and reload from disk.</div>
                {report.missing.map(m => <div key={m.fileId} style={rowBox}><span style={{ fontSize: 11, overflowWrap: 'anywhere', flex: 1 }}>{m.path}</span><span style={lab}>{m.kind}</span></div>)}
              </div>
            )}

          <Head label={'Untracked files · ' + report.untracked.length} />
          {!report.untracked.length
            ? <div style={small}>Nothing in the project folder that the app doesn’t know about{svc.state.ignored.length ? ' (' + plural(svc.state.ignored.length, 'ignored file') + ')' : ''}.</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={small}>Files in the project folder that no run, analysis or structure uses. Attach moves the file into place; ignore keeps it where it is and stops listing it.</div>
                {report.untracked.map(p => (
                  <div key={p} style={rowBox}>
                    <span style={{ fontSize: 11, overflowWrap: 'anywhere', flex: '1 1 260px' }}>{p}</span>
                    {!readOnly && DATA.test(p) && <button className="h-acc" style={ob} disabled={busy} onClick={() => onAttachData(p)} title="Open it in the upload dialog: choose the sequence, column and run">attach as data…</button>}
                    {!readOnly && STRUCT.test(p) && store.seqs.length > 0 && (
                      <>
                        <select value={structRow[p] || store.seqs[0].id} onChange={e => setStructRow({ ...structRow, [p]: e.target.value })} style={{ ...ob, background: 'var(--field)', maxWidth: 160 }}>
                          {store.seqs.map(s => <option key={s.id} value={s.id}>{s.name || s.seq || s.id}</option>)}
                        </select>
                        <button className="h-acc" style={ob} disabled={busy} onClick={() => attachStructure(p)}>attach structure</button>
                      </>
                    )}
                    {!readOnly && <button className="h-acc" style={{ ...ob, color: 'var(--mut)' }} disabled={busy} onClick={() => ignore(svc.state.ignored.concat(p))}>ignore</button>}
                  </div>
                ))}
              </div>
            )}
          {svc.state.ignored.length > 0 && !readOnly && (
            <div style={{ ...small, marginTop: 6 }}>
              Ignored: {svc.state.ignored.join(', ')} · <button className="h-acc" style={{ ...ob, padding: '1px 8px' }} disabled={busy} onClick={() => ignore([])}>list them again</button>
            </div>
          )}
          {report.conflictCopies.length > 0 && <div style={{ ...small, marginTop: 6 }}>Conflict copies (a note edited in two places — merge by hand, then delete the copy): {report.conflictCopies.join(', ')}</div>}

          <Head label={'Trash · ' + trash.length}>
            {trash.length > 0 && !readOnly && (
              <button className="h-acc" style={{ ...ob, color: armed === 'empty' ? 'var(--acc)' : 'var(--mut)' }} disabled={busy}
                onClick={() => { if (confirm('empty')) act(async () => { for (const t of trash) await vault.deleteTrash(t); return 'Trash emptied.'; }); }}>{armed === 'empty' ? 'delete ' + plural(trash.length, 'item') + ' for good?' : 'empty trash'}</button>
            )}
          </Head>
          {!trash.length
            ? <div style={small}>Deleted sequences, runs, files, notes, pages, columns and projects land here — in <code>.matrix/trash/</code> — until you delete them for good.</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflow: 'auto' }}>
                {trash.map(t => (
                  <div key={t.name} style={rowBox}>
                    <span style={{ ...lab, minWidth: 64 }}>{typeLabel(t)}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, flex: '1 1 200px' }} className="ellip" title={t.name}>{t.manifest?.label || t.name}</span>
                    <span style={small}>{t.manifest ? t.manifest.deletedAt.slice(0, 16).replace('T', ' ') : ''}</span>
                    {!readOnly && t.manifest && t.manifest.type !== 'schema-backup' && (
                      <button className="h-acc" style={ob} disabled={busy || otherProject(t)} title={otherProject(t) ? 'Open that project to restore it' : 'Put it back where it was'} onClick={() => restore(t)}>restore</button>
                    )}
                    {!readOnly && <button className="h-acc" style={{ ...ob, color: armed === 'del:' + t.name ? 'var(--acc)' : 'var(--mut)' }} disabled={busy} onClick={() => { if (confirm('del:' + t.name)) act(async () => { await vault.deleteTrash(t); }); }}>{armed === 'del:' + t.name ? 'delete for good?' : 'delete'}</button>}
                  </div>
                ))}
              </div>
            )}

          <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="h-accb" style={{ ...ob, padding: '8px 13px' }} disabled={busy}
              onClick={() => act(async () => {
                if (svc.hasPendingWrites() && !window.confirm('Reload from disk? Changes this tab hasn’t saved are discarded.')) return;
                await svc.reload({ discard: true });
                return 'Reloaded from the folder.';
              })}>Reload from disk</button>
            <button className="h-accb" style={{ ...ob, padding: '8px 13px' }} disabled={busy} onClick={() => act(async () => { await svc.verify(); return 'Folder checked.'; })}>Check folder now</button>
            <span style={{ flex: 1 }} />
            <button className="h-accb" style={{ ...ob, padding: '8px 13px' }} onClick={onLeave}>Close vault…</button>
          </div>
        </div>
      </div>
    </div>
  );
}
