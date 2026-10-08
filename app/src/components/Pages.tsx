import { useMemo, useState } from 'react';
import * as lib from '../lib/seq';
import type { Page } from '../lib/types';
import { useApp } from '../ctx';
import { plural, stop, useConfirm } from './ui';

/** The page tabs under the header: "All sequences" first, then the project's own pages. */
export function PageBar({ pageId, onPick, onNew, onEdit }: {
  pageId: string; onPick: (id: string) => void; onNew: () => void; onEdit: (p: Page) => void;
}) {
  const { store, commit } = useApp();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const tab = (id: string, name: string, count: number, page: Page | null, i: number) => {
    const on = id === pageId;
    return (
      <span key={id} style={{ display: 'flex', alignItems: 'stretch', flex: 'none', boxShadow: overId === id && dragId !== id ? 'inset 2px 0 0 var(--acc)' : 'none', opacity: dragId === id ? 0.45 : 1 }}
        draggable={!!page}
        onDragStart={e => { if (!page) return; setDragId(id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch { /* old browsers */ } }}
        onDragEnd={() => { setDragId(null); setOverId(null); }}
        onDragOver={e => { if (!dragId || !page) return; e.preventDefault(); if (overId !== id) setOverId(id); }}
        onDrop={e => { e.preventDefault(); if (dragId && page) commit(lib.movePage(store, dragId, i)); setDragId(null); setOverId(null); }}>
        <button className="h-tab" onClick={() => onPick(id)} onDoubleClick={() => page && onEdit(page)} title={page ? (page.desc || name) + ' · double-click to edit · drag to reorder' : 'Every sequence in this project'}
          style={{
            display: 'flex', alignItems: 'baseline', gap: 7, padding: on && page ? '10px 4px 9px 12px' : '10px 12px 9px', border: 0, borderRadius: '8px 8px 0 0',
            background: 'transparent', fontSize: 12, fontWeight: on ? 700 : 400, color: on ? 'var(--ink)' : 'var(--mut)', whiteSpace: 'nowrap',
            boxShadow: on ? 'inset 0 -2px 0 var(--acc)' : 'none', cursor: page ? 'pointer' : undefined,
          }}>
          {name}
          <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--mut)' }}>{count}</span>
        </button>
        {on && page && (
          <button className="h-acct" onClick={() => onEdit(page)} title="Edit this page · name, columns, sequences"
            style={{ padding: '0 10px 0 4px', border: 0, borderRadius: '0 8px 0 0', background: 'transparent', color: 'var(--mut)', fontSize: 13, letterSpacing: '0.05em', boxShadow: 'inset 0 -2px 0 var(--acc)' }}>⋯</button>
        )}
      </span>
    );
  };
  return (
    <nav style={{ display: 'flex', alignItems: 'flex-end', gap: 2, padding: '0 20px', borderBottom: '1px solid var(--line)', overflowX: 'auto', minHeight: 40 }}>
      {tab(lib.ALL_PAGE, 'All sequences', store.seqs.length, null, -1)}
      {store.pages.length > 0 && <span style={{ alignSelf: 'center', width: 1, height: 16, background: 'var(--line)', margin: '0 6px', flex: 'none' }} />}
      {store.pages.map((p, i) => tab(p.id, p.name, lib.pageSeqs(store, p).length, p, i))}
      <button className="h-acc" onClick={onNew} title="A page shows a chosen set of this project's sequences"
        style={{ alignSelf: 'center', flex: 'none', marginLeft: 8, padding: '4px 11px', border: '1px dashed var(--line)', borderRadius: 99, background: 'transparent', fontSize: 11, color: 'var(--mut)', whiteSpace: 'nowrap' }}>+ page</button>
    </nav>
  );
}

/** Create or edit a page: its name, description, columns and the sequences it shows. */
export function PageDialog({ page, onClose, onSaved }: { page: Page | null; onClose: () => void; onSaved: (id: string | null) => void }) {
  const { store, allCols, hue, commit, projectName } = useApp();
  const [name, setName] = useState(page ? page.name : '');
  const [desc, setDesc] = useState(page ? page.desc : '');
  const [cols, setCols] = useState<string[] | null>(page ? page.cols : null);
  const [rows, setRows] = useState<Set<string>>(() => new Set(page ? page.rows : []));
  const [q, setQ] = useState('');
  const [armed, confirm] = useConfirm();

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = (s: lib.RowForm) => !needle || [s.name, s.seq, s.group].some(t => (t || '').toLowerCase().includes(needle));
    return lib.groupOrder(store.seqs).map(g => ({ g, rows: store.seqs.filter(s => (s.group || '').trim() === g && hit(s)) })).filter(x => x.rows.length);
  }, [store.seqs, q]);
  const shownIds = groups.flatMap(x => x.rows.map(s => s.id));
  const anyGroup = groups.some(x => x.g);
  const setMany = (ids: string[], on: boolean) => setRows(cur => { const n = new Set(cur); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; });

  const colOn = (k: string) => !cols || cols.includes(k);
  const toggleCol = (k: string) => {
    const cur = cols || allCols.map(c => c.k);
    const next = cur.includes(k) ? cur.filter(x => x !== k) : allCols.map(c => c.k).filter(x => x === k || cur.includes(x));
    if (!next.length) return;
    setCols(next.length === allCols.length ? null : next);
  };

  const ok = !!name.trim();
  const save = () => {
    if (!ok) return;
    // Keep the page's own order for rows that stay; newly picked rows follow in project order.
    const kept = (page ? page.rows : []).filter(id => rows.has(id));
    const added = store.seqs.map(s => s.id).filter(id => rows.has(id) && !kept.includes(id));
    const patch = { name: name.trim(), desc: desc.trim(), rows: kept.concat(added), cols };
    if (page) { commit(lib.updatePage(store, page.id, patch)); onSaved(page.id); }
    else { const p = { ...lib.newPage(patch.name, patch.rows, cols), desc: patch.desc }; commit(lib.addPage(store, p)); onSaved(p.id); }
  };
  const duplicate = () => {
    if (!page) return;
    const p = { ...lib.newPage(page.name + ' copy', page.rows, page.cols), desc: page.desc };
    commit(lib.addPage(store, p));
    onSaved(p.id);
  };
  const remove = () => {
    if (!page || !confirm('del')) return;
    commit(lib.deletePage(store, page.id));
    onSaved(null);
  };

  const lab = { fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--mut)' };
  const small = { fontSize: 11, color: 'var(--mut)' };
  return (
    <div className="scrim" onClick={onClose} style={{ zIndex: 13 }}>
      <div className="card" onClick={stop} style={{ width: 'min(680px, 100%)' }}>
        <div className="card-head">
          <div>
            <div className="title22">{page ? 'Edit page' : 'New page'}</div>
            <div style={{ ...small, letterSpacing: '0.06em', marginTop: 4, lineHeight: 1.6 }}>A view of {projectName}: the data stays in the project, so taking a sequence off this page never deletes it.</div>
          </div>
          <button className="x-btn h-surf" onClick={onClose}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 20px 0' }}>
          <label className="fld">
            <span style={lab}>Name</span>
            <input className="inp" autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} placeholder="e.g. Aromatic set, Supervisor meeting" />
          </label>
          <label className="fld">
            <span style={lab}>Description · shown above the matrix</span>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="What this page collects, and why…"
              style={{ width: '100%', minHeight: 54, resize: 'vertical', padding: '9px 11px', background: 'var(--field)', border: '1px solid var(--line)', fontSize: 13, lineHeight: 1.6 }} />
          </label>
          <div className="fld">
            <span style={lab}>Columns · {cols ? cols.length + ' of ' + allCols.length : 'all ' + allCols.length}</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {allCols.map(c => {
                const on = colOn(c.k);
                return (
                  <button key={c.k} onClick={() => toggleCol(c.k)} title={c.name}
                    style={{ padding: '6px 13px', border: '1px solid ' + (on ? hue(c) : 'var(--line)'), borderRadius: 99, background: on ? hue(c) : 'transparent', color: on ? '#fff' : 'var(--mut)', fontWeight: 700, fontSize: 12 }}>{c.label}</button>
                );
              })}
              {cols && <button className="h-acc ob" onClick={() => setCols(null)}>show all</button>}
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="lbl-wide">Sequences</span>
            <span className="rule" />
            <span style={small}>{rows.size} of {store.seqs.length} on this page</span>
          </div>
          {!store.seqs.length ? (
            <div style={{ padding: '12px 14px', border: '1px dashed var(--line)', borderRadius: 10, ...small, lineHeight: 1.6 }}>
              This project has no sequences yet. Create the page, then upload xvg files while it is open — new rows join it.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input className="inp-s" value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by name, sequence or group" style={{ flex: 1, padding: '8px 11px' }} />
                <button className="h-acc ob" onClick={() => setMany(shownIds, true)}>{q ? 'add shown' : 'add all'}</button>
                <button className="h-acc ob" onClick={() => setMany(shownIds, false)}>{q ? 'remove shown' : 'clear'}</button>
              </div>
              <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 12 }}>
                {!groups.length && <div style={{ padding: '12px 14px', ...small }}>Nothing matches “{q}”.</div>}
                {groups.map(({ g, rows: rs }) => (
                  <div key={g || '∅'}>
                    {anyGroup && (
                      <div className="lbl-wide" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px 5px', position: 'sticky', top: 0, background: 'var(--bg)' }}>
                        <span>{g || 'no group'}</span>
                        <span className="rule" />
                        <button className="h-acct" onClick={() => setMany(rs.map(s => s.id), !rs.every(s => rows.has(s.id)))}
                          style={{ padding: 0, border: 0, background: 'transparent', fontSize: 10, letterSpacing: '0.06em', textTransform: 'none', color: 'var(--mut)' }}>
                          {rs.every(s => rows.has(s.id)) ? 'none' : 'all'}
                        </button>
                      </div>
                    )}
                    {rs.map(s => {
                      const on = rows.has(s.id);
                      return (
                        <button key={s.id} className="h-surf" onClick={() => setMany([s.id], !on)}
                          style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) minmax(0, 1fr) auto', gap: 10, alignItems: 'center', width: '100%', padding: '7px 12px', border: 0, borderRadius: 0, background: 'transparent', textAlign: 'left' }}>
                          <span style={{ width: 14, height: 14, borderRadius: 4, border: '1px solid ' + (on ? 'var(--acc)' : 'var(--line)'), background: on ? 'var(--acc)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', lineHeight: 1 }}>{on ? '✓' : ''}</span>
                          <span className="ellip" style={{ fontWeight: 700, fontSize: 12 }}>{s.name || '(unnamed)'}</span>
                          <span className="ellip" style={{ fontSize: 11, letterSpacing: '0.14em', color: 'var(--mut)' }}>{s.seq || '—'}</span>
                          <span style={{ ...small, whiteSpace: 'nowrap' }}>{plural(s.runs.length, 'run')}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px 20px', flexWrap: 'wrap' }}>
          {page && (
            <>
              <button className="h-acc ob" onClick={remove} style={{ padding: '8px 12px', color: armed === 'del' ? 'var(--acc)' : 'var(--mut)' }}>{armed === 'del' ? 'click again · sequences stay in the project' : 'delete page'}</button>
              <button className="h-acc ob" onClick={duplicate} style={{ padding: '8px 12px' }}>duplicate</button>
            </>
          )}
          <span style={{ flex: 1 }} />
          <button className="h-surf" onClick={onClose} style={{ padding: '10px 16px', border: '1px solid var(--line)', borderRadius: 10, background: 'transparent', fontSize: 12 }}>Cancel</button>
          <button onClick={save} disabled={!ok}
            style={{ padding: '10px 20px', border: 0, borderRadius: 10, background: ok ? 'var(--acc)' : 'var(--line)', color: ok ? '#fff' : 'var(--mut)', fontWeight: 700, fontSize: 12, letterSpacing: '0.03em' }}>
            {page ? 'Save page' : 'Create page'}
          </button>
        </div>
      </div>
    </div>
  );
}
