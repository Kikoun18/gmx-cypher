import { useState } from 'react';
import type { Vault } from '../lib/storage/vault';
import type { ProjectService, ServiceStatus } from '../lib/storage/project';

const bar = (tone: 'warn' | 'info') => ({
  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const, padding: '8px 20px', fontSize: 12, lineHeight: 1.5,
  borderBottom: '1px solid var(--line)',
  background: tone === 'warn' ? 'color-mix(in oklch, var(--acc) 14%, var(--bg))' : 'var(--surf)',
});
const btn = { padding: '5px 11px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)', fontSize: 11, whiteSpace: 'nowrap' as const };

/** Save state next to the subtitle. */
export function SaveBadge({ status, readOnly, viewer }: { status: ServiceStatus; readOnly: boolean; viewer: boolean }) {
  const t = viewer ? 'viewer · not saved' : readOnly ? 'read-only' : ({ saved: 'saved to vault', pending: 'unsaved changes…', saving: 'saving…', error: 'not saved', 'read-only': 'read-only' } as const)[status.save];
  const hot = status.save === 'error' || viewer || readOnly;
  return <span style={{ fontSize: 10, letterSpacing: '0.08em', padding: '1px 8px', borderRadius: 99, border: '1px solid ' + (hot ? 'var(--acc)' : 'var(--line)'), color: hot ? 'var(--acc)' : 'var(--mut)' }}>{t}</span>;
}

/**
 * Everything the user must know about the vault, above the page bar: read-only
 * modes, a write that failed (with Reconnect / Retry / Reload), interrupted saves
 * finished on open, and notices (trashed items, outside edits).
 */
export function VaultBanner({ vault, svc, status, viewer, reconnect, onReloaded, onLeave }: {
  vault: Vault; svc: ProjectService; status: ServiceStatus; viewer: boolean;
  reconnect?: () => Promise<boolean>; onReloaded: () => void; onLeave: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [seenRecovery, setSeenRecovery] = useState(false);
  const run = (f: () => Promise<unknown>) => { setBusy(true); f().catch(() => {}).finally(() => { setBusy(false); onReloaded(); }); };
  const rows: React.ReactNode[] = [];

  if (viewer) {
    rows.push(
      <div key="viewer" style={bar('warn')}>
        <span><strong>JSON viewer.</strong> This browser can’t write to a folder, so nothing you change here is saved. Open the app in Chrome or Edge to work with a vault.</span>
        <button className="h-surf" style={btn} onClick={onLeave}>Close viewer</button>
      </div>,
    );
  } else if (vault.readOnlyReason) {
    rows.push(<div key="ro" style={bar('warn')}><span><strong>Read-only.</strong> {vault.readOnlyReason}</span></div>);
  }

  if (status.save === 'error' && status.error) {
    rows.push(
      <div key="err" style={bar('warn')}>
        <span style={{ flex: '1 1 320px' }}>{status.error}</span>
        {reconnect && <button className="h-surf" style={btn} disabled={busy} onClick={() => run(async () => { if (await reconnect()) await svc.retry(); })}>Reconnect</button>}
        <button className="h-surf" style={btn} disabled={busy} onClick={() => run(() => svc.retry())}>Retry</button>
        <button className="h-surf" style={btn} disabled={busy} title="Discard what this tab hasn't saved and show what the folder holds"
          onClick={() => { if (window.confirm('Reload from disk? Changes this tab hasn’t saved are discarded.')) run(() => svc.reload({ discard: true })); }}>Reload from disk</button>
      </div>,
    );
  }

  if (svc.report.conflicts.length) {
    rows.push(
      <div key="conf" style={bar('warn')}>
        <span>Saving is paused: {svc.report.conflicts.map(c => c.paths.join(' and ')).join('; ')} carry the same ID. Keep one (move or rename the other folder outside the app), then reload from disk.</span>
        <button className="h-surf" style={btn} disabled={busy} onClick={() => run(() => svc.reload({ discard: true }))}>Reload from disk</button>
      </div>,
    );
  }

  if (!seenRecovery && (vault.recovered.length || vault.upgradedFrom != null)) {
    const done = vault.recovered.filter(r => r.action === 'completed').length, undone = vault.recovered.filter(r => r.action === 'rolled-back').length;
    const parts = [
      done ? done + ' interrupted save' + (done > 1 ? 's were' : ' was') + ' completed' : '',
      undone ? undone + ' interrupted change' + (undone > 1 ? 's were' : ' was') + ' undone' : '',
      vault.upgradedFrom != null ? 'the vault was upgraded from format v' + vault.upgradedFrom + ' (a backup is in the trash)' : '',
    ].filter(Boolean);
    if (parts.length) rows.push(
      <div key="rec" style={bar('info')}>
        <span>When the vault opened, {parts.join('; ')}.</span>
        <button className="h-surf" style={btn} onClick={() => setSeenRecovery(true)}>OK</button>
      </div>,
    );
  }

  if (status.notices.length) {
    rows.push(
      <div key="notes" style={bar('info')}>
        <span style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 2 }}>{status.notices.map((n, i) => <span key={i}>{n}</span>)}</span>
        <button className="h-surf" style={btn} onClick={() => svc.clearNotices()}>Dismiss</button>
      </div>,
    );
  }

  return <div>{rows}</div>;
}
