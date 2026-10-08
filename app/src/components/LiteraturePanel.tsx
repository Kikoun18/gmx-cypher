import { useState } from 'react';
import * as lib from '../lib/seq';
import { doiUrl, lookupDoi } from '../lib/literature';
import type { LitRef, Seq } from '../lib/types';
import { useApp, type Sel } from '../ctx';
import { ColPicker, plural, useConfirm } from './ui';

interface Draft { ref: LitRef; col: string; isNew: boolean }

/**
 * References for one simulation (sequence × column). The cell view edits that
 * cell's list; the row view shows every column's references, tagged, and adds
 * to whichever column is picked.
 */
export function LiteraturePanel({ row, sel }: { row: Seq; sel: Sel }) {
  const { store, cols, colOf, hue, dark, commit } = useApp();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [quick, setQuick] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [armed, confirm] = useConfirm();

  const isRow = sel.mode === 'row';
  const scopeCols = isRow ? cols : cols.filter(c => c.k === sel.s);
  const entries = scopeCols.flatMap(c => (store.lit[lib.litKey(c.k, row.id)] || []).map(r => ({ r, col: c.k })));
  const note = (t: string, err?: boolean) => { setMsg({ t, err }); setTimeout(() => setMsg(null), 3600); };

  // One box takes a DOI, a doi.org / publisher link, or just a title.
  const start = async () => {
    const q = quick.trim(), ref = lib.blankLit(), col = isRow ? cols[0].k : sel.s;
    const doi = lib.cleanDoi(q);
    if (doi) {
      setBusy(true);
      try { Object.assign(ref, await lookupDoi(doi)); note('filled from Crossref — check and save'); }
      catch (e) { ref.doi = doi; ref.url = doiUrl(doi); note(String((e as Error).message || e) + ' · fill in the rest by hand', true); }
      setBusy(false);
    } else if (/^https?:\/\//i.test(q)) ref.url = q;
    else ref.title = q;
    setDraft({ ref, col, isNew: true });
    setQuick('');
  };

  const saveDraft = () => {
    if (!draft) return;
    const r = draft.ref;
    if (!r.title.trim() && !r.doi.trim() && !r.url.trim()) { note('Give it at least a title, DOI or link.', true); return; }
    const clean = { ...r, doi: lib.cleanDoi(r.doi) || r.doi.trim(), title: r.title.trim(), authors: r.authors.trim(), year: r.year.trim(), venue: r.venue.trim(), url: r.url.trim() };
    let next = store;
    // Editing in the row view may move a reference to another column.
    if (!draft.isNew) for (const c of cols) if (c.k !== draft.col) next = lib.deleteLit(next, lib.litKey(c.k, row.id), r.id);
    commit(lib.saveLit(next, lib.litKey(draft.col, row.id), clean));
    setDraft(null);
  };

  const refetch = async () => {
    if (!draft) return;
    setBusy(true);
    try { const got = await lookupDoi(draft.ref.doi || draft.ref.url); setDraft({ ...draft, ref: { ...draft.ref, ...got } }); note('filled from Crossref'); }
    catch (e) { note(String((e as Error).message || e), true); }
    setBusy(false);
  };

  const setR = (patch: Partial<LitRef>) => draft && setDraft({ ...draft, ref: { ...draft.ref, ...patch } });
  const lab = { fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--mut)' };
  const field = (label: string, k: keyof LitRef, ph: string, span = 1) => (
    <label className="fld" style={{ gap: 4, gridColumn: 'span ' + span }}>
      <span style={lab}>{label}</span>
      <input className="inp-s" value={draft!.ref[k]} onChange={e => setR({ [k]: e.target.value })} placeholder={ph} />
    </label>
  );

  return (
    <div style={{ padding: '16px 20px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span className="lbl-wide">Literature</span>
        <span className="rule" />
        <span style={{ fontSize: 10, color: msg ? (msg.err ? 'var(--acc)' : 'var(--accInk)') : 'var(--mut)' }}>
          {msg ? msg.t : entries.length ? plural(entries.length, 'reference') + (isRow ? ' across columns' : '') : ''}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entries.map(({ r, col }, i) => {
          const c = colOf(col), link = r.doi ? doiUrl(r.doi) : r.url;
          const inList = (store.lit[lib.litKey(col, row.id)] || []);
          const li = inList.findIndex(x => x.id === r.id);
          const cf = armed === 'lit:' + r.id;
          if (draft && !draft.isNew && draft.ref.id === r.id) return renderEditor(r.id);
          return (
            <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 13px', border: '1px solid var(--line)', borderRadius: 11, background: 'var(--surf)' }}>
              <span style={{ fontFamily: 'var(--arch)', fontWeight: 800, fontSize: 12, color: 'var(--mut)', minWidth: 18, paddingTop: 1 }}>{i + 1}</span>
              <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.5 }}>
                  {isRow && <span style={{ color: hue(c), marginRight: 8 }}>{c.label}</span>}
                  {link ? <a href={link} target="_blank" rel="noreferrer" style={{ color: 'var(--ink)' }}>{r.title || link}</a> : (r.title || '(untitled)')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--mut)', lineHeight: 1.5 }}>
                  {[r.authors && (r.authors.length > 90 ? r.authors.slice(0, 90) + '…' : r.authors), r.venue, r.year].filter(Boolean).join(' · ')}
                  {r.doi && <> · <a href={doiUrl(r.doi)} target="_blank" rel="noreferrer">doi:{r.doi}</a></>}
                </div>
                {r.note && <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--ink)', whiteSpace: 'pre-wrap', marginTop: 2 }}>{r.note}</div>}
              </div>
              <span style={{ display: 'flex', gap: 4, flex: 'none' }}>
                <button className="h-acc ob" title="Move up" onClick={() => commit(lib.moveLit(store, lib.litKey(col, row.id), r.id, -1))} style={{ padding: '4px 7px', opacity: li === 0 ? 0.3 : 1 }}>↑</button>
                <button className="h-acc ob" title="Move down" onClick={() => commit(lib.moveLit(store, lib.litKey(col, row.id), r.id, 1))} style={{ padding: '4px 7px', opacity: li === inList.length - 1 ? 0.3 : 1 }}>↓</button>
                <button className="h-acc ob" onClick={() => setDraft({ ref: { ...r }, col, isNew: false })}>edit</button>
                <button className="h-acc ob" onClick={() => { if (confirm('lit:' + r.id)) commit(lib.deleteLit(store, lib.litKey(col, row.id), r.id)); }} style={{ color: cf ? 'var(--acc)' : 'var(--mut)' }}>{cf ? 'delete?' : '×'}</button>
              </span>
            </div>
          );
        })}
        {draft && draft.isNew && renderEditor('new')}
      </div>

      {!draft && (
        <div style={{ display: 'flex', gap: 8, marginTop: entries.length ? 8 : 0 }}>
          <input className="inp-s" value={quick} onChange={e => setQuick(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') start(); }}
            placeholder={'DOI, link or title — e.g. 10.1038/nsmb1201' + (isRow ? '' : ' · for ' + row.name + ' × ' + colOf(sel.s).label)} style={{ flex: 1, padding: '8px 11px' }} />
          <button className="h-acc" onClick={start} disabled={busy}
            style={{ padding: '0 14px', border: '1px solid var(--line)', borderRadius: 9, background: 'transparent', fontSize: 11, color: 'var(--ink)', whiteSpace: 'nowrap', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'looking up…' : quick.trim() && lib.cleanDoi(quick) ? 'look up DOI' : '+ reference'}
          </button>
        </div>
      )}
    </div>
  );

  function renderEditor(key: string) {
    const d = draft!;
    return (
      <div key={key} style={{ padding: '12px 14px 14px', border: '1px solid var(--acc)', borderRadius: 12, background: 'var(--surf)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isRow && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={lab}>Simulation · column</span>
            <ColPicker cols={cols} value={d.col} onPick={k => setDraft({ ...d, col: k })} hue={hue} dark={dark} size="s" />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
          {field('Title', 'title', 'Structures of the CD44–hyaluronan complex…', 4)}
          {field('Authors', 'authors', 'Banerji, S.; Wright, A. J.; …', 3)}
          {field('Year', 'year', '2007')}
          {field('Journal · book', 'venue', 'Nat. Struct. Mol. Biol.', 2)}
          {field('DOI', 'doi', '10.1038/nsmb1201', 2)}
          {field('Link', 'url', 'https://…', 4)}
        </div>
        <label className="fld" style={{ gap: 4 }}>
          <span style={lab}>Why it matters here</span>
          <textarea value={d.ref.note} onChange={e => setR({ note: e.target.value })} placeholder="What this paper says about this sequence × column — residues, affinities, figures to compare…"
            style={{ width: '100%', minHeight: 56, resize: 'vertical', padding: '8px 10px', background: 'var(--field)', border: '1px solid var(--line)', fontSize: 12, lineHeight: 1.6 }} />
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {(d.ref.doi || lib.cleanDoi(d.ref.url)) && (
            <button className="h-acc ob" onClick={refetch} disabled={busy}>{busy ? 'looking up…' : 'fill from DOI'}</button>
          )}
          <span style={{ flex: 1 }} />
          <button className="h-bg" onClick={() => setDraft(null)} style={{ padding: '8px 13px', border: '1px solid var(--line)', borderRadius: 9, background: 'transparent', fontSize: 11 }}>Cancel</button>
          <button onClick={saveDraft} style={{ padding: '8px 16px', border: 0, borderRadius: 9, background: 'var(--acc)', color: '#fff', fontWeight: 700, fontSize: 11 }}>{d.isNew ? 'Add reference' : 'Save reference'}</button>
        </div>
      </div>
    );
  }
}
