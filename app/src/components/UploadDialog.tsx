import { useMemo, useRef, useState } from 'react';
import { filesFromInput, type PickedFile } from '../lib/folderFiles';
import * as lib from '../lib/seq';
import { useApp } from '../ctx';
import type { Upload } from '../lib/storage/plan';
import { ColPicker, Seg, plural, stop } from './ui';
import { TagPicker } from './TagPicker';

const SRC = { path: 'folder', name: 'file name', header: 'header' } as const;
/** "folder: group, column · file name: time" — fields not listed come from the form. */
const sourcesText = (from: lib.PlanItem['from']) => (Object.keys(SRC) as (keyof typeof SRC)[])
  .map(src => [src, Object.entries(from).filter(([, v]) => v === src).map(([k]) => lib.FIELD_LABEL[k as keyof typeof lib.FIELD_LABEL])] as const)
  .filter(([, ks]) => ks.length).map(([src, ks]) => SRC[src] + ': ' + ks.join(', ')).join(' · ');

/** Where each file's type came from (F114). */
const HOW = { file: 'file name', header: 'header', name: 'name keyword', generic: 'no match' } as const;
const PAGE = 200;
const GRID = 'minmax(0, 1.5fr) minmax(0, 0.8fr) minmax(0, 0.6fr) minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 0.5fr) minmax(0, 1fr) 26px';

export function UploadDialog({ form: f, setForm, readFiles, reading, onDragOver, onDrop, onSaved }: {
  form: lib.UploadForm; setForm: (f: lib.UploadForm | null) => void;
  readFiles: (l: (File | PickedFile)[], extra?: { skipped?: string[] }) => void; reading: { done: number; total: number } | null;
  onDragOver: (e: React.DragEvent) => void; onDrop: (e: React.DragEvent) => void;
  onSaved: (last: { rowId: string; col: string } | null, count: number, fromCell: boolean) => void;
}) {
  const { store, settings: st, types, allCols: cols, hue, dark, commit, openSettings, setSetting, page } = useApp();
  const fileRef = useRef<HTMLInputElement>(null), dirRef = useRef<HTMLInputElement>(null);
  const setF = (patch: Partial<lib.UploadForm>) => setForm({ ...f, msg: '', err: false, ...patch });

  // Planned once per change of the form, store or settings, not on every render.
  const fp = useMemo(() => ({ ...f, files: f.files.map(x => ({ ...x, parsed: lib.parseName(x.file, st.pattern) })) }), [f, st.pattern]);
  const plan = useMemo(() => lib.planBatch(store, fp, types, st), [store, fp, types, st]);
  const byId = useMemo(() => Object.fromEntries(plan.map(p => [p.id, p])), [plan]);
  // Big folders: list the first rows, plus every file that needs attention, so typing stays fast.
  const [limit, setLimit] = useState(PAGE);
  const shown = useMemo(() => f.files.filter((x, i) => i < limit || !byId[x.id]?.ok), [f.files, limit, byId]);
  const hidden = f.files.length - shown.length;
  const pf = lib.patternFields(st.pattern);
  const from = (k: Parameters<typeof pf.has>[0]) => f.parse && pf.has(k);
  const nOk = plan.filter(p => p.ok).length, nRep = plan.filter(p => p.ok && p.replaces).length, nApp = plan.filter(p => p.ok && p.appends).length;
  const nBad = f.files.filter(x => !x.table).length;
  const nSame = plan.filter(p => p.sameAs && !p.ok).length, nConflict = plan.filter(p => p.conflicts.length).length;
  const nAna = plan.some(p => p.ok && p.ana.k !== 'pmf');
  const unmatched = f.parse ? plan.filter(p => !p.matched).length : 0;
  const sharedName = plan.filter(p => { const fl = lib.parseName(p.file, st.pattern).fields; return !(f.parse && p.matched && (fl.name || fl.seq)); }).length;
  const op = (k: Parameters<typeof pf.has>[0]) => (from(k) ? 0.55 : 1);
  const anyAna = plan.some(p => p.ana.k !== 'pmf') || (f.ana !== 'auto' && f.ana !== 'pmf');

  const anaNote = (() => {
    const t = types.find(q => q.k === f.ana);
    const base = !t ? 'the xvg header first (gmx awh = PMF, then a type’s GROMACS tool, then its keywords as whole words in the title, y label and legends), then in the file name · no match = Data'
      : t.k === 'pmf' ? 'x col ' + st.xCol + ', y col ' + st.yCol + ' · goes into the matrix'
      : 'x col ' + (t.xCol || 1) + ', y cols ' + (t.yCols || '2') + ' · ' + t.xLabel + ' → ' + t.yLabel + ' · attached to the run slot';
    return (from('ana') ? '{analysis} in the file name wins · ' : '') + base;
  })();

  const msg = f.msg || (!f.files.length ? 'Pick one or more files to continue.'
    : !nOk ? (nConflict ? 'Fix the conflicting fields, or remove those files.' : plan.some(p => !p.name) ? 'Give the files a name, or turn on reading from the file name.' : 'No readable curves yet.')
    : [plural(nOk, nAna ? 'file' : 'run') + ' ready', nRep ? nRep + ' replace existing runs' : '', nApp ? plural(nApp, 'file') + ' add curves to an analysis' : '',
      unmatched ? plural(unmatched, 'name') + ' did not match — form values used' : '', nConflict ? plural(nConflict, 'file') + ' with conflicting fields left out' : '', nSame ? plural(nSame, 'identical file') + ' left out' : '', nBad ? nBad + ' unreadable' : ''].filter(Boolean).join(' · '));

  const save = () => {
    if (!plan.some(p => p.ok)) { setF({ msg: !f.files.length ? 'No curve loaded yet.' : 'Nothing to add — every file needs a name.', err: true }); return; }
    const res = lib.addBatch(store, fp, plan);
    // The original of every file that made it in is stored as uploaded.
    const uploads = new Map<string, Upload>();
    for (const p of plan) {
      const x = p.ok && p.fileId ? f.files.find(q => q.id === p.id) : null;
      if (x && x.blob) uploads.set(p.fileId!, { blob: x.blob, name: x.file, ...(x.sha256 ? { sha256: x.sha256 } : {}), ...(x.existingPath ? { existingPath: x.existingPath } : {}) });
    }
    // On a page, every row the upload touched joins it (with any column it used).
    commit(page ? lib.addToPage(res.store, page.id, res.touched, res.cols) : res.store, uploads);
    setForm(null);
    onSaved(res.last, res.count, !!f.keepName);
  };

  const newAna = () => {
    const list = lib.projectAnalyses(st);
    const t = lib.newAnalysis(list.concat([{ k: 'pmf' } as never]), 'New analysis');
    setSetting({ analyses: list.concat(t) });
    setF({ ana: t.k });
    openSettings(t.k);
  };

  const fieldLabel = { fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--mut)' };
  const field = (label: string, o: number, input: React.ReactNode) => (
    <label className="fld" style={{ opacity: o }}>
      <span className="ellip" style={fieldLabel}>{label}</span>
      {input}
    </label>
  );

  return (
    <div className="scrim" onClick={() => setForm(null)} style={{ zIndex: 12 }}>
      <div className="card" onClick={stop} onDragOver={onDragOver} onDrop={onDrop} style={{ width: 'min(860px, 100%)' }}>
        <div className="card-head">
          <div>
            <div className="title22">Upload files</div>
            <div style={{ fontSize: 11, color: 'var(--mut)', letterSpacing: '0.06em', marginTop: 4 }}>
              {(f.files.length ? plural(f.files.length, 'file') + ' · col ' + st.xCol + ' = x, col ' + st.yCol + ' = y' : 'Column ' + st.xCol + ' is read as x, column ' + st.yCol + ' as y · change in Settings') + (page ? ' · rows join ' + page.name : '')}
            </div>
          </div>
          <button className="x-btn h-surf" onClick={() => setForm(null)}>×</button>
        </div>

        <div style={{ padding: '16px 20px 0' }}>
          <button className="h-accb" onClick={() => fileRef.current && fileRef.current.click()}
            style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', padding: '16px 18px', border: '2px dashed ' + (f.files.length ? 'var(--acc)' : 'var(--line)'), borderRadius: 14, background: 'var(--surf)', textAlign: 'left' }}>
            <span style={{ fontFamily: 'var(--arch)', fontWeight: 800, fontSize: 13, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{f.files.length ? '+ Add more files' : 'Choose or drop xvg files'}</span>
            <span style={{ fontSize: 11, color: 'var(--mut)', lineHeight: 1.6 }}>{f.files.length ? 'Select several at once, or drop a batch here' : 'gmx awh output, or any column text file · select several at once'}</span>
          </button>
          <input type="file" multiple accept=".xvg,.dat,.txt,text/plain" ref={fileRef} style={{ display: 'none' }}
            onChange={e => { const list = Array.from(e.target.files || []); e.target.value = ''; readFiles(list); }} />
          <input type="file" ref={el => { dirRef.current = el; if (el) el.webkitdirectory = true; }} style={{ display: 'none' }}
            onChange={e => { const p = filesFromInput(e.target.files || []); e.target.value = ''; readFiles(p.files, { skipped: p.skipped }); }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="h-acc" onClick={() => dirRef.current?.click()} style={{ padding: '5px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', fontSize: 11, whiteSpace: 'nowrap' }}>Choose folder…</button>
            <span style={{ fontSize: 11, color: 'var(--mut)' }}>or drop a folder · its .xvg, .dat and .txt files are read, with their folder path</span>
            <span aria-live="polite" style={{ fontSize: 11, color: 'var(--ink)' }}>{reading ? 'Reading ' + reading.done + ' / ' + reading.total + '…' : ''}</span>
          </div>
          {!!f.skipped?.length && (
            <details style={{ marginTop: 8, fontSize: 11, color: 'var(--mut)' }}>
              <summary style={{ cursor: 'pointer' }}>{plural(f.skipped.length, 'file')} skipped (not xvg, dat or txt)</summary>
              <div style={{ maxHeight: 120, overflow: 'auto', marginTop: 4, lineHeight: 1.6, overflowWrap: 'anywhere' }}>{f.skipped.map(n => <div key={n}>{n}</div>)}</div>
            </details>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px 16px', padding: '14px 20px 0', flexWrap: 'wrap' }}>
          <span className="lbl" style={{ whiteSpace: 'nowrap' }}>Fields</span>
          <Seg value={f.parse} onPick={v => setF({ parse: v })} opts={[{ v: true, label: 'from file name' }, { v: false, label: 'same for all' }]} />
          <span style={{ fontSize: 11, color: 'var(--mut)', minWidth: 0, overflowWrap: 'anywhere' }}>{f.parse ? st.pattern + (st.pathPattern ? ' · folders: ' + st.pathPattern : '') : 'every file gets the name below, +1, +2…'}</span>
          <button className="h-acc" onClick={() => openSettings()} style={{ marginLeft: 'auto', padding: '5px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', fontSize: 11, color: 'var(--mut)', whiteSpace: 'nowrap' }}>edit pattern</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px 16px', padding: '12px 20px 0', flexWrap: 'wrap' }}>
          <span className="lbl" style={{ whiteSpace: 'nowrap' }}>Analysis</span>
          <select value={f.ana} onChange={e => { const v = e.target.value; if (v === '__new') newAna(); else setF({ ana: v }); }}
            style={{ padding: '8px 10px', background: 'var(--field)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12, maxWidth: '100%' }}>
            <option value="auto">auto-detect</option>
            {types.map(t => <option key={t.k} value={t.k}>{t.label + (t.name ? ' · ' + t.name : '')}</option>)}
            <option value="__new">+ define a new analysis…</option>
          </select>
          <span style={{ fontSize: 11, color: 'var(--mut)', minWidth: 0, flex: '1 1 220px', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{anaNote}</span>
        </div>

        {anyAna && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px 16px', padding: '12px 20px 0', flexWrap: 'wrap' }}>
            <span className="lbl" style={{ whiteSpace: 'nowrap' }}>Slot taken</span>
            <Seg<lib.UploadForm['onClash']> value={f.onClash} onPick={v => setF({ onClash: v })} opts={[{ v: 'replace', label: 'replace analysis' }, { v: 'append', label: 'add as more curves' }]} />
            <span style={{ fontSize: 11, color: 'var(--mut)', minWidth: 0, flex: '1 1 220px', lineHeight: 1.5 }}>
              {f.onClash === 'append'
                ? 'analysis files for the same run join one graph, one curve per file and y column · rename each curve’s legend in the graph pop-up'
                : 'an analysis already in that run slot is replaced by the new file'}
            </span>
          </div>
        )}

        {f.files.length > 0 && (
          <div style={{ margin: '12px 20px 0', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
            <div className="lbl" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, padding: '8px 12px', background: 'var(--surf)', borderBottom: '1px solid var(--line)', letterSpacing: '0.1em' }}>
              <span>File</span><span>Group</span><span>Column</span><span>Analysis</span><span>Name</span><span>Time</span><span>Slot</span><span />
            </div>
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              {shown.map(x => {
                const p = byId[x.id];
                const remove = () => setF({ files: f.files.filter(q => q.id !== x.id) });
                const nc = p && p.curves ? p.curves.length : 0;
                const r = !p
                  ? { group: '—', col: '—', colHue: 'var(--mut)', ana: '—', anaC: undefined, name: '—', time: '—', status: x.err || 'unreadable', statusC: 'var(--acc)' }
                  : {
                    group: p.group || '—', col: p.col.label + (p.colNew ? ' · new' : ''), colHue: hue(p.col),
                    ana: p.ana.label + (p.anaHow === 'form' ? '' : ' · ' + HOW[p.anaHow]), anaC: p.anaHow === 'generic' ? 'var(--accInk)' : undefined,
                    name: p.name || '—', time: p.time || '—',
                    status: p.err ? p.err : p.conflicts.length ? 'conflict · not added' : !p.name ? 'needs a name' : p.sameAs ? '≡ ' + p.sameAs + (p.ok ? ' · included' : ' · left out') : p.dup ? 'duplicate slot · skipped'
                      : lib.runLabel(p.run) + (nc > 1 ? ' · ' + nc + ' curves' : '') + (p.appends ? ' · adds curves' : '') + (p.replaces ? ' · replaces' : '') + (f.parse && !p.matched ? ' · no match' : ''),
                    statusC: p.conflicts.length ? 'var(--accInk)' : !p.ok ? 'var(--acc)' : p.replaces || (f.parse && !p.matched) ? 'var(--accInk)' : 'var(--mut)',
                  };
                return (
                  <div key={x.id} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, alignItems: 'center', padding: '7px 12px', borderBottom: '1px solid var(--line)', fontSize: 11 }}>
                    <span style={{ minWidth: 0 }} title={[x.path || x.file, p ? sourcesText(p.from) : ''].filter(Boolean).join('\n')}><span className="ellip" style={{ display: 'block' }}>{x.file}</span>
                      {(x.path?.includes('/') || (p && Object.keys(p.from).length > 0)) && (
                        <span className="ellip" style={{ display: 'block', color: 'var(--mut)', fontSize: 10 }}>
                          {[x.path?.includes('/') ? x.path.slice(0, x.path.lastIndexOf('/')) : '', p ? sourcesText(p.from) : ''].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    <span className="ellip" style={{ color: 'var(--mut)' }}>{r.group}</span>
                    <span className="ellip" style={{ fontWeight: 700, color: r.colHue }}>{r.col}</span>
                    <span className="ellip" title={r.ana} style={{ color: r.anaC }}>{r.ana}</span>
                    <span className="ellip" style={{ fontWeight: 700 }}>{r.name}</span>
                    <span className="ellip" style={{ color: 'var(--mut)' }}>{r.time}</span>
                    <span className="ellip" style={{ color: p && p.sameAs ? 'var(--accInk)' : r.statusC }} title={r.status}>{r.status}</span>
                    <button className="h-acc" onClick={remove} title="Drop this file from the upload" style={{ width: 24, height: 24, padding: 0, border: '1px solid transparent', borderRadius: 99, background: 'transparent', color: 'var(--mut)', fontSize: 13, lineHeight: 1 }}>×</button>
                    {p && p.conflicts.length > 0 && (
                      <span style={{ gridColumn: '1 / -1', color: 'var(--accInk)', lineHeight: 1.5 }}>
                        {p.conflicts.map(c => c.replace('(path)', '(folder)').replace('(name)', '(file name)')).join(' · ')} — fix the file name, folder or pattern, or remove the file
                      </span>
                    )}
                    {p && p.sameAs && (
                      <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accInk)', lineHeight: 1.5 }}>
                        <input type="checkbox" checked={!!(f.include && f.include[x.id])} onChange={e => setF({ include: { ...(f.include || {}), [x.id]: e.target.checked } })} />
                        <span>≡ {p.sameAs}. Include it anyway</span>
                      </label>
                    )}
                  </div>
                );
              })}
              {hidden > 0 && (
                <button className="h-acc" onClick={() => setLimit(limit + PAGE)} style={{ display: 'block', width: '100%', padding: '8px 12px', border: 0, background: 'transparent', fontSize: 11, color: 'var(--mut)', textAlign: 'left' }}>
                  {hidden + ' more ready ' + (hidden === 1 ? 'file' : 'files') + ' not listed · show ' + Math.min(PAGE, hidden) + ' more'}
                </button>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '18px 20px 0' }}>
          <span className="lbl-wide" style={{ whiteSpace: 'nowrap' }}>Applies to every file</span>
          <span className="rule" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, padding: '12px 20px 0' }}>
          {field('Group' + (from('group') ? ' · from file' : ''), op('group'),
            <input className="inp" value={f.group} onChange={e => setF({ group: e.target.value })} list="pmf-groups" placeholder="e.g. prosecco75" />)}
          {field(from('name') ? 'Name · from file' : from('seq') ? 'Name · defaults to sequence' : sharedName > 1 && !f.keepName ? 'Name · +1, +2… per file of the same analysis' : 'Name', op('name'),
            <input className="inp" value={f.name} onChange={e => setF({ name: e.target.value })} placeholder="e.g. PEP-04" />)}
          {field(from('seq') ? 'Sequence · from file' : 'Sequence · optional', op('seq'),
            <input className="inp" value={f.seq} onChange={e => setF({ seq: e.target.value.toUpperCase() })} placeholder="e.g. WRWYCR" style={{ letterSpacing: '0.16em', textTransform: 'uppercase' }} />)}
          {field('Simulation time' + (from('time') ? ' · from file' : ''), op('time'),
            <input className="inp" value={f.time} onChange={e => setF({ time: e.target.value })} placeholder="e.g. 200 000" />)}
          {field('Temp (K)' + (from('temp') ? ' · from file' : ' · drives correction'), op('temp'),
            <input className="inp" value={f.temp} onChange={e => setF({ temp: e.target.value })} placeholder="310.15" />)}
          {field('Run slot' + (from('run') ? ' · from file' : ''), op('run'),
            <select className="inp" value={f.run} onChange={e => setF({ run: e.target.value as lib.UploadForm['run'] })}>
              <option value="auto">auto · next free</option>
              {lib.SLOTS.map(k => <option key={k} value={k}>{lib.runLabel(k)}</option>)}
            </select>)}
        </div>
        <datalist id="pmf-groups">
          {[...new Set(store.seqs.map(s => s.group).filter(Boolean))].map(g => <option key={g} value={g} />)}
        </datalist>

        <div style={{ padding: '14px 20px 0', opacity: from('col') ? 0.55 : 1 }}>
          <span className="lbl" style={{ display: 'block', marginBottom: 6 }}>{'Column' + (from('col') ? ' · from file name — used when it has no match' : '')}</span>
          <ColPicker cols={cols} value={f.col} onPick={k => setF({ col: k })} hue={hue} dark={dark} />
        </div>

        <div style={{ padding: '14px 20px 0' }}>
          <span className="lbl" style={{ display: 'block', marginBottom: 6 }}>Tags · for every run in this upload</span>
          <TagPicker value={f.tags} onChange={tags => setF({ tags })} />
        </div>

        <div style={{ padding: '14px 20px 0' }}>
          <span className="lbl" style={{ display: 'block', marginBottom: 6 }}>Description</span>
          <textarea value={f.desc} onChange={e => setF({ desc: e.target.value })} placeholder="What these sequences are, why they were run, anything to remember…"
            style={{ width: '100%', minHeight: 62, resize: 'vertical', padding: 10, background: 'var(--field)', border: '1px solid var(--line)', fontSize: 13, lineHeight: 1.6 }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 20px', flexWrap: 'wrap' }}>
          <span aria-live="polite" style={{ fontSize: 11, color: f.err ? 'var(--acc)' : 'var(--mut)', lineHeight: 1.5, flex: '1 1 200px' }}>{msg}</span>
          <button className="h-surf" onClick={() => setForm(null)} style={{ padding: '10px 16px', border: '1px solid var(--line)', borderRadius: 10, background: 'transparent', fontSize: 12 }}>Cancel</button>
          <button onClick={save} style={{ padding: '10px 20px', border: 0, borderRadius: 10, background: nOk ? 'var(--acc)' : 'var(--line)', color: nOk ? '#fff' : 'var(--mut)', fontWeight: 700, fontSize: 12, letterSpacing: '0.03em', opacity: nOk ? 1 : 0.7 }}>
            {nOk > 1 ? 'Add ' + plural(nOk, nAna ? 'file' : 'run') : nRep ? 'Replace run' : nApp ? 'Add curves' : 'Add to matrix'}
          </button>
        </div>
      </div>
    </div>
  );
}
