import { useEffect, useRef, useState } from 'react';
import * as lib from '../lib/seq';
import type { AnalysisType, Store, TagDef, Transform } from '../lib/types';
import { useApp } from '../ctx';
import { FunctionsPanel } from './FunctionsPanel';
import { TransformPicker } from './TransformPicker';
import { scriptResult } from '../lib/scriptRuns';
import { Seg, pad2, plural, stop, useConfirm } from './ui';
import { LASER_COLORS, keyLabel } from './Laser';
import { keyTaken, type KeyName } from '../lib/keys';
import { Rich } from './Plot';
import { ExportSettings } from './ExportSettings';

const STYLES: { v: AnalysisType['style']; label: string }[] = ['line', 'step', 'points', 'bars', 'auto'].map(v => ({ v: v as AnalysisType['style'], label: v }));
const LBL: Record<string, string> = { group: 'group', col: 'column', name: 'name', seq: 'seq', time: 'time', run: 'run', temp: 'temp', ana: 'analysis' };

export function SettingsDialog({ onClose, focusAnalysis, sorted, useManual, onNewAnalysisForForm, onColumnRemoved, onRowRemoved, onLaserTry }: {
  onClose: () => void; focusAnalysis: string | null; sorted: boolean; useManual: () => void;
  onNewAnalysisForForm: (k: string) => void; onColumnRemoved: (k: string) => void; onRowRemoved: (id: string) => void; onLaserTry: () => void;
}) {
  const { store, settings: st, setSetting, allCols: cols, types, hue, dark, commit, mutate, page, projectName, metric, skip, pmfT } = useApp();
  const [capturing, setCapturingKey] = useState<null | KeyName>(null);
  const setCapturing = (on: boolean, which: KeyName = 'laserKey') => setCapturingKey(on ? which : null);
  const [keyMsg, setKeyMsg] = useState('');
  const keyButton = (which: KeyName, def: string) => (
    <>
      <button className="h-accb" onClick={() => { setCapturing(capturing !== which, which); setKeyMsg(''); }} title="Click, then press the key you want"
        style={{ minWidth: 44, padding: '5px 12px', border: '1px solid ' + (capturing === which ? 'var(--acc)' : 'var(--line)'), borderRadius: 8, background: capturing === which ? 'var(--surf)' : 'var(--field)', fontWeight: 700, fontSize: 12, color: capturing === which ? 'var(--acc)' : 'var(--ink)', boxShadow: 'inset 0 -2px 0 var(--line)' }}>
        {capturing === which ? 'press a key…' : keyLabel(st[which])}
      </button>
      {st[which] !== def && capturing !== which && <button className="h-acc ob" onClick={() => setSetting({ [which]: def })}>reset</button>}
    </>
  );

  // Choosing the laser, compare or export key: the next key press becomes it, unless it's taken (keyTaken).
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.key === 'Escape') { setCapturingKey(null); setKeyMsg(''); return; }
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead'].includes(e.key)) return;
      const taken = keyTaken(e.key, capturing, st);
      if (taken) { setKeyMsg(taken); return; }
      setSetting({ [capturing]: e.key.length === 1 ? e.key.toLowerCase() : e.key });
      setCapturingKey(null); setKeyMsg('');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, setSetting, st]);
  // Drag and drop (Modify): a grip starts the drag; rows of the same kind (and the same
  // method, for sequences) accept it; a line shows where it lands.
  type DragKind = 'col' | 'group' | 'row';
  const [drag, setDrag] = useState<{ kind: DragKind; id: string; scope: string } | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  const grip = (kind: DragKind, id: string, scope: string, title: string) => (
    <span draggable title={title} className="h-acc"
      onDragStart={e => {
        setDrag({ kind, id, scope });
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        const row = e.currentTarget.closest('[data-dnd]');
        if (row) e.dataTransfer.setDragImage(row, 14, 14);
      }}
      onDragEnd={() => { setDrag(null); setOver(null); }}
      style={{ display: 'grid', placeItems: 'center', width: 22, height: 30, borderRadius: 7, color: 'var(--mut)', cursor: 'grab', fontSize: 14, letterSpacing: '-0.1em', userSelect: 'none' }}>⠿</span>
  );
  const dropZone = (kind: DragKind, id: string, scope: string, ids: string[], move: (st: Store, id: string, dir: number) => Store) => {
    const mine = !!drag && drag.kind === kind && drag.scope === scope;
    const hit = mine && over && over.id === id && drag!.id !== id;
    return {
      'data-dnd': '',
      onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
        if (!mine) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
        if (!over || over.id !== id || over.after !== after) setOver({ id, after });
      },
      onDrop: (e: React.DragEvent<HTMLDivElement>) => {
        if (!mine) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
        const from = ids.indexOf(drag!.id);
        let to = ids.indexOf(id) + (after ? 1 : 0);
        if (to > from) to--;
        let next = store;
        for (let i = 0; i < Math.abs(to - from); i++) next = move(next, drag!.id, Math.sign(to - from));
        if (next !== store) commit(next);
        setDrag(null); setOver(null);
      },
      style: {
        borderRadius: 8, transition: 'opacity 120ms',
        opacity: mine && drag!.id === id ? 0.35 : 1,
        boxShadow: hit ? (over!.after ? '0 2px 0 0 var(--acc)' : '0 -2px 0 0 var(--acc)') : 'none',
      } as React.CSSProperties,
    };
  };
  const [testName, setTestName] = useState('prosecco75_o26_WRWYCR_t200.xvg');
  const [testPath, setTestPath] = useState('hmr+fast+6/ha/WRWYCR/9.multiwalker/1');
  const [newTag, setNewTag] = useState('');
  /** A PMF correction picked but not applied yet: the tiles it would change are shown first (R2). */
  const [nextT, setNextT] = useState<Transform | null>(null);
  const [anaOpen, setAnaOpen] = useState<string | null>(focusAnalysis);
  const [newCol, setNewCol] = useState({ label: '', name: '' });
  const [armed, confirm] = useConfirm();
  const boxRef = useRef<HTMLDivElement>(null), anaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusAnalysis) return;
    const t = setTimeout(() => {
      const a = anaRef.current, b = boxRef.current;
      if (a && b) b.scrollTop += a.getBoundingClientRect().top - b.getBoundingClientRect().top - 12;
    }, 80);
    return () => clearTimeout(t);
  }, [focusAnalysis]);

  const anaList: AnalysisType[] = lib.projectAnalyses(st);
  const updA = (k: string, patch: Partial<AnalysisType>) => setSetting({ analyses: anaList.map(a => (a.k === k ? { ...a, ...patch } : a)) });
  const countA = (k: string) => store.seqs.reduce((n, s) => n + s.extras.filter(e => e.type === k).length, 0);
  const setNum = (k: 'xCol' | 'yCol') => (e: React.ChangeEvent<HTMLInputElement>) => setSetting({ [k]: Math.max(1, parseInt(e.target.value, 10) || 1) });

  const t = lib.parseName(testName, st.pattern), tp = st.pathPattern ? lib.parsePath(testPath, st.pathPattern) : null;
  const tm = lib.mergeFields([['name', t], ['path', tp || undefined]], (k, v) => (k === 'col' ? lib.matchCol(cols, v)?.k || v.trim().toLowerCase() : v.trim().toLowerCase()));
  const testFields = Object.entries(tm.fields).map(([k, v]) => {
    let val = k === 'run' ? lib.runLabel(v!) : v!, c = 'var(--ink)';
    if (k === 'ana') { const m = lib.matchAna(types, v!); val = m ? m.label : v + ' (no match)'; c = m ? 'var(--ink)' : 'var(--acc)'; }
    if (k === 'col') { const m = lib.matchCol(cols, v!); val = m ? m.label : v + ' (new column)'; c = m ? hue(m) : 'var(--ink)'; }
    return { k: LBL[k] || k, v: val, c, from: tp ? tm.from[k as keyof typeof tm.from] : undefined };
  });

  const tagList = lib.getTags(st);
  const setTags = (tags: TagDef[]) => setSetting({ tags });
  const addTag = () => { if (!newTag.trim()) return; setTags(tagList.concat(lib.newTag(tagList, newTag.trim()))); setNewTag(''); };
  const moveTag = (i: number, d: number) => { const t = tagList.slice(); [t[i], t[i + d]] = [t[i + d], t[i]]; setTags(t); };

  const addAna = () => {
    const na = lib.newAnalysis(anaList.concat([{ k: 'pmf' } as AnalysisType]), 'New analysis');
    setSetting({ analyses: anaList.concat(na) });
    setAnaOpen(na.k);
    onNewAnalysisForForm(na.k);
  };

  // Rows are listed — and reordered — for the page you're on; "All sequences" orders the project itself.
  const rowSeqs = lib.pageSeqs(store, page);
  const order = lib.groupOrder(rowSeqs), labelled = order.filter(g => g).length;
  const canAdd = !!newCol.label.trim();
  const sect = (label: string, extra?: React.ReactNode, mb = 12, tag = 'this project') => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: mb }}>
      <span className="lbl-wide">{label}</span>
      <span className="rule" />
      <span style={{ fontSize: 10, color: 'var(--mut)', whiteSpace: 'nowrap' }}>{tag}</span>
      {extra}
    </div>
  );
  const small = { fontSize: 11, color: 'var(--mut)' };

  return (
    <div className="scrim" onClick={onClose} style={{ zIndex: 14 }}>
      <div className="card" ref={boxRef} onClick={stop} style={{ width: 'min(720px, 100%)' }}>
        <div className="card-head">
          <div>
            <div className="title22">Settings</div>
            <div style={{ ...small, letterSpacing: '0.06em', marginTop: 4, lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--ink)' }}>{projectName}</strong> keeps its own file names, axes, analyses, functions, columns and rows · trust in scripts is kept in this browser · theme and the laser pointer apply to every project
            </div>
          </div>
          <button className="x-btn h-surf" onClick={onClose}>×</button>
        </div>

        {/* File names */}
        <div style={{ padding: '18px 20px 0' }}>
          {sect('File names')}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Seg value={st.parse !== false} onPick={v => setSetting({ parse: v })} opts={[{ v: true, label: 'read from file name' }, { v: false, label: 'same for all' }]} />
            <span style={{ ...small, lineHeight: 1.5, flex: '1 1 240px' }}>
              {st.parse === false ? 'Every file in an upload gets the name you type, with +1, +2… appended.' : '{method} becomes the group, {column} picks the column. Fields the pattern leaves out come from the upload form.'}
            </span>
          </div>
          <label className="fld" style={{ marginTop: 14 }}>
            <span className="lbl">File-name pattern</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="inp" value={st.pattern} onChange={e => setSetting({ pattern: e.target.value })} spellCheck={false} style={{ flex: 1, fontSize: 13 }} />
              <button className="h-acc" onClick={() => setSetting({ pattern: lib.DEFAULT_PATTERN })} style={{ padding: '0 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'transparent', ...small, whiteSpace: 'nowrap' }}>reset</button>
            </div>
          </label>
          <label className="fld" style={{ marginTop: 12 }}>
            <span className="lbl">Folder pattern · optional</span>
            <input className="inp" value={st.pathPattern} onChange={e => setSetting({ pathPattern: e.target.value })} spellCheck={false} placeholder="e.g. {method}/{column}/{seq}/{*}/{run}" style={{ fontSize: 13 }} />
            <span style={{ ...small, lineHeight: 1.5 }}>Read against the folders of an imported folder, or a file's GROMACS working directory. Matches the end of the path; ** stands for any folders. Where folder and file name disagree, the file waits until you fix it.</span>
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {lib.TOKENS.map(tk => (
              <button key={tk.t} className="h-accb" title="Insert into the pattern" onClick={() => {
                const p = st.pattern || '', m = /\.(xvg|dat|txt)$/i.exec(p);
                setSetting({ pattern: m ? p.slice(0, m.index) + tk.t + m[0] : p + tk.t });
              }} style={{ display: 'flex', gap: 6, alignItems: 'baseline', padding: '4px 10px', border: '1px solid var(--line)', borderRadius: 99, background: 'transparent', fontSize: 11 }}>
                <span style={{ color: 'var(--ink)' }}>{tk.t}</span>
                <span style={{ color: 'var(--mut)', fontSize: 10 }}>{tk.d}</span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 12, padding: '11px 13px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surf)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="lbl" style={{ whiteSpace: 'nowrap' }}>Test</span>
              <input aria-label="Test file name" value={testName} onChange={e => setTestName(e.target.value)} spellCheck={false} style={{ flex: 1, minWidth: 0, padding: '7px 10px', background: 'var(--field)', border: '1px solid var(--line)', fontSize: 12 }} />
            </div>
            {tp && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <span className="lbl" style={{ whiteSpace: 'nowrap' }}>Folder</span>
                <input aria-label="Test folder path" value={testPath} onChange={e => setTestPath(e.target.value)} spellCheck={false} style={{ flex: 1, minWidth: 0, padding: '7px 10px', background: 'var(--field)', border: '1px solid var(--line)', fontSize: 12 }} />
              </div>
            )}
            <div aria-live="polite" style={{ display: 'flex', gap: '6px 16px', flexWrap: 'wrap', marginTop: 9, fontSize: 11 }}>
              {testFields.map(tf => <span key={tf.k}><span style={{ color: 'var(--mut)' }}>{tf.k}</span> <strong style={{ color: tf.c }}>{tf.v}</strong>{tf.from && <span style={{ color: 'var(--mut)' }}> · {tf.from === 'path' ? 'folder' : 'file name'}</span>}</span>)}
              {tm.conflicts.map(c => <span key={c} style={{ color: 'var(--accInk)' }}>{c.replace('(path)', '(folder)').replace('(name)', '(file name)')}</span>)}
              {!t.matched && <span style={{ color: 'var(--accInk)' }}>file name does not match the pattern{tp ? '' : ' — the upload form values are used'}</span>}
              {tp && !tp.matched && <span style={{ color: 'var(--accInk)' }}>folder does not match the folder pattern</span>}
            </div>
          </div>
        </div>

        {/* Data & axes */}
        <div style={{ padding: '22px 20px 0' }}>
          {sect('Data & axes')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            <label className="fld"><span className="lbl">x column in xvg</span><input type="number" min={1} value={st.xCol} onChange={setNum('xCol')} className="inp" style={{ padding: '9px 11px' }} /></label>
            <label className="fld"><span className="lbl">y column in xvg</span><input type="number" min={1} value={st.yCol} onChange={setNum('yCol')} className="inp" style={{ padding: '9px 11px' }} /></label>
            <label className="fld"><span className="lbl">Default temp (K)</span><input value={st.temp} onChange={e => setSetting({ temp: e.target.value })} className="inp" style={{ padding: '9px 11px' }} /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 12 }}>
            <label className="fld"><span className="lbl">x-axis label</span><input value={st.xLabel} onChange={e => setSetting({ xLabel: e.target.value })} className="inp" style={{ padding: '9px 11px' }} /></label>
            <label className="fld"><span className="lbl">y-axis label</span><input value={st.yLabel} onChange={e => setSetting({ yLabel: e.target.value })} className="inp" style={{ padding: '9px 11px' }} /></label>
          </div>
          <div style={{ ...small, marginTop: 8 }}>Column numbers apply to files uploaded from now on.</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <TransformPicker label="PMF correction" value={nextT ?? pmfT} builtIns={['entropy', 'none']} onChange={t => setNextT(JSON.stringify(t) === JSON.stringify(pmfT) ? null : t)} />
            <span style={{ ...small, flex: '1 1 220px', lineHeight: 1.5 }}>{lib.TRANSFORMS[(nextT ?? pmfT).kind].note} · the matrix, wells, areas, graphs and exports all use it</span>
          </div>
          {nextT && (nextT.kind !== 'script' || lib.cleanTransform(nextT)) && (() => {
            const d = lib.tileDiff(store.seqs, cols, metric, skip, pmfT, nextT);
            // A script's answers may still be coming, or wait for trust: then the count would mislead.
            const probe = nextT.kind === 'script' ? store.seqs.flatMap(q => q.runs).filter(r => r.state !== 'missing').map(r => scriptResult({ script: nextT.script, fn: nextT.fn, role: 'transform', params: nextT.params, x: r.x, y: r.y })) : [];
            const failed = probe.find(r => r.state === 'done' && !r.ok);
            return (
              <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10, padding: '10px 12px', border: '1px solid var(--acc)', borderRadius: 10, fontSize: 12 }}>
                <span style={{ flex: '1 1 260px', lineHeight: 1.6 }}>
                  {probe.some(r => r.state === 'untrusted') ? 'Nothing runs until the script is trusted.'
                    : probe.some(r => r.state === 'pending') ? 'Computing ' + (nextT.kind === 'script' ? nextT.fn + '()' : '') + ' on ' + plural(probe.length, 'run') + '…'
                    : <>{nextT.kind === 'script' ? nextT.fn + '()' : lib.TRANSFORMS[nextT.kind].label} changes {plural(d.changed, 'tile')}{d.added ? ', adds ' + d.added : ''}{d.removed ? ', removes ' + d.removed : ''} of the {lib.METRIC_META[metric].label} matrix (every page).{failed && failed.state === 'done' && !failed.ok ? ' Some runs fail: ' + failed.error : ''}</>}
                </span>
                <button className="h-bright" onClick={() => { setSetting({ pmfTransform: nextT }); setNextT(null); }} style={{ padding: '6px 12px', border: 0, borderRadius: 8, background: 'var(--acc)', color: '#fff', fontWeight: 700, fontSize: 11 }}>apply</button>
                <button className="h-acc ob" onClick={() => setNextT(null)}>cancel</button>
              </div>
            );
          })()}
        </div>

        {/* Analyses */}
        <div ref={anaRef} style={{ padding: '22px 20px 0' }}>
          {sect('Analyses', (
            <button className="h-acc" title="Restore the built-in definitions; your own analyses stay" onClick={() => {
              const d = lib.DEFAULT_ANALYSES;
              setSetting({ analyses: d.map(x => ({ ...x })).concat(anaList.filter(c => !d.some(x => x.k === c.k))) });
            }} style={{ padding: '4px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', ...small, whiteSpace: 'nowrap' }}>reset built-ins</button>
          ), 10)}
          <div style={{ ...small, lineHeight: 1.6, marginBottom: 10 }}>Each analysis becomes a graph tab on its cell, attached to a run slot. On upload, a file’s type comes from its GROMACS tool, then the keywords as whole words in the xvg title, y label and legends, then in the file name; a file nothing matches becomes Data. {'{analysis}'} in the file-name pattern sets it per file. Several files can share one analysis as separate curves, each with its own legend.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.6fr) minmax(0, 1.3fr) minmax(0, 1.5fr) auto', gap: 10, alignItems: 'center', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surf)', fontSize: 11 }}>
              <span style={{ fontWeight: 700, fontSize: 12 }}>PMF</span>
              <span className="ellip" style={{ color: 'var(--mut)' }}>AWH profile · the matrix value</span>
              <span className="ellip" style={{ color: 'var(--mut)' }}>{'x col ' + st.xCol + ', y col ' + st.yCol + ' · ' + st.xLabel + ' → ' + st.yLabel}</span>
              <span style={{ color: 'var(--mut)', whiteSpace: 'nowrap' }}>set in Data &amp; axes</span>
            </div>
            {anaList.map(a => {
              const open = anaOpen === a.k, n = countA(a.k), cf = armed === 'ana:' + a.k;
              const set = (f: keyof AnalysisType) => (e: React.ChangeEvent<HTMLInputElement>) => updA(a.k, { [f]: e.target.value });
              const inp = (label: string, value: string | number, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, extra?: React.InputHTMLAttributes<HTMLInputElement>, bold?: boolean, title?: string) => (
                <label className="fld" style={{ gap: 4 }} title={title}><span className="lbl">{label}</span><input className="inp-s" value={value} onChange={onChange} {...extra} style={{ fontWeight: bold ? 700 : undefined }} /></label>
              );
              return (
                <div key={a.k} style={{ border: '1px solid ' + (open ? 'var(--acc)' : 'var(--line)'), borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.6fr) minmax(0, 1.3fr) minmax(0, 1.5fr) auto auto', gap: 10, alignItems: 'center', padding: '7px 8px 7px 12px', fontSize: 11 }}>
                    <span className="ellip" style={{ fontWeight: 700, fontSize: 12 }}>{a.label || '(unnamed)'}</span>
                    <span className="ellip" style={{ color: 'var(--mut)' }}>{a.name || '—'}</span>
                    <span className="ellip" style={{ color: 'var(--mut)' }}><Rich s={(a.xLabel || 'x') + ' → ' + (a.yLabel || 'y') + ' · y ' + (a.yCols || '2')} /></span>
                    <span style={{ color: 'var(--mut)', whiteSpace: 'nowrap' }}>{n ? plural(n, 'curve set') : ''}</span>
                    <button className="h-acc" onClick={() => setAnaOpen(open ? null : a.k)} style={{ padding: '5px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', fontSize: 11, color: open ? 'var(--acc)' : 'var(--mut)', whiteSpace: 'nowrap' }}>{open ? 'done' : 'edit'}</button>
                  </div>
                  {open && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '6px 12px 12px', borderTop: '1px solid var(--line)', background: 'var(--surf)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.7fr) minmax(0, 1.3fr)', gap: 10 }}>
                        {inp('Tab label', a.label, set('label'), undefined, true)}
                        {inp('What it is', a.name, set('name'), { placeholder: 'e.g. Na⁺ – carboxylate RDF' })}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                        {inp('x-axis label', a.xLabel, set('xLabel'))}
                        {inp('y-axis label', a.yLabel, set('yLabel'))}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.7fr) minmax(0, 1fr) minmax(0, 0.8fr)', gap: 10, alignItems: 'end' }}>
                        {inp('x column', String(a.xCol || 1), e => updA(a.k, { xCol: Math.max(1, parseInt(e.target.value, 10) || 1) }), { type: 'number', min: 1 })}
                        {inp('y columns', a.yCols == null ? '2' : a.yCols, set('yCols'), { placeholder: '2 · 2-5 · all' }, false, '2 · 2,4 · 2-5 · 3- · all')}
                        {inp('x multiplier', String(a.xScale == null ? 1 : a.xScale), set('xScale'), undefined, false, 'Multiplies x on upload — 0.001 turns ps into ns')}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span className="lbl">Drawn as</span>
                        <Seg<AnalysisType['style']> value={a.style || 'line'} onPick={v => updA(a.k, { style: v })} bg="var(--bg)" opts={STYLES} />
                        <span style={{ ...small, flex: '1 1 200px' }}>{a.style === 'auto' ? 'points when every x is a consecutive whole number, else a line' : a.style === 'points' || a.style === 'bars' ? 'never joined by a line' : ''}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <TransformPicker label="Transform" value={lib.transformOf(a, st)} builtIns={['none', 'entropy']} onChange={t => updA(a.k, { transform: t.kind === 'none' ? undefined : t })} />
                        <span style={{ ...small, flex: '1 1 200px' }}>applied before drawing · a signed coordinate (z) needs none</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span className="lbl">Smoothing</span>
                        <Seg<number> value={lib.smoothOf(a)} onPick={v => updA(a.k, { smooth: v })} bg="var(--bg)" opts={lib.SMOOTH_LEVELS} />
                        <span style={{ ...small, flex: '1 1 200px' }}>only how curves are drawn and exported · stored data stays as uploaded</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span className="lbl">Marker</span>
                        <Seg value={lib.markerOf(a)} onPick={v => updA(a.k, { marker: v })} bg="var(--bg)" opts={lib.MARKERS} />
                        {lib.markerOf(a) !== 'none' && (
                          <>
                            <span className="lbl">Label</span>
                            <Seg value={lib.markerLabelOf(a)} onPick={v => updA(a.k, { markerLabel: v })} bg="var(--bg)" opts={lib.MARKER_LABELS} />
                          </>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 10 }}>
                        {inp('Keywords · whole words, comma-separated', a.match || '', set('match'), { placeholder: 'e.g. rdf, radial' })}
                        {inp('GROMACS tools', a.tools || '', set('tools'), { placeholder: 'e.g. gmx energy' }, false, 'Output of these tools is this type, whatever its keywords')}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ flex: '1 1 240px', ...small, lineHeight: 1.5 }}>Column and multiplier changes apply to files uploaded from now on.{a.k === lib.DATA_TYPE.k ? ' Data is where unrecognised files go, so it stays.' : ''}</span>
                        {a.k !== lib.DATA_TYPE.k && <button className="h-acc" onClick={() => {
                          if (!confirm('ana:' + a.k)) return;
                          setSetting({ analyses: anaList.filter(q => q.k !== a.k) });
                          if (n) commit(lib.removeAnalysisData(store, a.k));
                          setAnaOpen(null);
                        }} style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', fontSize: 11, color: cf ? 'var(--acc)' : 'var(--mut)', whiteSpace: 'nowrap' }}>
                          {cf ? (n ? 'delete ' + plural(n, 'curve set') + '?' : 'click again') : 'remove analysis'}
                        </button>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button className="h-acc" onClick={addAna} style={{ marginTop: 10, padding: '7px 14px', border: '1px dashed var(--line)', borderRadius: 8, background: 'transparent', fontSize: 11, color: 'var(--ink)' }}>+ New analysis</button>
        </div>

        {/* Tags */}
        <div style={{ padding: '22px 20px 0' }}>
          {sect('Tags', undefined, 10)}
          <div style={{ ...small, lineHeight: 1.6, marginBottom: 10 }}>Tags mark how a run was made (hmr, fast water…). Pick them per run in the upload dialog and the run editor. Renaming a tag keeps it on every run.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tagList.map((t, i) => {
              const n = lib.tagUse(store, t.k), cf = armed === 'tag:' + t.k;
              return (
                <div key={t.k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto auto', gap: 8, alignItems: 'center' }}>
                  <input className="inp-s" aria-label={'Tag label (' + t.k + ')'} value={t.label} onChange={e => setTags(tagList.map(q => (q.k === t.k ? { ...q, label: e.target.value } : q)))} style={{ fontWeight: 700 }} />
                  <span style={{ ...small, whiteSpace: 'nowrap' }}>{n ? 'used by ' + plural(n, 'run') : 'unused'}</span>
                  <button className="h-acc" aria-label={'Move ' + t.label + ' up'} disabled={i === 0} onClick={() => moveTag(i, -1)} style={{ padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', fontSize: 11 }}>↑</button>
                  <button className="h-acc" aria-label={'Move ' + t.label + ' down'} disabled={i === tagList.length - 1} onClick={() => moveTag(i, 1)} style={{ padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', fontSize: 11 }}>↓</button>
                  <button className="h-acc" onClick={() => {
                    if (!confirm('tag:' + t.k)) return;
                    // One update for the list and the runs, so neither overwrites the other.
                    mutate(cur => lib.removeTagData({ ...cur, settings: { ...cur.settings, tags: tagList.filter(q => q.k !== t.k) } }, t.k));
                  }} style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', fontSize: 11, color: cf ? 'var(--accInk)' : 'var(--mut)', whiteSpace: 'nowrap' }}>
                    {cf ? (n ? 'remove from ' + plural(n, 'run') + '?' : 'click again') : 'remove'}
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, marginTop: 10 }}>
            <input className="inp-s" aria-label="New tag" value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTag(); }} placeholder="New tag, e.g. 4 fs step" />
            <button className="h-acc" onClick={addTag} disabled={!newTag.trim()} style={{ padding: '7px 14px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', color: 'var(--ink)', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap', opacity: newTag.trim() ? 1 : 0.5 }}>+ Add tag</button>
          </div>
        </div>

        <FunctionsPanel head={sect('Functions', undefined, 10)} />

        {/* Modify */}
        <div style={{ padding: '22px 20px 0' }}>
          {sect('Modify', undefined, 14)}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--arch)', fontWeight: 800, fontSize: 14 }}>Columns</span>
            <span style={{ fontSize: 10, color: 'var(--mut)' }}>{pad2(cols.length)} · drag ⠿ to reorder · top = leftmost</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cols.map(c => {
              const n = lib.runsInColumn(store, c.k), cf = armed === 'col:' + c.k;
              const dz = dropZone('col', c.k, '', cols.map(x => x.k), lib.moveColumn);
              return (
                <div key={c.k} {...dz} style={{ ...dz.style, display: 'grid', gridTemplateColumns: '22px 30px minmax(0, 0.7fr) minmax(0, 1.4fr) auto auto', gap: 8, alignItems: 'center' }}>
                  {grip('col', c.k, '', 'Drag to reorder · top = leftmost in the matrix')}
                  <button className="h-swatch" title="Change colour" onClick={() => commit(lib.cycleColour(store, c.k))} style={{ width: 30, height: 30, padding: 0, border: '1px solid var(--line)', borderRadius: 8, background: hue(c) }} />
                  <input className="inp-s" value={c.label} onChange={e => commit(lib.updateColumn(store, c.k, { label: e.target.value }))} style={{ fontWeight: 700 }} />
                  <input className="inp-s" value={c.name} placeholder="Full name" onChange={e => commit(lib.updateColumn(store, c.k, { name: e.target.value }))} />
                  <span style={{ ...small, whiteSpace: 'nowrap' }}>{plural(n, 'run')}</span>
                  <button className="h-acc" onClick={() => {
                    if (cols.length <= 1 || !confirm('col:' + c.k)) return;
                    commit(lib.removeColumn(store, c.k));
                    onColumnRemoved(c.k);
                  }} style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', fontSize: 11, color: cf ? 'var(--acc)' : 'var(--mut)', whiteSpace: 'nowrap' }}>
                    {cf ? (n ? 'delete ' + plural(n, 'run') + '?' : 'click again') : 'remove'}
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '22px 30px minmax(0, 0.7fr) minmax(0, 1.4fr) auto', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <span />
            <span style={{ width: 30, height: 30, border: '1px dashed var(--line)', borderRadius: 8 }} />
            <input className="inp-s" value={newCol.label} onChange={e => setNewCol({ ...newCol, label: e.target.value })} placeholder="Label" style={{ fontWeight: 700 }} />
            <input className="inp-s" value={newCol.name} onChange={e => setNewCol({ ...newCol, name: e.target.value })} placeholder="Full name, e.g. Chondroitin sulfate" />
            <button onClick={() => { if (!canAdd) return; commit(lib.addColumn(store, newCol.label, newCol.name).store); setNewCol({ label: '', name: '' }); }}
              style={{ padding: '7px 14px', border: 0, borderRadius: 8, background: canAdd ? 'var(--acc)' : 'var(--line)', color: canAdd ? '#fff' : 'var(--mut)', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>+ Add column</button>
          </div>
          <div style={{ ...small, marginTop: 8, lineHeight: 1.6 }}>A {'{column}'} value that matches no label adds its column on upload. Removing a column deletes its runs, notes and literature.</div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '24px 0 10px' }}>
            <span style={{ fontFamily: 'var(--arch)', fontWeight: 800, fontSize: 14 }}>Rows{page ? ' · ' + page.name : ''}</span>
            <span style={{ fontSize: 10, color: 'var(--mut)' }}>{pad2(rowSeqs.length)} · {page ? 'this page’s own order · ' : ''}drag ⠿ to reorder · groups and the rows inside them move separately</span>
          </div>
          {sorted && rowSeqs.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '9px 12px', marginBottom: 10, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surf)', ...small }}>
              <span style={{ flex: '1 1 240px', lineHeight: 1.5 }}>The matrix is ranked by binding strength right now, so it won’t show this order.</span>
              <button className="h-acc" onClick={useManual} style={{ padding: '6px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)', fontSize: 11, whiteSpace: 'nowrap' }}>use this order</button>
            </div>
          )}
          {!rowSeqs.length && <div style={{ padding: '12px 14px', border: '1px dashed var(--line)', borderRadius: 10, ...small }}>{page ? 'No rows on this page yet — choose them with ⋯ on the page tab, or upload while the page is open.' : 'No rows yet — upload xvg files to add some.'}</div>}
          <div style={{ maxHeight: 340, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
            {order.map(g => {
              const rs = rowSeqs.filter(s => (s.group || '').trim() === g);
              const groupIds = order.filter(Boolean);
              const gz = dropZone('group', g, '', groupIds, (st2, id, dir) => (page ? lib.movePageGroup(st2, page.id, id, dir) : lib.moveGroup(st2, id, dir)));
              const rowIds = rs.map(x => x.id);
              return (
                <div key={g || '∅'} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {labelled > 0 && (
                    <div {...(g ? gz : {})} style={{ ...(g ? gz.style : {}), display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr) auto', gap: 8, alignItems: 'center', marginTop: 8 }}>
                      {g ? grip('group', g, '', 'Drag to move this whole group') : <span title="Rows without a group always come last" style={{ width: 22 }} />}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink)', fontWeight: 700 }}>
                        <span className="ellip">{g || 'no group'}</span>
                        <span className="rule" />
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--mut)' }}>{pad2(rs.length)}</span>
                    </div>
                  )}
                  {rs.map(s => {
                    const n = s.runs.length, cf = armed === 'row:' + s.id;
                    const rz = dropZone('row', s.id, g, rowIds, (st2, id, dir) => (page ? lib.movePageRow(st2, page.id, id, dir) : lib.moveSeq(st2, id, dir)));
                    return (
                      <div key={s.id} {...rz} style={{ ...rz.style, display: 'grid', gridTemplateColumns: '22px minmax(0, 1.1fr) minmax(0, 1fr) auto auto', gap: 8, alignItems: 'center' }}>
                        {grip('row', s.id, g, 'Drag to reorder within ' + (g || 'rows without a group'))}
                        <span className="ellip" style={{ fontWeight: 700, fontSize: 12 }}>{s.name || '(unnamed)'}</span>
                        <span className="ellip" style={{ fontSize: 11, letterSpacing: '0.14em', color: 'var(--mut)' }}>{s.seq || '—'}</span>
                        <span style={{ ...small, whiteSpace: 'nowrap' }}>{plural(n, 'run')}</span>
                        {page ? (
                          <button className="h-acc" title="Take it off this page — it stays in the project" onClick={() => { commit(lib.removeFromPage(store, page.id, s.id)); onRowRemoved(s.id); }}
                            style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', fontSize: 11, color: 'var(--mut)', whiteSpace: 'nowrap' }}>off page</button>
                        ) : (
                          <button className="h-acc" onClick={() => { if (!confirm('row:' + s.id)) return; commit(lib.deleteSeq(store, s.id)); onRowRemoved(s.id); }}
                            style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', fontSize: 11, color: cf ? 'var(--acc)' : 'var(--mut)', whiteSpace: 'nowrap' }}>
                            {cf ? 'delete ' + plural(n, 'run') + '?' : 'remove'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div style={{ ...small, marginTop: 8, lineHeight: 1.6 }}>{page ? 'Taking a row off this page keeps it in the project and on every other page. Delete it for good from All sequences.' : 'Removing a row deletes every run, structure and reference in it, from every page.'}</div>
        </div>

        {/* Appearance */}
        <div style={{ padding: '22px 20px 0' }}>
          {sect('Appearance', undefined, 12, 'every project')}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="lbl">Theme</span>
            <Seg value={dark} onPick={v => setSetting({ dark: v })} opts={[{ v: false, label: 'light' }, { v: true, label: 'dark' }]} style={{ padding: 3 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <span className="lbl">Matrix tiles</span>
            <Seg value={!!st.tileSpread} onPick={v => setSetting({ tileSpread: v })}
              opts={[{ v: false, label: 'value only', title: 'Each tile shows its value; the spread stays in the tooltip' }, { v: true, label: 'with ± and n', title: 'Under the value: ± the standard deviation and the number of runs (a single run: its block error)' }]} />
          </div>
        </div>

        {/* Laser pointer */}
        <div style={{ padding: '22px 20px 22px' }}>
          {sect('Laser pointer', undefined, 12, 'every project')}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px 22px', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="lbl">Key</span>
              {keyButton('laserKey', 'k')}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="lbl">Mode</span>
              <Seg<'toggle' | 'hold'> value={st.laserMode} onPick={v => setSetting({ laserMode: v })} opts={[{ v: 'toggle', label: 'press to toggle', title: 'Press once to show, again to hide' }, { v: 'hold', label: 'hold to show', title: 'Shows only while the key is held down' }]} />
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px 22px', flexWrap: 'wrap', marginTop: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="lbl">Colour</span>
              <span style={{ display: 'flex', gap: 6 }}>
                {LASER_COLORS.map(c => (
                  <button key={c.v} title={c.label} onClick={() => setSetting({ laserColor: c.v })}
                    style={{ width: 22, height: 22, padding: 0, border: 0, borderRadius: 99, background: c.v, boxShadow: st.laserColor === c.v ? '0 0 0 2px var(--bg), 0 0 0 4px var(--ink)' : '0 0 8px ' + c.v + '66' }} />
                ))}
              </span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="lbl">Size</span>
              <Seg<'s' | 'm' | 'l'> value={st.laserSize} onPick={v => setSetting({ laserSize: v })} opts={[{ v: 's', label: 'S' }, { v: 'm', label: 'M' }, { v: 'l', label: 'L' }]} />
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="lbl">Trail</span>
              <Seg value={st.laserTrail} onPick={v => setSetting({ laserTrail: v })} opts={[{ v: true, label: 'on' }, { v: false, label: 'off' }]} />
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{ ...small, flex: '1 1 260px', lineHeight: 1.6, color: capturing === 'laserKey' && keyMsg ? 'var(--acc)' : 'var(--mut)' }}>
              {(capturing === 'laserKey' && keyMsg) || (capturing === 'laserKey' ? 'Press the key to use · Esc keeps ' + keyLabel(st.laserKey) + '.'
                : 'Press ' + keyLabel(st.laserKey) + ' anywhere outside a text field' + (st.laserMode === 'hold' ? ' and hold it' : '') + ' — the pointer draws over dialogs too and never blocks a click.')}
            </span>
            <button className="h-acc ob" onClick={onLaserTry} style={{ padding: '6px 12px' }}>try it</button>
          </div>
        </div>

        {/* Compare */}
        <div style={{ padding: '0 20px 22px' }}>
          {sect('Compare sequences', undefined, 12, 'every project')}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px 22px', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="lbl">Key</span>
              {keyButton('compareKey', 'c')}
            </span>
            <span style={{ ...small, flex: '1 1 260px', lineHeight: 1.6, color: capturing === 'compareKey' && keyMsg ? 'var(--acc)' : 'var(--mut)' }}>
              {(capturing === 'compareKey' && keyMsg) || (capturing === 'compareKey' ? 'Press the key to use · Esc keeps ' + keyLabel(st.compareKey) + '.'
                : 'Hold ' + keyLabel(st.compareKey) + ' and click cells or sequence names — on release they open together on one graph (run 1 of each), ready to export.')}
            </span>
          </div>
        </div>

        <ExportSettings sect={sect} keyRow={<>
          {keyButton('exportKey', 'e')}
          <span style={{ ...small, lineHeight: 1.6, color: capturing === 'exportKey' && keyMsg ? 'var(--acc)' : 'var(--mut)' }}>
            {(capturing === 'exportKey' && keyMsg) || (capturing === 'exportKey' ? 'Press the key to use · Esc keeps ' + keyLabel(st.exportKey) + '.' : 'In a graph or Compare: export it as shown. On the matrix: hold it, click cells, release to export them · with Shift, every analysis.')}
          </span>
        </>} />
      </div>
    </div>
  );
}
