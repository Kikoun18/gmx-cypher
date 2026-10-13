import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../ctx';
import * as lib from '../lib/seq';
import { roleOf, signature, type Discovery } from '../lib/scripts';
import { sha256Hex } from '../lib/storage/json';
import { newFileId } from '../lib/storage/files';
import type { Upload } from '../lib/storage/plan';
import type { ScriptRef } from '../lib/types';
import { stop, useConfirm } from './ui';

type Info = { source: string; size: number; sha256: string; fns: Discovery } | { error: string };
const errText = (e: unknown) => String((e as Error)?.message || e);
const btn = { padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', fontSize: 11, whiteSpace: 'nowrap' as const };
const small = { fontSize: 11, color: 'var(--mut)', lineHeight: 1.6 };

/**
 * Settings → Functions (batch 3, R3b): uploaded Python files kept byte for byte in the vault, the functions read from
 * their code (nothing runs), what you set per function, and trust in this browser (F96).
 */
export function FunctionsPanel({ head }: { head: ReactNode }) {
  const { store, commit, mutate, scriptInfo, trust, readOnly } = useApp();
  const scripts = useMemo(() => store.scripts || [], [store.scripts]);
  const [info, setInfo] = useState<Record<string, Info>>({});
  const [trusted, setTrusted] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<ScriptRef | null>(null);
  const [msg, setMsg] = useState('');
  const [armed, confirm] = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null), replacing = useRef<string | null>(null), asked = useRef(new Set<string>()), trustSeen = useRef<object | null>(null);
  const tkey = (k: ScriptRef) => k.id + '|' + k.sha256;

  useEffect(() => {
    // Trust given anywhere (a new trust object): ask again.
    if (trustSeen.current !== trust) { trustSeen.current = trust; for (const k of [...asked.current]) if (k.includes('|')) asked.current.delete(k); }
    for (const k of scripts) {
      if (!asked.current.has(k.fileId)) {
        asked.current.add(k.fileId);
        scriptInfo(k.fileId).then(i => setInfo(m => ({ ...m, [k.fileId]: i })), e => setInfo(m => ({ ...m, [k.fileId]: { error: errText(e) } })));
      }
      if (!asked.current.has(tkey(k))) {
        asked.current.add(tkey(k));
        trust.has(k.id, k.sha256 || '').then(v => setTrusted(m => ({ ...m, [tkey(k)]: v })));
      }
    }
  }, [scripts, scriptInfo, trust]);

  const pick = (replace: string | null) => { replacing.current = replace; fileRef.current?.click(); };
  const onFile = async (file: File | undefined) => {
    const replace = replacing.current;
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (!/\.py$/i.test(file.name)) { setMsg(file.name + ' isn’t a Python file (.py).'); return; }
    const bytes = new Uint8Array(await file.arrayBuffer()), sha256 = await sha256Hex(bytes);
    const same = scripts.find(k => k.sha256 === sha256);
    if (same) { setMsg(file.name + ' is identical to ' + same.name + ', which is already here.'); return; }
    const fileId = newFileId(), uploads = new Map<string, Upload>([[fileId, { blob: new Blob([bytes], { type: 'text/x-python' }), name: file.name, sha256 }]]);
    const old = scripts.find(k => k.id === replace);
    commit(old ? lib.replaceScript(store, old.id, { name: file.name, fileId, sha256 }) : lib.addScript(store, { id: 'k' + fileId.slice(1), name: file.name, fileId, sha256, fns: {} }), uploads);
    setMsg(old ? old.name + ' replaced by ' + file.name + '; the old version is in the trash. Your settings are kept; trust is asked again.' : file.name + ' added.');
  };
  const onTrust = async (k: ScriptRef) => {
    await trust.add(k.id, k.sha256 || '');
    setTrusted(m => ({ ...m, [tkey(k)]: true }));
    setMsg(k.name + ' is trusted in this browser.');
  };

  return (
    <div style={{ padding: '22px 20px 0' }}>
      {head}
      <div style={{ ...small, marginBottom: 10 }}>
        Python files with functions <code>f(x, y, …)</code> returning a number (matrix functions) or a list (transforms). They run in a sandbox with no network, files or vault access, and only after you trust them in this browser. Standard library only.
      </div>
      <input ref={fileRef} type="file" accept=".py,text/x-python" hidden onChange={e => void onFile(e.target.files?.[0])} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {scripts.map(k => {
          const i = info[k.fileId], ok = i && !('error' in i) ? i : null, cf = armed === 'script:' + k.id;
          const changed = !!ok && !!k.sha256 && ok.sha256 !== k.sha256, isTrusted = !changed && trusted[tkey(k)];
          const fns = ok && Array.isArray(ok.fns) ? ok.fns : null;
          return (
            <div key={k.id} role="group" aria-label={'Script ' + k.name} style={{ padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surf)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13 }}>{k.name}</strong>
                <span style={small}>{ok ? lib.plural(ok.size, 'byte') + ' · ' : ''}sha256 {(k.sha256 || '').slice(0, 8)}…</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: isTrusted ? 'var(--mut)' : 'var(--accInk)' }}>{changed ? 'changed on disk' : isTrusted ? 'trusted in this browser' : 'not trusted yet'}</span>
                <button className="h-acc" style={btn} disabled={!ok} onClick={() => setView(k)}>view source</button>
                {!readOnly && <button className="h-acc" style={btn} onClick={() => pick(k.id)}>replace</button>}
                {!readOnly && (
                  <button className="h-acc" style={{ ...btn, color: cf ? 'var(--accInk)' : 'var(--mut)' }} onClick={() => { if (confirm('script:' + k.id)) { mutate(s => lib.removeScript(s, k.id)); setMsg(k.name + ' moved to the trash.'); } }}>
                    {cf ? 'move to the trash?' : 'remove'}
                  </button>
                )}
              </div>
              <div style={{ ...small, marginTop: 6 }}>
                {!i ? 'reading its functions (Python starts the first time)…'
                  : 'error' in i ? <span style={{ color: 'var(--accInk)' }}>can’t read it: {i.error}</span>
                  : changed ? <span style={{ color: 'var(--accInk)' }}>The file in _scripts/ no longer matches what was added (its SHA-256 differs), so it won’t run. Replace it to use the new version.</span>
                  : !fns ? <span style={{ color: 'var(--accInk)' }}>can’t read it: {ok && 'error' in ok.fns ? ok.fns.error : ''}</span>
                  : !fns.length ? 'No top-level functions (names starting with _ are skipped).'
                  : lib.plural(fns.length, 'function') + ' · the role comes from the return annotation unless you choose'}
              </div>
              {fns && !changed && fns.map(f => {
                const s = k.fns[f.name], set = (patch: Parameters<typeof lib.setScriptFn>[3]) => mutate(st => lib.setScriptFn(st, k.id, f.name, patch));
                return (
                  <div key={f.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.7fr)', gap: 8, alignItems: 'center', paddingTop: 8, marginTop: 8, borderTop: '1px solid var(--line)' }}>
                    <div style={{ minWidth: 0, overflowWrap: 'anywhere' }} title={f.doc}>
                      <code style={{ fontSize: 12, fontWeight: 700 }}>{f.name}</code> <span style={small}>{signature(f)}</span>
                      {f.doc && <div style={{ ...small, fontSize: 10 }}>{f.doc.split('\n')[0]}</div>}
                    </div>
                    {f.problem ? <span style={{ gridColumn: 'span 3', fontSize: 11, color: 'var(--accInk)' }}>can’t be used: {f.problem}</span> : (
                      <>
                        <select className="inp-s" aria-label={'Role of ' + f.name} disabled={readOnly} value={roleOf(f, s)} onChange={e => { const v = e.target.value as 'metric' | 'transform'; set({ role: v === (f.role ?? 'metric') ? undefined : v }); }}>
                          <option value="metric">matrix function</option>
                          <option value="transform">transform</option>
                        </select>
                        <input className="inp-s" aria-label={'Name of ' + f.name} disabled={readOnly} value={s?.label ?? ''} placeholder={f.name.replace(/_/g, ' ')} onChange={e => set({ label: e.target.value })} />
                        <input className="inp-s" aria-label={'Unit of ' + f.name} disabled={readOnly} value={s?.unit ?? ''} placeholder={f.unit || 'unit'} onChange={e => set({ unit: e.target.value })} />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {!readOnly && <button className="h-acc" onClick={() => pick(null)} style={{ marginTop: 10, padding: '7px 14px', border: '1px dashed var(--line)', borderRadius: 8, background: 'transparent', fontSize: 11, color: 'var(--ink)' }}>+ Add Python file</button>}
      <div aria-live="polite" style={{ ...small, marginTop: 6, minHeight: 18 }}>{msg}</div>
      {view && (() => {
        const i = info[view.fileId];
        return i && !('error' in i) && <TrustDialog name={view.name} source={i.source} sha256={i.sha256} matches={!view.sha256 || i.sha256 === view.sha256} trusted={!!trusted[tkey(view)]} onTrust={() => void onTrust(view)} onClose={() => setView(null)} />;
      })()}
    </div>
  );
}

/** The script's full source and SHA-256, and the choice to trust it in this browser (section 1.4). */
export function TrustDialog({ name, source, sha256, matches, trusted, onTrust, onClose, action = 'trust' }: {
  name: string; source: string; sha256: string; matches: boolean; trusted: boolean; onTrust: () => void; onClose: () => void; action?: string;
}) {
  // Focus goes back to whatever opened the dialog (read while rendering, before the button below takes focus).
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const close = () => { onClose(); opener?.focus(); };
  return (
    <div className="scrim" onClick={close} style={{ zIndex: 15 }}>
      <div className="card" role="dialog" aria-modal="true" aria-labelledby="trust-title" onClick={stop} style={{ width: 'min(640px, 100%)' }}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
        <div className="card-head">
          <div>
            <div className="title22" id="trust-title">{trusted ? name : 'Run ' + name + '?'}</div>
            <div style={{ ...small, letterSpacing: '0.06em', marginTop: 4 }}>{!matches ? 'changed on disk · won’t run' : trusted ? 'trusted in this browser' : 'not yet trusted in this browser'}</div>
          </div>
          <button className="x-btn h-surf" aria-label="Close" onClick={close}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 20px 20px' }}>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7 }}>It runs in a sandbox with no network, no files and no vault access, and only returns numbers. Read it before you trust it. Trust is kept in this browser for this exact content; any change asks again.</p>
          <div>
            <div className="lbl">SHA-256</div>
            <code style={{ fontSize: 11, overflowWrap: 'anywhere' }}>{sha256}</code>
          </div>
          <pre tabIndex={0} aria-label={'Source of ' + name} style={{ margin: 0, maxHeight: 300, overflow: 'auto', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--field)', fontSize: 11, lineHeight: 1.5 }}>{source}</pre>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="h-acc" autoFocus onClick={close} style={{ padding: '9px 14px', border: '1px solid var(--line)', borderRadius: 10, background: 'transparent', fontSize: 12 }}>{trusted || !matches ? 'close' : 'don’t run'}</button>
            {!trusted && matches && <button className="h-bright" onClick={() => { onTrust(); close(); }} style={{ padding: '9px 16px', border: 0, borderRadius: 10, background: 'var(--acc)', color: '#fff', fontWeight: 700, fontSize: 12 }}>{action}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
