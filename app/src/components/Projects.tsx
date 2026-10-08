import { useRef, useState } from 'react';
import { useApp } from '../ctx';
import { DownloadIcon, Seg, plural, stop, useConfirm } from './ui';

export interface ProjectMeta { id: string; name: string; desc: string; created: string }
export interface ProjectIndex { active: string; list: ProjectMeta[] }
export interface ProjectStats { seqs: number; runs: number; pages: number }

export interface ProjectOps {
  ix: ProjectIndex;
  /** Counts for projects that aren't open (read from their records). */
  stats: Record<string, ProjectStats | undefined>;
  open: (id: string) => void;
  create: (name: string, desc: string, copyCurrent: boolean) => void;
  rename: (id: string, patch: Partial<Pick<ProjectMeta, 'name' | 'desc'>>) => void;
  duplicate: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  exportProject: (id: string) => Promise<void>;
  importNew: (file: File) => Promise<void>;
}

const Chevron = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
);

function useStats(ops: ProjectOps) {
  const { store } = useApp();
  // The open project's numbers come from memory; the others from their records.
  return (m: ProjectMeta): ProjectStats => (m.id === ops.ix.active
    ? { seqs: store.seqs.length, runs: store.seqs.reduce((n, s) => n + s.runs.length, 0), pages: store.pages.length }
    : ops.stats[m.id] || { seqs: 0, runs: 0, pages: 0 });
}
const statLine = (s: { seqs: number; pages: number }) => plural(s.seqs, 'sequence') + (s.pages ? ' · ' + plural(s.pages, 'page') : '');

/** Header switcher: the current project's name; the menu lists every project. */
export function ProjectMenu({ ops, onManage }: { ops: ProjectOps; onManage: (create: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const stats = useStats(ops);
  const cur = ops.ix.list.find(m => m.id === ops.ix.active) || { id: '', name: 'Loading…', desc: '', created: '' };
  return (
    <div style={{ position: 'relative' }}>
      <button className="h-surf" onClick={() => setOpen(!open)} title="Switch or manage projects"
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 11px 5px 12px', border: '1px solid ' + (open ? 'var(--acc)' : 'var(--line)'), borderRadius: 99, background: 'transparent', fontSize: 12, fontWeight: 700, maxWidth: 280 }}>
        <span style={{ width: 7, height: 7, borderRadius: 2, background: 'var(--acc)', flex: 'none' }} />
        <span className="ellip">{cur.name}</span>
        <Chevron />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div className="menu" style={{ left: 0, right: 'auto', width: 300 }}>
            <div className="lbl" style={{ padding: '6px 8px 4px' }}>Projects</div>
            {ops.ix.list.map(m => {
              const on = m.id === ops.ix.active, st = stats(m);
              return (
                <button key={m.id} className="h-surf" onClick={() => { setOpen(false); ops.open(m.id); }}
                  style={{ display: 'grid', gridTemplateColumns: '14px minmax(0, 1fr)', gap: 8, alignItems: 'baseline', padding: '8px 10px', border: 0, borderRadius: 8, background: on ? 'var(--surf)' : 'transparent', textAlign: 'left' }}>
                  <span style={{ color: 'var(--acc)', fontSize: 11 }}>{on ? '✓' : ''}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="ellip" style={{ display: 'block', fontWeight: 700, fontSize: 12 }}>{m.name}</span>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--mut)', marginTop: 2 }}>{statLine(st)}</span>
                  </span>
                </button>
              );
            })}
            <div style={{ height: 1, background: 'var(--line)', margin: '4px 6px' }} />
            <button className="h-surf" onClick={() => { setOpen(false); onManage(true); }} style={{ padding: '8px 10px', border: 0, borderRadius: 8, background: 'transparent', textAlign: 'left', fontSize: 12 }}>+ New project…</button>
            <button className="h-surf" onClick={() => { setOpen(false); onManage(false); }} style={{ padding: '8px 10px', border: 0, borderRadius: 8, background: 'transparent', textAlign: 'left', fontSize: 12, color: 'var(--mut)' }}>Manage projects…</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Create, rename, duplicate, export, import and delete projects. */
export function ProjectsDialog({ ops, startCreate, onClose }: { ops: ProjectOps; startCreate: boolean; onClose: () => void }) {
  const stats = useStats(ops);
  const cur = ops.ix.list.find(m => m.id === ops.ix.active) || { id: '', name: '', desc: '', created: '' };
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [copy, setCopy] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [armed, confirm] = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const note = (t: string, err?: boolean) => { setMsg({ t, err }); setTimeout(() => setMsg(null), 3200); };
  const run = async (key: string, f: () => Promise<void>, done?: string) => {
    setBusy(key);
    try { await f(); if (done) note(done); } catch (e) { note(String((e as Error).message || e), true); }
    setBusy(null);
  };

  const create = () => {
    if (!name.trim()) return;
    ops.create(name, desc, copy);
    onClose();
  };
  const lab = { fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--mut)' };
  const small = { fontSize: 11, color: 'var(--mut)' };

  return (
    <div className="scrim" onClick={onClose} style={{ zIndex: 15 }}>
      <div className="card" onClick={stop} style={{ width: 'min(760px, 100%)' }}>
        <div className="card-head">
          <div>
            <div className="title22">Projects</div>
            <div style={{ ...small, letterSpacing: '0.06em', marginTop: 4, lineHeight: 1.6 }}>Each project is a standalone dataset — a folder in the vault — with its own pages, columns and file-name, axis and analysis settings. Theme and the laser pointer are shared. Deleted projects go to the vault’s trash.</div>
          </div>
          <button className="x-btn h-surf" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '18px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span className="lbl-wide">New project</span>
            <span className="rule" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.4fr)', gap: 12 }}>
            <label className="fld"><span style={lab}>Name</span>
              <input className="inp" autoFocus={startCreate} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); }} placeholder="e.g. Ion pairs 2027" />
            </label>
            <label className="fld"><span style={lab}>Description · optional</span>
              <input className="inp" value={desc} onChange={e => setDesc(e.target.value)} placeholder="What this dataset is about" />
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            <span style={lab}>Start with</span>
            <Seg value={copy} onPick={setCopy} opts={[{ v: true, label: 'columns & settings of ' + (cur.name.length > 22 ? cur.name.slice(0, 22) + '…' : cur.name) }, { v: false, label: 'defaults · O26 · PG · HA' }]} />
            <span style={{ flex: 1 }} />
            <button onClick={create} disabled={!name.trim()}
              style={{ padding: '9px 18px', border: 0, borderRadius: 10, background: name.trim() ? 'var(--acc)' : 'var(--line)', color: name.trim() ? '#fff' : 'var(--mut)', fontWeight: 700, fontSize: 12, letterSpacing: '0.03em' }}>Create project</button>
          </div>
        </div>

        <div style={{ padding: '22px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span className="lbl-wide">Your projects</span>
            <span className="rule" />
            {msg && <span style={{ fontSize: 10, color: msg.err ? 'var(--acc)' : 'var(--accInk)' }}>{msg.t}</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ops.ix.list.map(m => {
              const on = m.id === ops.ix.active, st = stats(m), cf = armed === 'del:' + m.id;
              return (
                <div key={m.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '6px 12px', alignItems: 'center', padding: '10px 12px', border: '1px solid ' + (on ? 'var(--acc)' : 'var(--line)'), borderRadius: 11, background: 'var(--surf)' }}>
                  <input className="inp-s" value={m.name} onChange={e => ops.rename(m.id, { name: e.target.value })} title="Rename" style={{ fontWeight: 700, fontSize: 13, background: 'var(--bg)' }} />
                  <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {on
                      ? <span style={{ ...small, alignSelf: 'center', padding: '0 6px', color: 'var(--acc)' }}>open now</span>
                      : <button className="h-acc ob" onClick={() => { ops.open(m.id); onClose(); }} style={{ color: 'var(--ink)' }}>open</button>}
                    <button className="h-acc ob" disabled={!!busy} onClick={() => run('dup:' + m.id, () => ops.duplicate(m.id), 'duplicated ' + m.name)}>{busy === 'dup:' + m.id ? 'copying…' : 'duplicate'}</button>
                    <button className="h-acc ob" disabled={!!busy} onClick={() => run('exp:' + m.id, () => ops.exportProject(m.id))} title="Download this project as dataset JSON" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><DownloadIcon size={11} />json</button>
                    <button className="h-acc ob" disabled={!!busy} onClick={() => { if (confirm('del:' + m.id)) run('del:' + m.id, () => ops.remove(m.id), 'deleted ' + m.name); }}
                      style={{ color: cf ? 'var(--acc)' : 'var(--mut)' }}>{cf ? 'delete ' + plural(st.seqs, 'sequence') + '?' : 'delete'}</button>
                  </span>
                  <input className="inp-s" value={m.desc} onChange={e => ops.rename(m.id, { desc: e.target.value })} placeholder="Description" style={{ fontSize: 11, padding: '5px 9px', background: 'var(--bg)' }} />
                  <span style={{ ...small, fontSize: 10, textAlign: 'right', whiteSpace: 'nowrap' }}>{statLine(st)} · {st.runs} runs · created {m.created.slice(0, 10)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 20px', flexWrap: 'wrap' }}>
          <button className="h-accb" disabled={!!busy} onClick={() => fileRef.current?.click()}
            style={{ padding: '9px 14px', border: '1px solid var(--line)', borderRadius: 9, background: 'transparent', fontSize: 11 }}>{busy === 'imp' ? 'importing…' : 'Import dataset JSON as a new project'}</button>
          <input type="file" ref={fileRef} accept=".json,application/json" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) run('imp', async () => { await ops.importNew(f); onClose(); }); }} />
          <span style={{ ...small, flex: '1 1 240px', lineHeight: 1.5 }}>To add an export to the open project instead, use Import dataset JSON under the notes.</span>
        </div>
      </div>
    </div>
  );
}
