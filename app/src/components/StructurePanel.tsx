import { useEffect, useRef, useState } from 'react';
import * as lib from '../lib/seq';
import { addStructureFiles, defaultView, fmtBytes, structStyle, toPdb, type Look, type StructInfo } from '../lib/structFile';
import type { Seq, StructMeta } from '../lib/types';
import { useApp } from '../ctx';
import { DownloadIcon, Seg, plural, useConfirm } from './ui';


/** Structures belong to the row (sequence), so they show in both the cell and the row view. */
export function StructurePanel({ row }: { row: Seq }) {
  const { store, commit, readFile, findSame } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [hot, setHot] = useState(false);
  const [armed, confirm] = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const list = row.structures;
  const shown = open && list.some(m => m.id === open) ? open : null;

  const add = async (files: File[]) => {
    const res = await addStructureFiles(store, row.id, files, { findSame, confirm: m => window.confirm(m) });
    const n = res.added.length;
    if (n) { commit(res.store, res.uploads); setOpen(res.added[n - 1].id); }
    setMsg([n ? 'added ' + plural(n, 'structure') : '', res.bad.length ? 'not a .pdb or .gro: ' + res.bad.join(', ') : ''].filter(Boolean).join(' · '));
    setTimeout(() => setMsg(''), 3600);
  };

  const save = async (m: StructMeta) => {
    const blob = m.fileId ? await readFile(m.fileId).catch(() => null) : null;
    if (!blob) { setMsg(m.name + ' is missing from the vault folder'); return; }
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = m.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const remove = (m: StructMeta) => {
    if (!confirm('st:' + m.id)) return;
    commit(lib.removeStructure(store, row.id, m.id));
    if (open === m.id) setOpen(null);
  };

  const onDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault(); e.stopPropagation(); setHot(false);
    add(Array.from(e.dataTransfer.files));
  };
  const onDragOver = (e: React.DragEvent) => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); e.stopPropagation(); if (!hot) setHot(true); };

  return (
    <div style={{ padding: '4px 20px 14px' }} onDragOver={onDragOver} onDragLeave={() => setHot(false)} onDrop={onDrop}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span className="lbl-wide">Structure</span>
        <span className="rule" />
        {msg && <span style={{ fontSize: 10, color: 'var(--accInk)' }}>{msg}</span>}
        <button className="h-accb" onClick={() => fileRef.current && fileRef.current.click()} style={{ padding: '6px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', fontSize: 11 }}>+ structure</button>
      </div>
      <input type="file" ref={fileRef} multiple accept=".pdb,.ent,.gro,chemical/x-pdb" style={{ display: 'none' }}
        onChange={e => { const l = Array.from(e.target.files || []); e.target.value = ''; add(l); }} />
      {!list.length ? (
        <button className="h-accb" onClick={() => fileRef.current && fileRef.current.click()}
          style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '12px 16px', border: '1px dashed ' + (hot ? 'var(--acc)' : 'var(--line)'), borderRadius: 11, background: 'transparent', textAlign: 'left' }}>
          <span style={{ fontFamily: 'var(--arch)', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>Drop a .pdb or .gro</span>
          <span style={{ fontSize: 11, color: 'var(--mut)', lineHeight: 1.5 }}>attached to {row.name || 'this sequence'} across every column · viewed here in 3D · the original file is kept in the vault folder</span>
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, outline: hot ? '2px dashed var(--acc)' : 'none', outlineOffset: 2, borderRadius: 11 }}>
          {list.map(m => {
            const on = shown === m.id;
            return (
              <div key={m.id} style={{ border: '1px solid ' + (on ? 'var(--acc)' : 'var(--line)'), borderRadius: 11, background: 'var(--surf)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 12, maxWidth: 260 }} className="ellip" title={m.name}>{m.name}</span>
                  <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 7px', border: '1px solid var(--line)', borderRadius: 99, color: 'var(--mut)' }}>{m.format}</span>
                  <span style={{ fontSize: 11, color: m.state === 'missing' ? 'var(--acc)' : 'var(--mut)' }}>{m.state === 'missing' ? 'file missing from the vault folder' : m.atoms.toLocaleString() + ' atoms · ' + fmtBytes(m.size) + (m.note ? ' · ' + m.note : '')}</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button className="h-acc ob" onClick={() => setOpen(on ? null : m.id)} style={{ color: on ? 'var(--acc)' : 'var(--mut)' }}>{on ? 'hide 3D' : 'view 3D'}</button>
                    <button className="h-acc ob" onClick={() => save(m)} title="Download the original file" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><DownloadIcon size={11} />{m.format}</button>
                    <button className="h-acc ob" onClick={() => remove(m)} style={{ color: armed === 'st:' + m.id ? 'var(--acc)' : 'var(--mut)' }}>{armed === 'st:' + m.id ? 'click again' : 'delete'}</button>
                  </span>
                </div>
                {on && <Viewer meta={m} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Minimal slice of the 3Dmol viewer API used here.
interface Viewer3D {
  addModel(data: string, format: string, opts?: object): unknown;
  removeAllModels(): void;
  setStyle(sel: object, style: object): void;
  zoomTo(): void; render(): void; clear(): void; resize(): void;
  spin(axis: string | boolean, speed?: number): void;
  setBackgroundColor(c: string, a?: number): void;
}

function Viewer({ meta }: { meta: StructMeta }) {
  const { dark, readFile } = useApp();
  const box = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer3D | null>(null);
  const pdb = useRef('');
  // Look and water/ions follow the structure (defaultView) until changed here; hydrogens start hidden.
  const [pick, setPick] = useState<{ look?: Look; solvent?: boolean; h: boolean }>({ h: false });
  const [spin, setSpin] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [info, setInfo] = useState<StructInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [model, setModel] = useState(0);
  const bg = dark ? '#0e0d0c' : '#ffffff';
  const def = info ? defaultView(info) : null;
  const look: Look = pick.look || def?.look || 'stick', solvent = pick.solvent ?? def?.solvent ?? true;

  useEffect(() => {
    let dead = false;
    const el = box.current;
    const text = meta.fileId ? readFile(meta.fileId).then(b => b.text(), () => undefined) : Promise.resolve(undefined);
    Promise.all([import('3dmol'), text]).then(([mod, text]) => {
      if (dead || !el) return;
      if (!text) { setErr('This file is missing from the vault folder — re-attach it.'); return; }
      const $3Dmol = (mod as unknown as { createViewer?: unknown; default?: { createViewer: unknown } });
      const create = ($3Dmol.createViewer || ($3Dmol.default && $3Dmol.default.createViewer)) as (el: HTMLElement, o: object) => Viewer3D;
      const v = create(el, { backgroundColor: bg, antialias: true });
      // Elements are decided before 3Dmol sees the atoms (it would guess "2HB" as an unknown, pink element).
      const r = toPdb(text, meta.format);
      pdb.current = r.pdb;
      setInfo(r.info);
      setNote(r.unknown.length ? plural(r.unknown.length, 'atom') + ' not drawn: element unknown (' + r.unknown.slice(0, 6).join(', ') + (r.unknown.length > 6 ? ', …' : '') + ')' : '');
      viewer.current = v;
      setReady(true);
    }).catch(e => !dead && setErr('Could not open the structure: ' + String((e as Error).message || e)));
    return () => { dead = true; if (viewer.current) viewer.current.clear(); viewer.current = null; if (el) el.innerHTML = ''; setReady(false); };
    // The viewer is rebuilt only for a different file; style and theme update in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.id]);

  // Hydrogens are dropped or kept by 3Dmol when it reads the model, the same for .pdb and .gro.
  useEffect(() => {
    const v = viewer.current;
    if (!v || !ready) return;
    v.removeAllModels();
    v.addModel(pdb.current, 'pdb', { keepH: pick.h });
    setModel(n => n + 1);
  }, [ready, pick.h]);

  useEffect(() => {
    const v = viewer.current;
    if (!v || !model || !info) return;
    for (const [sel, style] of structStyle(info, look, solvent).styles) v.setStyle(sel, style);
    v.setBackgroundColor(bg, 1);
    v.zoomTo(); v.render();
  }, [look, solvent, model, bg, info]);

  useEffect(() => { const v = viewer.current; if (v && ready) v.spin(spin ? 'y' : false, 0.6); }, [spin, ready]);

  return (
    <div style={{ padding: '0 13px 13px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <span className="lbl">Style</span>
        <Seg<Look> size="s" value={look} onPick={v => setPick({ ...pick, look: v })} bg="var(--bg)" opts={[{ v: 'cartoon', label: 'cartoon' }, { v: 'stick', label: 'sticks' }, { v: 'sphere', label: 'spheres' }, { v: 'line', label: 'lines' }]} />
        <button className="h-acc ob" aria-pressed={pick.h} onClick={() => setPick({ ...pick, h: !pick.h })} style={{ color: pick.h ? 'var(--accInk)' : 'var(--mut)' }}>hydrogens</button>
        {info && info.water + info.ions > 0 && (
          <button className="h-acc ob" aria-pressed={solvent} onClick={() => setPick({ ...pick, solvent: !solvent })} style={{ color: solvent ? 'var(--accInk)' : 'var(--mut)' }}>water &amp; ions</button>
        )}
        <span style={{ flex: 1 }} />
        <button className="h-acc ob" onClick={() => setSpin(!spin)} style={{ color: spin ? 'var(--acc)' : 'var(--mut)' }}>{spin ? 'stop spin' : 'spin'}</button>
        <button className="h-acc ob" onClick={() => { const v = viewer.current; if (v) { v.zoomTo(); v.render(); } }}>reset view</button>
      </div>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 10', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', background: bg }}>
        <div ref={box} style={{ position: 'absolute', inset: 0 }} />
        {(err || !ready) && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 20, fontSize: 11, color: err ? 'var(--acc)' : 'var(--mut)', textAlign: 'center' }}>{err || 'loading viewer…'}</div>
        )}
      </div>
      <div style={{ fontSize: 10, color: 'var(--mut)', letterSpacing: '0.04em', paddingTop: 6 }}>
        {/* Only the notes are announced, not the fixed hint after them. */}
        <span aria-live="polite">{[info ? structStyle(info, look, solvent).note : '', note, info && !solvent ? 'water and ions hidden' : ''].filter(Boolean).map(t => t + ' · ').join('')}</span>
        drag to rotate · scroll to zoom · right-drag or ctrl-drag to move
      </div>
    </div>
  );
}
