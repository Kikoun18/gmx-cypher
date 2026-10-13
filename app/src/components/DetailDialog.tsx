import { useEffect, useMemo, useRef, useState } from 'react';
import * as lib from '../lib/seq';
import { fmt } from '../lib/pmf';
import { graphName, renderExport } from '../lib/export';
import { keyLabel } from '../lib/keys';
import { formatHints } from '../lib/exportPrefs';
import type { AnalysisType, Curve, Extra, Seq, Slot, Store, Table, Vis } from '../lib/types';
import { useApp, type Sel } from '../ctx';
import { buildGraph, DASH, DASH_NAMES, GRAPH_H as H, GRAPH_W as W, sharedDomain, type Series } from '../lib/graph';
import { nextShade, SHADE_STEPS } from '../lib/shade';
import { ColPicker, DownloadIcon, ExportMenu, Seg, SlidersIcon, plural, stop, useConfirm, type ExportFormat } from './ui';
import { Plot, Rich } from './Plot';
import { PinList } from './PinList';
import { snapX } from '../lib/interact';
import { StructurePanel } from './StructurePanel';
import { TagPicker } from './TagPicker';
import { newFileId, readLocal } from '../lib/storage/files';
import { LiteraturePanel } from './LiteraturePanel';
import type { GmxHeader } from '../lib/gmxHeader';

interface EditState {
  rowId: string; group: string; name: string; seq: string; desc: string; col: string; msg: string;
  order?: (Slot | null)[] | null; pick?: number | null; dropAt?: number | null; dropCol?: string | null;
}
interface RunEditState { id: string; time: string; temp: string; tags: string[]; sacch: string; run: Slot }
const { nextVis, VIS } = lib;
/** While mounted, the export key (R8b) runs `run`: the open graph or comparison, exported as shown. */
export function ExportKeyTarget({ run }: { run: () => void }) {
  const { setExportShown } = useApp();
  useEffect(() => { setExportShown(run); return () => setExportShown(null); });
  return null;
}

export function DetailDialog({ sel }: { sel: Sel }) {
  const { store, settings: st, cols, types, metric, raw, pmfT, scriptsV, laser, fitWell, skip, hue, colOf, dark, commit, mutate, setSel, openForm, setVis, order, setRaw, setFitWell, setSetting, page, loadAnalysis, notesReady, readOnly, findSame, projectName, exportPrefs, exportFiles, valueLines } = useApp();
  const exportKey = keyLabel(st.exportKey);
  const [tab, setTab] = useState('pmf');
  const [gset, setGset] = useState(false);
  const [focus, setFocus] = useState<{ sig: string; ks: string[] } | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [runEdit, setRunEdit] = useState<RunEditState | null>(null);
  /** The run or analysis whose type is being changed (R7). */
  const [retypeOf, setRetypeOf] = useState<{ kind: 'run' | 'analysis'; id: string } | null>(null);
  const [exDrop, setExDrop] = useState<string | null>(null);
  const [exDragId, setExDragId] = useState<string | null>(null);
  const exDrag = useRef<{ id: string; sacch: string; run: Slot } | null>(null);
  const [saved, setSaved] = useState(false);
  const savedT = useRef<number | undefined>(undefined);
  const [menu, setMenu] = useState(false);
  const [armed, confirm] = useConfirm();
  const curveFile = useRef<HTMLInputElement>(null);
  const curveTarget = useRef<Extra | null>(null);
  const [curveMsg, setCurveMsg] = useState('');
  const msgT = useRef<number | undefined>(undefined);
  /** A short status under the Curves heading, announced to screen readers. */
  const say = (m: string) => { setCurveMsg(m); clearTimeout(msgT.current); msgT.current = window.setTimeout(() => setCurveMsg(''), 3200); };

  useEffect(() => () => { clearTimeout(savedT.current); clearTimeout(msgT.current); }, []);

  // Analysis curves load on demand (decision D16): fetch the ones this view shows.
  const pendingEx = useMemo(() => {
    const r = store.seqs.find(s => s.id === sel.id);
    return r ? r.extras.filter(e => (sel.mode === 'row' || e.sacch === sel.s) && e.curves.some(c => c.state === 'pending')).map(e => e.id) : [];
  }, [store.seqs, sel]);
  useEffect(() => { for (const id of pendingEx) void loadAnalysis(id); }, [pendingEx, loadAnalysis]);

  // One y-axis across every PMF in the store, so wells compare between cells.
  // Recomputed when script answers arrive (scriptsV, R3c).
  const domain = useMemo(() => { void scriptsV; return sharedDomain(store.seqs, raw ? lib.NONE : pmfT); }, [store.seqs, raw, pmfT, scriptsV]);

  // Row view: the clicked stat tiles keep their colour, the rest go grey.
  const sig = JSON.stringify(sel);
  const fk = useMemo(() => (focus && sel.mode === 'row' && focus.sig === sig && focus.ks.length ? focus.ks : null), [focus, sel.mode, sig]);
  // The graph model is rebuilt only when what it draws changes, not on every render (a note typed, a hover; F110).
  const gStore = useMemo(() => ({ seqs: store.seqs, vis: store.vis, cols: store.cols, notes: { cell: {}, row: {} }, lit: {}, pages: [] }) as Store, [store.seqs, store.vis, store.cols]);
  const built = useMemo(() => { void scriptsV; return gStore.seqs.some(s => s.id === sel.id) ? buildGraph({ store: gStore, sel, cols, st, tab, raw, fitWell, dark, domain, focus: fk }) : null; },
    [gStore, sel, cols, st, tab, raw, fitWell, dark, domain, fk, scriptsV]);

  const row = store.seqs.find(s => s.id === sel.id);
  if (!row || !built) return null;

  const close = () => setSel(null);
  const stepRow = (dir: number) => {
    if (!order.length) return;
    const i = order.indexOf(sel.id);
    setEdit(null); setRunEdit(null);
    // A row that just left this page isn't in the order any more: step to the first or last.
    setSel({ ...sel, id: i < 0 ? order[dir > 0 ? 0 : order.length - 1] : order[(i + dir + order.length) % order.length] });
  };

  const meta = lib.METRIC_META[metric];
  const scope = sel.mode === 'row' ? 'row' : 'cell';
  const nkey = sel.mode === 'row' ? row.id : sel.s + '_' + row.id;
  const ed = edit && edit.rowId === row.id ? edit : null;
  const re = runEdit && row.runs.some(r => r.id === runEdit.id) ? runEdit : null;

  const m = built;
  const { sc, shown, scopeEx, tabKeys, curTab, T, tOf, isPmf, smooth, shownXY, slots, withData, curveIds, look, series, g, lines, markers, legend, sub } = m;
  const ck0 = sel.mode === 'row' ? cols[0].k : sel.s;
  const formFor = (ck: string, run: Slot | 'auto', ana: string, append = false) => openForm(lib.cellForm(row, ck, { run, ana, onClash: append ? 'append' : 'replace' }));
  const nextFree = (ck: string): Slot | 'auto' => { const used = row.runs.filter(r => r.sacch === ck).map(r => r.run); return lib.SLOTS.find(k => !used.includes(k)) || 'auto'; };
  const moveEx = (id: string, c: string, rn: Slot) => commit(lib.moveExtra(store, row.id, id, { sacch: c, run: rn }).store);
  const moveTargets: { sacch: string; run: Slot; label: string }[] = [];
  for (const c of (sel.mode === 'row' ? cols : [sc])) {
    const used = new Set(row.runs.filter(r => r.sacch === c.k).map(r => r.run).concat(row.extras.filter(e => e.sacch === c.k).map(e => e.run)));
    for (const k of lib.SLOTS) if (used.has(k)) moveTargets.push({ sacch: c.k, run: k, label: (sel.mode === 'row' ? c.label + ' · ' : '') + lib.runLabel(k) });
    const free = lib.SLOTS.find(k => !used.has(k));
    if (free) moveTargets.push({ sacch: c.k, run: free, label: (sel.mode === 'row' ? c.label + ' · ' : '') + lib.runLabel(free) + ' (empty)' });
  }

  const setAna = (patch: Partial<AnalysisType>) => {
    const list = lib.projectAnalyses(st);
    setSetting({ analyses: list.some(a => a.k === T.k) ? list.map(a => (a.k === T.k ? { ...a, ...patch } : a)) : list.concat({ ...T, ...patch }) });
  };

  const plainStat = { bg: 'var(--surf)', bd: 'var(--line)', valC: 'var(--ink)', op: 1, cur: 'default', lift: 'none', shadow: 'none', click: () => {} };
  const statSacch = (k: string, col: string) => {
    const on = !!fk && fk.includes(k), dim = !!fk && !on;
    return {
      bg: dim ? 'var(--surf)' : 'color-mix(in oklch, ' + col + (on ? ' 20%' : ' 9%') + ', var(--surf))',
      bd: dim ? 'var(--line)' : 'color-mix(in oklch, ' + col + (on ? ' 75%' : ' 32%') + ', var(--line))',
      valC: dim ? 'var(--mut)' : 'var(--ink)', op: dim ? 0.6 : 1, cur: 'pointer', lift: 'translateY(-1px)', shadow: '0 6px 16px rgba(0,0,0,0.10)',
      click: () => { const cur = fk || []; setFocus({ sig, ks: on ? cur.filter(x => x !== k) : cur.concat(k) }); },
    };
  };

  // --- stats -------------------------------------------------------------------
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  type Stat = { label: string; value: string; unit: string } & Partial<typeof plainStat>;
  let stats: Stat[] = [];
  if (isPmf && sel.mode === 'row') {
    stats = cols.map(c => {
      const v = lib.cellValue(row, c.k, metric, skip, pmfT);
      return { ...statSacch(c.k, hue(c)), label: c.label + ' ' + meta.label, value: v == null ? '—' : fmt(v), unit: v == null ? 'no run' : meta.unit };
    });
  } else if (isPmf) {
    const incl = withData.filter(q => !(st.hiddenOut && q.vis === 'off') && q.pmf!.state !== 'missing').map(q => q.pmf!);
    const sts = incl.map(r => lib.curveStats(r, pmfT)), nOut = shown.length - incl.length;
    const of = 'mean of ' + plural(sts.length, 'run') + (nOut ? ' · ' + nOut + ' left out' : '');
    stats = sts.length ? [
      { label: 'Cell area', value: fmt(mean(sts.map(x => x.area))), unit: 'kJ·nm/mol · ' + of },
      { label: 'Cell min', value: fmt(mean(sts.map(x => x.min))), unit: 'kJ/mol · ' + of },
      { label: 'Well at', value: sts[0].at.toFixed(2), unit: 'nm · ' + (pmfT.kind === 'entropy' ? 'corrected curve' : pmfT.kind === 'script' ? 'transformed curve' : 'curve as uploaded') },
      { label: 'Run spread', value: sts.length > 1 ? (Math.max(...sts.map(x => x.min)) - Math.min(...sts.map(x => x.min))).toFixed(2) : 'single run', unit: sts.length > 1 ? 'kJ/mol · range of ' + sts.length + ' run minima' : 'add runs to compare' },
    ] : shown.length ? [{ label: 'Cell', value: 'off', unit: 'every run is hidden and left out' }] : [];
  } else {
    const g3 = lib.fmtValue;
    const on = withData.filter(q => q.vis !== 'off' && (sel.mode === 'cell' || st.rowAll || withData.find(w => w.sacch === q.sacch && w.vis !== 'off') === q));
    let pk: { v: number; x: number } | null = null, sum = 0, n = 0, nc = 0, nr = 0, x0 = Infinity, x1 = -Infinity;
    for (const q of on) {
      const cs = lib.shownCurves(q.ex[curTab], q.vis).map(s => s.c);
      nc += cs.length; if (cs.length) nr++;
      for (const c of cs) { const t = shownXY(c); t.y.forEach((v, k) => {
        const xv = t.x[k];
        if (xv != null) { x0 = Math.min(x0, xv); x1 = Math.max(x1, xv); }
        if (v == null || !isFinite(v) || xv == null) return;
        sum += v; n++;
        if (!pk || v > pk.v) pk = { v, x: xv };
      }); }
    }
    const p = pk as { v: number; x: number } | null;
    // With a marker, the first tile reports the marked extreme across the shown curves, from the same marks the plot draws.
    const kind = lib.markerOf(T), marked = series.filter(s => s.mark).reduce<Series | null>((b, s) => (!b || (kind === 'max' ? s.mark!.y > b.mark!.y : s.mark!.y < b.mark!.y) ? s : b), null);
    stats = n && p ? [
      marked && kind !== 'none'
        ? { label: (kind === 'max' ? 'Maximum' : 'Minimum') + (smooth ? ' · smoothed' : ''), value: g3(marked.mark!.y), unit: m.yLabel + ' at x = ' + g3(marked.mark!.x) + ' · ' + marked.label }
        : { label: 'Peak', value: g3(p.v), unit: m.yLabel + ' at x = ' + g3(p.x) },
      { label: 'Mean', value: g3(sum / n), unit: m.yLabel + ' · every point shown' },
      { label: 'Curves', value: String(nc), unit: 'from ' + plural(nr, 'run') },
      { label: 'x range', value: g3(x0) + ' – ' + g3(x1), unit: m.xLabel },
    ] : [];
  }

  const title = sel.mode === 'row' ? row.name : row.name + ' × ' + sc.label;
  // As shown, in the export settings' theme (a dark or print export redraws the graph in its colours; R8a).
  const exportGraph = (f: ExportFormat) => exportFiles(async p => {
    const base = p.theme === 'light' ? m.data : buildGraph({ store: gStore, sel, cols, st, tab, raw, fitWell, dark, domain, focus: fk, theme: p.theme })!.data;
    const vs = p.legendValue ? valueLines(row.id, sel.mode === 'cell' ? sel.s : null) : [], d = vs.length ? { ...base, values: vs } : base;
    return [{ name: graphName(d, p, f, new Set(), { project: projectName, page: page?.name || '' }), blob: await renderExport({ graph: d }, f, p) }];
  });

  const setNote = (text: string) => {
    const notes = { cell: { ...store.notes.cell }, row: { ...store.notes.row } };
    if (text.trim()) notes[scope][nkey] = text; else delete notes[scope][nkey];
    commit({ ...store, notes });
    setSaved(true);
    clearTimeout(savedT.current);
    savedT.current = window.setTimeout(() => setSaved(false), 1400);
  };

  // --- extra curves: one file picked from the Curves list is appended to that analysis ---
  const addCurveFile = async (file: File) => {
    const e = curveTarget.current;
    curveTarget.current = null;
    if (!e) return;
    try {
      const { text, sha256 } = await readLocal(file);
      const same = await findSame(sha256);
      if (same && !window.confirm(same + '. Add ' + file.name + ' anyway?')) return;
      const t = lib.parseTable(text);
      const fileId = newFileId();
      const curves = lib.pickCurves(t, t.head, tOf(e.type), file.name, fileId);
      commit(lib.appendCurves(store, row.id, e.id, curves), new Map([[fileId, { blob: file, name: file.name, sha256 }]]));
      say('added ' + plural(curves.length, 'curve') + ' from ' + file.name);
    } catch (err) { say(file.name + ': ' + String((err as Error).message || err)); }
  };

  const editing = !!ed;
  const pill = { height: 34, border: '1px solid var(--line)', borderRadius: 99, background: 'transparent', fontSize: 11, whiteSpace: 'nowrap' as const };

  return (
    <div className="scrim" onClick={close} style={{ zIndex: 10 }}>
      <ExportKeyTarget run={() => void exportGraph(exportPrefs.format)} />
      <div className="card" onClick={stop} style={{ width: 'min(760px, 100%)' }}>
        <div className="card-head">
          <div style={{ minWidth: 0 }}>
            <div className="title22">{title}</div>
            <div style={{ fontSize: 12, letterSpacing: '0.16em', color: 'var(--mut)', marginTop: 4, wordBreak: 'break-all' }}>{row.seq}</div>
            <div style={{ fontSize: 11, color: 'var(--mut)', letterSpacing: '0.06em', marginTop: 4 }}>{sub}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flex: 'none' }}>
            <ExportMenu open={menu} setOpen={setMenu} width={270} head="Export graph · as shown" onPick={exportGraph}
              hints={formatHints(exportPrefs, 'every curve shown, one set each')}
              trigger={(open, toggle) => (
                <button className="h-acc" onClick={toggle} title={'Export this graph as xvg, png, svg or pdf (laid out by Settings → Export) · ' + exportKey + ' exports it as ' + exportPrefs.format} style={{ ...pill, display: 'flex', alignItems: 'center', gap: 6, padding: '0 13px', borderColor: open ? 'var(--acc)' : 'var(--line)', color: 'var(--ink)' }}>
                  <DownloadIcon size={13} />export
                </button>
              )} />
            <button className="h-acc" onClick={() => { setRunEdit(null); setEdit(editing ? null : { rowId: row.id, group: row.group || '', name: row.name, seq: row.seq, desc: row.desc || '', col: sel.s, msg: '' }); }}
              style={{ ...pill, padding: '0 14px', borderColor: editing ? 'var(--acc)' : 'var(--line)', color: editing ? 'var(--acc)' : 'var(--mut)' }}>{editing ? 'editing' : 'edit details'}</button>
            <button className="h-surf" onClick={() => setGset(!gset)} title="Graph settings"
              style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, padding: 0, border: '1px solid ' + (gset ? 'var(--acc)' : 'var(--line)'), borderRadius: 99, background: gset ? 'var(--surf)' : 'transparent', color: gset ? 'var(--acc)' : 'var(--ink)' }}>
              <SlidersIcon />
            </button>
            <button className="x-btn h-surf" onClick={close} style={{ marginLeft: 0 }}>×</button>
          </div>
        </div>

        {ed && <EditPanel row={row} sel={sel} ed={ed} setEdit={setEdit} onSaved={(rowId, s) => { setEdit(null); setRunEdit(null); setSel({ ...sel, id: rowId, s }); }} />}

        {!!row.desc && !editing && <p style={{ margin: 0, padding: '14px 20px 0', fontSize: 12, lineHeight: 1.7, color: 'var(--ink)', textWrap: 'pretty' }}>{row.desc}</p>}

        {store.pages.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 20px 0', flexWrap: 'wrap' }} title="Pages are views: ticking one adds this sequence to it, unticking takes it off — the data stays in the project">
            <span className="lbl" style={{ marginRight: 4 }}>On pages</span>
            {store.pages.map(p => {
              const on = p.rows.includes(row.id);
              return (
                <button key={p.id} className="h-accb" onClick={() => mutate(cur => lib.togglePageRow(cur, p.id, row.id))}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', border: '1px solid ' + (on ? 'var(--acc)' : 'var(--line)'), borderRadius: 99, background: on ? 'var(--surf)' : 'transparent', fontSize: 11, color: on ? 'var(--ink)' : 'var(--mut)', whiteSpace: 'nowrap' }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, border: '1px solid ' + (on ? 'var(--acc)' : 'var(--line)'), background: on ? 'var(--acc)' : 'transparent', fontSize: 8, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{on ? '✓' : ''}</span>
                  {p.name}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 20px 0', flexWrap: 'wrap' }}>
          {tabKeys.map(k => {
            const t = k === 'pmf' ? types[0] : tOf(k), on = k === curTab;
            const n = k === 'pmf' ? shown.length : scopeEx.filter(e => e.type === k).length;
            return (
              <button key={k} className="h-accb" onClick={() => setTab(k)} title={t.name || t.label}
                style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '6px 13px', border: '1px solid ' + (on ? 'var(--acc)' : 'var(--line)'), borderRadius: 99, background: on ? 'var(--acc)' : 'transparent', color: on ? '#fff' : 'var(--ink)', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {t.label}<span style={{ fontWeight: 400, opacity: 0.75 }}>{n}</span>
              </button>
            );
          })}
          <button className="h-acc" onClick={() => formFor(ck0, 'auto', isPmf ? 'auto' : curTab)} title="Upload an analysis xvg (RDF, RMSD, histograms…) for this cell"
            style={{ padding: '6px 13px', border: '1px dashed var(--line)', borderRadius: 99, background: 'transparent', fontSize: 11, color: 'var(--mut)', whiteSpace: 'nowrap' }}>+ analysis</button>
        </div>

        {gset && (
          <div style={{ margin: '14px 20px 0', padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surf)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 24px', animation: 'dlgIn 140ms ease-out' }}>
            {m.tSet.kind !== 'none' && (
              <GsRow label="Curve" title={'The transform is set in Settings → ' + (isPmf ? 'Data & axes' : 'Analyses') + ' and is what the matrix uses. "show raw" draws the curves as uploaded, on this graph only, until you switch back.'}
                value={raw} onPick={setRaw} opts={[{ v: false, label: lib.TRANSFORMS[m.tSet.kind].word }, { v: true, label: 'show raw' }]} />
            )}
            {isPmf && (
              <GsRow label="Y-axis" title="One y-axis across every cell, or autoscale to the curve on screen"
                value={fitWell} onPick={setFitWell} opts={[{ v: true, label: 'shared' }, { v: false, label: 'this cell' }]} />
            )}
            {sel.mode === 'row' && (
              <GsRow label="Row graph" title="One curve per column, or every run in each column (dash pattern = run number)"
                value={!!st.rowAll} onPick={v => setSetting({ rowAll: v })} opts={[{ v: false, label: 'first run' }, { v: true, label: 'every run' }]} />
            )}
            {!isPmf && (
              <GsRow label="Smoothing" title={'Gaussian smoothing of the drawn ' + T.label + ' curves (stored data is untouched; exports use what you see). Applies to every ' + T.label + ' graph in this project.'}
                value={smooth} onPick={v => setAna({ smooth: v })} opts={lib.SMOOTH_LEVELS} />
            )}
            {!isPmf && (
              <GsRow label="Marker" title={'Mark each shown ' + T.label + ' curve at its maximum or minimum (on the drawn, possibly smoothed curve). Applies to every ' + T.label + ' graph in this project.'}
                value={lib.markerOf(T)} onPick={v => setAna({ marker: v })} opts={lib.MARKERS} />
            )}
            {!isPmf && lib.markerOf(T) !== 'none' && (
              <GsRow label="Marker label" title="Write the marked point's x or y value next to each marker"
                value={lib.markerLabelOf(T)} onPick={v => setAna({ markerLabel: v })} opts={lib.MARKER_LABELS} />
            )}
            <GsRow label="Colours" title="Each column's own shades, or greys with dash patterns for print. Applies to every graph in this window and its exports; kept in this browser."
              value={!!st.bw} onPick={v => setSetting({ bw: v })} opts={[{ v: false, label: 'column shades' }, { v: true, label: 'black and white' }]} />
            <GsRow label="Hidden runs" title="Hidden runs are always left off the graph. Choose whether they still count in the cell value and the matrix."
              value={!!st.hiddenOut} onPick={v => setSetting({ hiddenOut: v })} opts={[{ v: false, label: 'counted in value' }, { v: true, label: 'left out' }]} />
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '14px 20px 0' }}>
          {stats.map((s0, i) => {
            const s = { ...plainStat, ...s0 };
            return (
              <button key={i} className="h-lift" onClick={s.click}
                style={{ flex: '1 1 150px', padding: '10px 14px', border: '1px solid ' + s.bd, borderRadius: 12, background: s.bg, opacity: s.op, cursor: s.cur, textAlign: 'left', ['--lift' as string]: s.lift, ['--shadow' as string]: s.shadow }}>
                <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mut)' }}>{s.label}</div>
                <div style={{ fontFamily: 'var(--arch)', fontWeight: 800, fontSize: 20, marginTop: 3, color: s.valC }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'var(--mut)' }}><Rich s={s.unit} /></div>
              </button>
            );
          })}
        </div>

        <div style={{ padding: '14px 20px 4px' }}>
          <Plot g={g} W={W} H={H} lines={lines} markers={markers} yLabel={m.yLabel} xLabel={m.xLabel} series={series}
            onMark={readOnly || laser ? undefined : (k, i) => mutate(st0 => lib.addMark(st0, row.id, series[k].src, series[k].rx[i]!))}
            refLines={m.refLines} onLine={readOnly || laser ? undefined : (axis, v) => mutate(st0 => lib.addLine(st0, row.id, m.lineKey, axis, v))} exportKey={{ key: exportKey, format: exportPrefs.format }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0 10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '6px 16px', flexWrap: 'wrap' }}>
              {legend.map((l, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--mut)' }}>
                  {l.style === 'points' ? <svg width="18" height="10" viewBox="0 0 18 10"><path d={lib.shapePath(l.shape || 0, 9, 5)} fill={l.color} /></svg>
                    : l.style === 'bars' ? <span style={{ width: 12, height: 8, background: l.color }} />
                    : l.dash === 'none'
                    ? <span style={{ width: 18, height: 3, background: l.color }} />
                    : <svg width="18" height="4" viewBox="0 0 18 4"><line x1="0" x2="18" y1="2" y2="2" stroke={l.color} strokeWidth="3" strokeDasharray={l.dash} /></svg>}
                  <span><Rich s={l.label} /></span>
                </span>
              ))}
            </div>
            <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mut)' }}>{m.note}</span>
            {m.dupDash.length > 0 && <span role="status" aria-live="polite" style={{ flexBasis: '100%', fontSize: 11, color: 'var(--accInk)' }}>{m.dupDash.join(' and ')} share a line style</span>}
          </div>
          <PinList marks={m.marks} lines={m.refLines} series={series} xLabel={m.xLabel} yLabel={m.yLabel} readOnly={readOnly} ops={{
            moveMark: (at, x) => { const mk = row.marks?.[at], q = series.find(z => z.src === mk?.curve); if (mk && q) mutate(st0 => lib.moveMark(st0, row.id, at, snapX(q.rx, q.ry, x))); },
            removeMark: at => mutate(st0 => lib.removeMark(st0, row.id, at)),
            addMark: (k, x) => mutate(st0 => lib.addMark(st0, row.id, series[k].src, snapX(series[k].rx, series[k].ry, x))),
            moveLine: (at, v) => mutate(st0 => lib.moveLine(st0, row.id, m.lineKey, at, v)),
            removeLine: at => mutate(st0 => lib.removeLine(st0, row.id, m.lineKey, at)),
            addLine: (axis, v) => mutate(st0 => lib.addLine(st0, row.id, m.lineKey, axis, v)),
          }} />
          {sel.mode === 'cell' && withData.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingBottom: 6 }}>
                {withData.map(q => (
                  <button key={q.key} className="h-accb" title={VIS[q.vis] + ' · click for ' + VIS[nextVis(q.vis)]}
                    onClick={e => (e.altKey || e.metaKey ? setVis(slots.map(o => [o.key, o === q ? 'on' : 'off'])) : setVis([[q.key, nextVis(q.vis)]]))}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 11px', border: '1px ' + (q.vis === 'off' ? 'dashed' : 'solid') + ' var(--line)', borderRadius: 99, background: q.vis === 'on' ? 'var(--surf)' : 'transparent', fontSize: 11, whiteSpace: 'nowrap' }}>
                    <Swatch {...look(curveIds(q)[0])} w={22} op={q.vis === 'on' ? 1 : q.vis === 'dim' ? 0.35 : 0.2} />
                    <span style={{ color: q.vis === 'off' ? 'var(--mut)' : 'var(--ink)', textDecoration: q.vis === 'off' ? 'line-through' : 'none' }}>{lib.runLabel(q.run)}</span>
                    <span style={{ color: 'var(--mut)', fontSize: 10 }}>{q.vis === 'on' ? '' : VIS[q.vis]}</span>
                  </button>
                ))}
                <span style={{ flex: '1 1 12px' }} />
                {[
                  { label: 'all', pick: () => setVis(slots.map(o => [o.key, 'on'])) },
                  { label: 'first only', pick: () => setVis(slots.map(o => [o.key, o === withData[0] ? 'on' : 'off'])) },
                  { label: 'dim the rest', pick: () => setVis(slots.map(o => [o.key, o === withData[0] ? 'on' : 'dim'])) },
                ].map(p => <button key={p.label} className="h-acc ob" onClick={p.pick}>{p.label}</button>)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--mut)', letterSpacing: '0.04em', paddingBottom: 10 }}>click a run: shown → dimmed → hidden · alt-click: only that run · applies to every tab of this cell · drag an analysis chip onto another run card to move it</div>
            </>
          )}
        </div>

        {!isPmf && withData.length > 0 && (
          <div style={{ padding: '4px 20px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className="lbl-wide">Curves · {T.label}</span>
              <span className="rule" />
              <span aria-live="polite" style={{ fontSize: 10, color: curveMsg ? 'var(--accInk)' : 'var(--mut)' }}>{curveMsg || 'legend text is yours to edit'}</span>
            </div>
            <input type="file" ref={curveFile} accept=".xvg,.dat,.txt,text/plain" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) addCurveFile(f); }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {withData.map(q => {
                const e = q.ex[curTab], rsc = colOf(q.sacch);
                return (
                  <div key={e.id} style={{ border: '1px solid var(--line)', borderRadius: 11, background: 'var(--surf)', padding: '8px 12px 10px', opacity: q.vis === 'off' ? 0.62 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: hue(rsc) }}>{rsc.label + ' · ' + lib.runLabel(q.run)}</span>
                      <span style={{ fontSize: 11, color: 'var(--mut)' }}>{plural(e.curves.length, 'curve')}</span>
                      <button className="h-acc ob" style={{ marginLeft: 'auto' }} title="Add another xvg to this analysis as more curves"
                        onClick={() => { curveTarget.current = e; curveFile.current?.click(); }}>+ curve from file</button>
                      <button className="h-acc ob" aria-expanded={retypeOf?.id === e.id} title="Make this analysis another type, or a PMF run"
                        onClick={() => setRetypeOf(retypeOf?.id === e.id ? null : { kind: 'analysis', id: e.id })}>change type…</button>
                    </div>
                    {retypeOf?.id === e.id && <RetypePanel row={row} target={retypeOf} onClose={to => { setRetypeOf(null); if (to) setTab(to); }} />}
                    {e.curves.map((c, j) => (
                      <CurveRow key={c.id} c={c} j={j} n={e.curves.length} {...look(c.id)}
                        armed={armed === 'curve:' + c.id} vis={c.vis || 'on'} shade={c.shade || 0}
                        onShade={step => { const v = nextShade(c.shade, step); commit(lib.updateCurve(store, row.id, e.id, c.id, { shade: v })); say((c.label || 'curve ' + (j + 1)) + ': ' + (v ? Math.abs(v) + (v > 0 ? ' lighter' : ' darker') : 'default shade')); }}
                        onVis={() => { const v = nextVis(c.vis || 'on'); commit(lib.updateCurve(store, row.id, e.id, c.id, { vis: v === 'on' ? undefined : v })); say((c.label || 'curve ' + (j + 1)) + ' ' + VIS[v]); }}
                        onDash={d => { commit(lib.updateCurve(store, row.id, e.id, c.id, { dash: d ?? undefined })); say((c.label || 'curve ' + (j + 1)) + ': ' + (d == null ? 'automatic line style' : DASH_NAMES[d])); }}
                        onLabel={label => commit(lib.updateCurve(store, row.id, e.id, c.id, { label, custom: true }))}
                        onMove={dir => commit(lib.moveCurve(store, row.id, e.id, c.id, dir))}
                        onRemove={() => { if (confirm('curve:' + c.id)) commit(lib.deleteCurve(store, row.id, e.id, c.id)); }} />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <StructurePanel row={row} />

        <div style={{ padding: '0 20px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="lbl-wide">Runs</span>
            <span className="rule" />
            <button className="h-accb" onClick={() => formFor(ck0, nextFree(ck0), 'pmf')} style={{ padding: '6px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', fontSize: 11 }}>+ add a run here</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {slots.map(q => {
              const rsc = colOf(q.sacch), r = q.pmf, rs = r && r.state !== 'missing' ? lib.curveStats(r, pmfT) : null;
              const isEd = !!re && !!r && re.id === r.id;
              const exs = Object.values(q.ex);
              const armedRun = !!r && armed === 'run:' + r.id;
              return (
                <div key={q.key}
                  onDragOver={e => { const d = exDrag.current; if (!d || (d.sacch === q.sacch && d.run === q.run)) return; e.preventDefault(); if (exDrop !== q.key) setExDrop(q.key); }}
                  onDragLeave={() => { if (exDrop === q.key) setExDrop(null); }}
                  onDrop={e => { e.preventDefault(); const d = exDrag.current; exDrag.current = null; setExDragId(null); setExDrop(null); if (d) moveEx(d.id, q.sacch, q.run); }}
                  style={{ border: '1px solid ' + (isEd ? 'var(--acc)' : 'var(--line)'), outline: exDrop === q.key ? '2px dashed var(--acc)' : 'none', outlineOffset: -1, borderRadius: 11, background: 'var(--surf)', opacity: q.vis === 'off' ? 0.62 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', flexWrap: 'wrap' }}>
                    {r && <DashPicker value={r.dash} {...look(q.key, r.dash)} label={rsc.label + ' ' + lib.runLabel(q.run)} onPick={d => commit(lib.updateRun(store, row.id, r.id, { dash: d }))} />}
                    <span style={{ fontWeight: 700, fontSize: 12, color: hue(rsc) }}>{rsc.label + ' · ' + lib.runLabel(q.run)}</span>
                    <span style={{ fontSize: 11, color: 'var(--mut)' }}>
                      {r && rs ? 'min ' + fmt(rs.min) + ' kJ/mol at ' + rs.at.toFixed(2) + ' nm · area ' + fmt(rs.area) + ' · ' + r.temp + ' K' + (r.time ? ' · t = ' + r.time : '') + (r.file ? ' · ' + r.file : '')
                        : r ? (r.file || 'original') + ' is missing from the vault folder · left out of the value' : 'no PMF curve for this run'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--mut)' }}>{r ? lib.tagLabel(r.tags, lib.getTags(st)) : ''}</span>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="h-acc ob" title="shown → dimmed → hidden, in every graph of this sequence" onClick={() => setVis([[q.key, nextVis(q.vis)]])}
                        style={{ color: q.vis === 'on' ? 'var(--mut)' : 'var(--acc)' }}>{VIS[q.vis] + (q.vis === 'off' && st.hiddenOut ? ' · left out' : '')}</button>
                      <button className="h-acc ob" title="Attach an analysis xvg to this run" onClick={() => formFor(q.sacch, q.run, isPmf ? 'auto' : curTab, !isPmf && !!q.ex[curTab])}>+ analysis</button>
                      {r && (
                        <>
                          <button className="h-acc ob" onClick={() => { setEdit(null); setRunEdit(isEd ? null : { id: r.id, time: r.time || '', temp: String(r.temp), tags: r.tags, sacch: r.sacch, run: r.run }); }}>{isEd ? 'editing' : 'edit'}</button>
                          <button className="h-acc ob" aria-expanded={retypeOf?.id === r.id} title="Make this PMF run an analysis of another type" onClick={() => setRetypeOf(retypeOf?.id === r.id ? null : { kind: 'run', id: r.id })}>change type…</button>
                          <button className="h-acc ob" onClick={() => {
                            if (!confirm('run:' + r.id)) return;
                            const next = lib.deleteRun(store, row.id, r.id);
                            commit(next);
                            if (!next.seqs.find(x => x.id === row.id)) setSel(null);
                          }}>{armedRun ? 'click again' : 'delete'}</button>
                        </>
                      )}
                    </span>
                  </div>
                  {r && <Provenance fileId={r.src?.fileId} />}
                  {exs.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 13px 10px' }}>
                      {exs.map(e => {
                        const t = tOf(e.type), cf = armed === 'ex:' + e.id;
                        const targets = moveTargets.filter(o => !(o.sacch === e.sacch && o.run === e.run)).map(o => {
                          const has = scopeEx.some(x => x.type === e.type && x.sacch === o.sacch && x.run === o.run);
                          return { k: o.sacch + '|' + o.run, label: '→ ' + o.label + (has ? ' · swap' : '') };
                        });
                        return (
                          <span key={e.id} draggable
                            onDragStart={ev => { exDrag.current = { id: e.id, sacch: e.sacch, run: e.run }; setExDragId(e.id); ev.dataTransfer.effectAllowed = 'move'; try { ev.dataTransfer.setData('text/plain', e.id); } catch { /* old browsers */ } }}
                            onDragEnd={() => { exDrag.current = null; setExDragId(null); setExDrop(null); }}
                            style={{ display: 'flex', alignItems: 'center', border: '1px solid ' + (e.type === curTab ? 'var(--acc)' : 'var(--line)'), borderRadius: 99, background: 'var(--bg)', cursor: 'grab', opacity: exDragId === e.id ? 0.45 : 1 }}>
                            <button className="h-acct" onClick={() => setTab(e.type)} title={(t.name || t.label) + (e.file ? ' · ' + e.file : '')}
                              style={{ padding: '4px 4px 4px 11px', border: 0, borderRadius: '99px 0 0 99px', background: 'transparent', fontSize: 11, cursor: 'grab' }}>
                              {t.label + (e.curves.length > 1 ? ' · ' + e.curves.length + ' curves' : '')}
                            </button>
                            <select value="" title="Move this analysis to another run" onChange={ev => { const v = ev.target.value; if (!v) return; const [c, rn] = v.split('|'); moveEx(e.id, c, rn as Slot); }}
                              style={{ width: 22, padding: '2px 0', border: 0, background: 'transparent', fontSize: 11, color: 'var(--mut)', appearance: 'none', WebkitAppearance: 'none', textAlign: 'center', cursor: 'pointer' }}>
                              <option value="">⇄</option>
                              {targets.map(o => <option key={o.k} value={o.k}>{o.label}</option>)}
                            </select>
                            <button className="h-acct" title="Delete this analysis" onClick={() => {
                              if (!confirm('ex:' + e.id)) return;
                              const next = lib.deleteExtra(store, row.id, e.id);
                              commit(next);
                              if (!next.seqs.find(x => x.id === row.id)) setSel(null);
                            }} style={{ padding: '4px 10px 4px 5px', border: 0, borderRadius: '0 99px 99px 0', background: 'transparent', fontSize: 11, color: cf ? 'var(--acc)' : 'var(--mut)' }}>{cf ? 'delete?' : '×'}</button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {isEd && re && <RunEditor row={row} re={re} setRunEdit={setRunEdit} />}
                  {r && retypeOf?.id === r.id && <RetypePanel row={row} target={retypeOf} onClose={to => { setRetypeOf(null); if (to) setTab(to); }} />}
                </div>
              );
            })}
          </div>
        </div>

        <LiteraturePanel row={row} sel={sel} />

        <div style={{ padding: '16px 20px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className="lbl-wide">{sel.mode === 'row' ? 'Note on this sequence' : 'Note on this cell'}</span>
            <span className="rule" />
            <span style={{ fontSize: 10, color: 'var(--mut)' }}>{saved ? 'saved' : ''}</span>
          </div>
          <textarea value={store.notes[scope][nkey] || ''} onChange={e => setNote(e.target.value)} disabled={!notesReady || readOnly} placeholder={notesReady ? 'Observation, caveat, what to run next…' : 'loading notes…'}
            style={{ width: '100%', minHeight: 84, resize: 'vertical', padding: 10, background: 'var(--field)', color: 'var(--ink)', border: '1px solid var(--line)', fontSize: 13, lineHeight: 1.6 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="h-surf" onClick={() => stepRow(-1)} style={{ padding: '8px 13px', border: '1px solid var(--line)', borderRadius: 9, background: 'transparent', fontSize: 11 }}>↑ prev sequence</button>
            <button className="h-surf" onClick={() => stepRow(1)} style={{ padding: '8px 13px', border: '1px solid var(--line)', borderRadius: 9, background: 'transparent', fontSize: 11 }}>↓ next sequence</button>
            {page && page.rows.includes(row.id) && (
              <button className="h-acc" title="Take this sequence off the page — it stays in the project and on other pages" onClick={() => {
                const rest = order.filter(id => id !== row.id), i = order.indexOf(row.id);
                const nid = rest.length ? rest[Math.min(Math.max(i, 0), rest.length - 1)] : null;
                commit(lib.removeFromPage(store, page.id, row.id));
                setEdit(null); setRunEdit(null);
                setSel(nid ? { ...sel, id: nid } : null);
              }} style={{ padding: '8px 13px', border: '1px solid var(--line)', borderRadius: 9, background: 'transparent', fontSize: 11, color: 'var(--mut)', whiteSpace: 'nowrap' }}>take off {page.name.length > 18 ? page.name.slice(0, 18) + '…' : page.name}</button>
            )}
            <button className="h-acc" title={store.pages.some(p => p.rows.includes(row.id)) ? 'Deletes it from the project and from every page' : 'Deletes every run, analysis, structure and reference of this sequence'}
              onClick={() => { if (!confirm('seq:' + row.id)) return; commit(lib.deleteSeq(store, row.id)); setSel(null); }}
              style={{ padding: '8px 13px', border: '1px solid var(--line)', borderRadius: 9, background: 'transparent', fontSize: 11, color: 'var(--mut)' }}>{armed === 'seq:' + row.id ? 'click again to delete sequence' : 'delete sequence'}</button>
            <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 10, color: 'var(--mut)', letterSpacing: '0.06em' }}>ESC to close · ←→ column · ↑↓ sequence</span>
          </div>
        </div>
      </div>
    </div>
  );

}

function GsRow<T>({ label, title, value, onPick, opts }: { label: string; title: string; value: T; onPick: (v: T) => void; opts: { v: T; label: string }[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} title={title}>
      <span className="lbl" style={{ whiteSpace: 'nowrap' }}>{label}</span>
      <div className="seg" style={{ background: 'var(--bg)' }}>
        {opts.map(o => { const on = o.v === value; return <button key={String(o.v)} onClick={() => onPick(o.v)} style={{ padding: '5px 12px', background: on ? 'var(--acc)' : 'transparent', color: on ? '#fff' : 'var(--ink)', fontSize: 11, letterSpacing: '0.02em' }}>{o.label}</button>; })}
      </div>
    </div>
  );
}

/** A short line in a curve's colour and dash, as drawn in the graph. */
function Swatch({ color, dash, w, op = 1 }: { color: string; dash: string; w: number; op?: number }) {
  return <svg width={w} height="6" viewBox={'0 0 ' + w + ' 6'} style={{ flex: 'none', opacity: op }}><line x1="1" x2={w - 1} y1="3" y2="3" stroke={color} strokeWidth="2.4" strokeDasharray={dash === 'none' ? undefined : dash} /></svg>;
}

/** Line style (R6): a swatch button opening "automatic" and the ten patterns; Esc closes the list, not the dialog. */
function DashPicker({ value, color, dash, label, op = 1, onPick }: { value?: number; color: string; dash: string; label: string; op?: number; onPick: (d: number | null) => void }) {
  const [open, setOpen] = useState(false);
  const name = value == null ? 'automatic' : DASH_NAMES[value];
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }} onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}>
      <button className="h-acc" aria-haspopup="menu" aria-expanded={open} aria-label={'Line style of ' + label + ': ' + name} title={'Line style: ' + name}
        onClick={() => setOpen(!open)} style={{ display: 'grid', placeItems: 'center', width: 32, height: 24, padding: 0, border: '1px solid ' + (open ? 'var(--acc)' : 'var(--line)'), borderRadius: 7, background: 'transparent' }}>
        <Swatch color={color} dash={dash} w={22} op={op} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div className="menu" role="menu" aria-label={'Line style of ' + label} style={{ left: 0, right: 'auto', width: 180 }}>
            {[null, ...DASH.map((_, i) => i)].map(d => (
              <button key={String(d)} role="menuitemradio" aria-checked={(value ?? null) === d} className="h-surf" onClick={() => { onPick(d); setOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', border: 0, borderRadius: 7, background: (value ?? null) === d ? 'var(--surf)' : 'transparent', fontSize: 11, textAlign: 'left' }}>
                {d == null ? <span style={{ width: 26, fontSize: 10, color: 'var(--mut)' }}>auto</span> : <Swatch color="var(--ink)" dash={DASH[d]} w={26} />}
                <span style={{ fontWeight: (value ?? null) === d ? 700 : 400 }}>{d == null ? 'automatic · by its place' : DASH_NAMES[d]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

function CurveRow({ c, j, n, color, dash, armed, vis, shade, onVis, onShade, onDash, onLabel, onMove, onRemove }: {
  c: Curve; j: number; n: number; color: string; dash: string; armed: boolean; vis: Vis; shade: number;
  onVis: () => void; onShade: (step: number) => void; onDash: (d: number | null) => void; onLabel: (s: string) => void; onMove: (dir: number) => void; onRemove: () => void;
}) {
  const arrow = { width: 24, height: 26, padding: 0, border: '1px solid var(--line)', borderRadius: 7, background: 'transparent', color: 'var(--mut)', fontSize: 11, lineHeight: 1 } as const;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '32px auto minmax(0, 1fr) minmax(0, 0.6fr) auto 24px 24px auto', gap: 8, alignItems: 'center', marginTop: 4 }}>
      <DashPicker value={c.dash} color={color} dash={dash} label={c.label || 'curve ' + (j + 1)} op={vis === 'on' ? 1 : vis === 'dim' ? 0.35 : 0.2} onPick={onDash} />
      {/* aria-disabled, not disabled: keyboard focus stays on the button at the end of the range. */}
      <span role="group" aria-label={'Shade of ' + (c.label || 'curve ' + (j + 1)) + (shade ? ': ' + Math.abs(shade) + ' ' + (shade > 0 ? 'lighter' : 'darker') : ': default')} style={{ display: 'flex', gap: 2 }}>
        <button className="h-acc" title="Darker" aria-label="Darker" aria-disabled={shade <= -SHADE_STEPS} onClick={() => shade > -SHADE_STEPS && onShade(-1)} style={{ ...arrow, width: 22, opacity: shade <= -SHADE_STEPS ? 0.3 : 1 }}>−</button>
        <button className="h-acc" title="Lighter" aria-label="Lighter" aria-disabled={shade >= SHADE_STEPS} onClick={() => shade < SHADE_STEPS && onShade(1)} style={{ ...arrow, width: 22, opacity: shade >= SHADE_STEPS ? 0.3 : 1 }}>+</button>
        <button className="h-acc" title={shade ? 'Reset to the default shade (now ' + (shade > 0 ? '+' : '') + shade + ')' : 'Default shade'} aria-label="Reset shade" aria-disabled={!shade} onClick={() => shade && onShade(0)} style={{ ...arrow, width: 22, opacity: shade ? 1 : 0.3 }}>↺</button>
      </span>
      <input className="inp-s" value={c.label} onChange={e => onLabel(e.target.value)} placeholder={'curve ' + (j + 1)} title="Legend shown in the graph and in exports" style={{ padding: '5px 9px', fontSize: 11 }} />
      <span className="ellip" style={{ fontSize: 10, color: 'var(--mut)' }} title={c.file}>{c.file || ''}</span>
      <button className="h-acc ob" title={'This curve is ' + VIS[vis] + ' · click for ' + VIS[nextVis(vis)]} aria-label={(c.label || 'curve ' + (j + 1)) + ': ' + VIS[vis]} onClick={onVis}
        style={{ padding: '4px 9px', minWidth: 64, color: vis === 'on' ? 'var(--mut)' : 'var(--accInk)' }}>{VIS[vis]}</button>
      <button className="h-acc" title="Move up" onClick={() => onMove(-1)} style={{ ...arrow, opacity: j === 0 ? 0.3 : 1 }}>↑</button>
      <button className="h-acc" title="Move down" onClick={() => onMove(1)} style={{ ...arrow, opacity: j === n - 1 ? 0.3 : 1 }}>↓</button>
      <button className="h-acc ob" onClick={onRemove} style={{ padding: '4px 9px', color: armed ? 'var(--acc)' : 'var(--mut)' }}>{armed ? 'remove?' : '×'}</button>
    </div>
  );
}

/**
 * Change type (R7): pick the type; the originals are read once and re-read with its columns; the preview lists every
 * consequence (retype) and the files the save moves and trashes (the planner's dry run) before anything is saved.
 */
function RetypePanel({ row, target, onClose }: { row: Seq; target: { kind: 'run' | 'analysis'; id: string }; onClose: (to?: string) => void }) {
  const { store, settings: st, types, metric, skip, commit, readFile, previewSave, readOnly } = useApp();
  const run = target.kind === 'run' ? row.runs.find(r => r.id === target.id) : undefined, ex = target.kind === 'analysis' ? row.extras.find(e => e.id === target.id) : undefined;
  const from = run ? 'pmf' : ex?.type || '', item = run || ex;
  const [to, setTo] = useState('');
  const [onClash, setOnClash] = useState<'replace' | 'append'>('replace');
  const [temp, setTemp] = useState(String(st.temp || lib.DEFAULT_TEMP));
  const [tables, setTables] = useState<Map<string, Table | null> | null>(null);
  const [dry, setDry] = useState<{ of: object; moves: { from: string; to: string }[]; trashed: string[] } | null>(null);
  const fileIds = useMemo(() => [...new Set(run ? (run.src ? [run.src.fileId] : []) : (ex?.curves || []).flatMap(c => (c.src ? [c.src.fileId] : [])))], [run, ex]);
  useEffect(() => {
    let live = true;
    (async () => {
      const m = new Map<string, Table | null>();
      for (const id of fileIds) { try { m.set(id, lib.parseTable(await (await readFile(id)).text())); } catch { m.set(id, null); } }
      if (live) setTables(m);
    })();
    return () => { live = false; };
  }, [fileIds, readFile]);
  const res = useMemo(() => (to && tables ? lib.retype(store, st, row.id, target, to, tables, { onClash, temp: Number(temp) || lib.DEFAULT_TEMP, metric, skip }) : null), [to, tables, store, st, row.id, target, onClash, temp, metric, skip]);
  useEffect(() => {
    let live = true;
    if (res && !res.preview.problem) previewSave(res.store).then(p => { if (live) setDry({ of: res, ...p }); }).catch(() => {});
    return () => { live = false; };
  }, [res, previewSave]);
  // The planner's dry run for the choice on screen (an older one is never shown).
  const plan = dry && dry.of === res ? dry : null;
  if (!item) return null;
  const slotHas = (k: string) => (k === 'pmf' ? row.runs.some(r => r !== run && r.sacch === item.sacch && r.run === item.run) : row.extras.some(e => e !== ex && e.type === k && e.sacch === item.sacch && e.run === item.run));
  const p = res?.preview, rel = (path: string) => path.split('/').slice(1).join('/');
  const lab = { fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--mut)' };
  const list = (title: string, lines: string[]) => lines.length > 0 && (
    <div><div style={lab}>{title}</div><ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 11, lineHeight: 1.7 }}>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
  );
  return (
    <div role="group" aria-label={'Change the type of ' + (run ? 'PMF run' : (types.find(t => t.k === from)?.label || from)) + ' · ' + lib.runLabel(item.run)}
      style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '8px 0 4px', padding: '12px 13px', border: '1px solid var(--acc)', borderRadius: 10, background: 'var(--bg)' }}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label className="fld" style={{ gap: 4 }}><span style={lab}>New type</span>
          <select className="inp" value={to} onChange={e => setTo(e.target.value)} autoFocus style={{ padding: '6px 9px' }}>
            <option value="" disabled>choose…</option>
            {types.filter(t => t.k !== from).map(t => <option key={t.k} value={t.k}>{t.label}{t.k === 'pmf' ? ' run (the matrix value)' : ''}</option>)}
          </select>
        </label>
        {to === 'pmf' && <label className="fld" style={{ gap: 4 }}><span style={lab}>Temperature (K)</span><input className="inp" value={temp} onChange={e => setTemp(e.target.value)} style={{ width: 100, padding: '6px 9px' }} /></label>}
        {to && to !== 'pmf' && slotHas(to) && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={lab}>Slot has one</span>
            <Seg<'replace' | 'append'> value={onClash} onPick={setOnClash} bg="var(--surf)" opts={[{ v: 'replace', label: 'replace it' }, { v: 'append', label: 'add as curves' }]} />
          </span>
        )}
      </div>
      <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!to ? <span style={{ fontSize: 11, color: 'var(--mut)' }}>The originals stay as they are; nothing is uploaded again. Pick a type to see every consequence before saving.</span>
          : !tables ? <span style={{ fontSize: 11, color: 'var(--mut)' }}>reading the originals…</span>
          : p?.problem ? <span style={{ fontSize: 12, color: 'var(--accInk)' }}>{p.problem}</span>
          : p && (
            <>
              {list('What changes', p.changes)}
              {list('Curves, re-read with its columns', p.curves.map(c => c.label + ' · ' + plural(c.points, 'point')))}
              {list('Originals missing — curves kept as they are', p.kept)}
              {list('Matrix values', p.values.map(v => v.label + ': ' + (v.before == null ? 'none' : fmt(v.before)) + ' → ' + (v.after == null ? 'none' : fmt(v.after))))}
              {list('No longer applies', p.lost)}
              {plan ? <>{list('Files moved', plan.moves.map(m => rel(m.from) + ' → ' + rel(m.to)))}{list('To the trash', plan.trashed)}</> : <span style={{ fontSize: 11, color: 'var(--mut)' }}>working out the files…</span>}
            </>
          )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="h-bright" disabled={readOnly || !res || !!p?.problem || !plan} onClick={() => { if (res) { commit(res.store); onClose(to); } }}
          style={{ padding: '7px 13px', border: 0, borderRadius: 8, background: 'var(--acc)', color: '#fff', fontWeight: 700, fontSize: 11, opacity: !res || p?.problem || !plan ? 0.5 : 1 }}>change type</button>
        <button className="h-acc ob" onClick={() => onClose()}>cancel</button>
      </div>
    </div>
  );
}

function RunEditor({ row, re, setRunEdit }: { row: Seq; re: RunEditState; setRunEdit: (r: RunEditState | null) => void }) {
  const { store, allCols: cols, hue, dark, colOf, commit } = useApp();
  const setR = (patch: Partial<RunEditState>) => setRunEdit({ ...re, ...patch });
  const clash = row.runs.find(r => r.id !== re.id && r.sacch === re.sacch && r.run === re.run);
  const lab = { fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--mut)' };
  const inp = { padding: '8px 10px', background: 'var(--field)', border: '1px solid var(--line)', fontSize: 12 };
  return (
    <div style={{ padding: '2px 13px 13px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        <label className="fld" style={{ gap: 4 }}><span style={lab}>Sim. time</span><input value={re.time} onChange={e => setR({ time: e.target.value })} style={inp} /></label>
        <label className="fld" style={{ gap: 4 }}><span style={lab}>Temp (K)</span><input value={re.temp} onChange={e => setR({ temp: e.target.value })} style={inp} /></label>
        <label className="fld" style={{ gap: 4 }}><span style={lab}>Run</span>
          <select value={re.run} onChange={e => setR({ run: e.target.value as Slot })} style={{ ...inp, borderRadius: 10 }}>
            {lib.SLOTS.map(k => <option key={k} value={k}>{lib.runLabel(k)}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
        <span style={lab}>Column</span>
        <ColPicker cols={cols} value={re.sacch} onPick={k => setR({ sacch: k })} hue={hue} dark={dark} size="s" />
      </div>
      <div style={{ marginTop: 10 }}>
        <TagPicker small onBg="var(--bg)" value={re.tags} onChange={tags => setR({ tags })} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11, flexWrap: 'wrap' }}>
        <span style={{ flex: '1 1 180px', fontSize: 11, color: 'var(--mut)', lineHeight: 1.5 }}>
          {clash ? 'Moving here replaces the existing ' + colOf(clash.sacch).label + ' ' + lib.runLabel(clash.run) + '.' : 'Temperature re-runs the correction for this curve.'}
        </span>
        <button className="h-bg" onClick={() => setRunEdit(null)} style={{ padding: '8px 13px', border: '1px solid var(--line)', borderRadius: 9, background: 'transparent', fontSize: 11 }}>Cancel</button>
        <button onClick={() => { commit(lib.updateRun(store, row.id, re.id, re)); setRunEdit(null); }} style={{ padding: '8px 16px', border: 0, borderRadius: 9, background: 'var(--acc)', color: '#fff', fontWeight: 700, fontSize: 11 }}>Save run</button>
      </div>
    </div>
  );
}

function EditPanel({ row, sel, ed, setEdit, onSaved }: { row: Seq; sel: Sel; ed: EditState; setEdit: (e: EditState | null) => void; onSaved: (rowId: string, s: string) => void }) {
  const { store, allCols: cols, hue, colOf, dark, commit, types, settings: st } = useApp();
  const drag = useRef<number | null>(null);
  const vis = store.vis;
  const sc = colOf(sel.s);
  const nm = ed.name.trim(), sq = ed.seq.trim().toUpperCase();
  const twin = store.seqs.find(s => s.id !== row.id && lib.seqKey(s.name, s.seq, s.group) === lib.seqKey(nm, sq, ed.group));
  const ok = !!nm, isCell = sel.mode === 'cell', tcol = isCell ? (ed.col || sel.s) : sel.s, moving = isCell && tcol !== sel.s;
  const slotsIn = (k: string) => new Set<Slot>(row.runs.filter(r => r.sacch === k).map(r => r.run).concat(row.extras.filter(e => e.sacch === k).map(e => e.run)));
  const src0 = slotsIn(sel.s);
  const order = ed.order || lib.SLOTS.map(k => (src0.has(k) ? k : null));
  const map: Record<string, Slot> = {};
  order.forEach((o, i) => { if (o) map[o] = lib.SLOTS[i]; });
  const src = new Set(Object.values(map)), dst = moving ? slotsIn(tcol) : new Set<Slot>();
  const nShift = [...src].filter(k => dst.has(k)).length;
  const nRe = Object.keys(map).filter(k => map[k] !== k).length;
  const setE = (patch: Partial<EditState>) => setEdit({ ...ed, msg: '', ...patch });
  const swap = (i: number | null, j: number) => { if (i === j || i == null) return; const o = order.slice(); [o[i], o[j]] = [o[j], o[i]]; setE({ order: o, pick: null, dropAt: null }); drag.current = null; };
  const pick = ed.pick ?? null;
  const tLabel = (cols.find(c => c.k === tcol) || { label: tcol }).label;

  // The save, computed in advance: the preview names exactly what the save will drop.
  const edit: lib.RowEdit = { ...ed, col: isCell ? sel.s : undefined, to: isCell ? tcol : undefined, order: isCell ? ed.order : null };
  const res = ok ? lib.editRow(store, row.id, edit) : null;
  const dropLabel = (d: lib.Dropped) => (d.kind === 'run' ? '' : (types.find(t => t.k === d.type)?.label || d.type) + ' on ') + colOf(d.col).label + ' ' + lib.runLabel(d.run);
  const nDropRuns = res ? res.dropped.filter(d => d.kind === 'run').length : 0, nDropAna = res ? res.dropped.length - nDropRuns : 0;
  const mergeMsg = !twin || !res ? '' : (res.dropped.length
    ? 'Merging keeps ' + twin.name + '’s runs where both have one. From ' + row.name + ', ' + [nDropRuns ? plural(nDropRuns, 'run') : '', nDropAna ? plural(nDropAna, 'analysis', 'analyses') : ''].filter(Boolean).join(' and ') + (res.dropped.length === 1 ? ' goes' : ' go') + ' to the trash: ' + res.dropped.map(dropLabel).join(', ') + '.'
    : 'Merging with ' + twin.name + ' drops nothing.') + ' Notes, structures and references are combined.';
  const msg = ed.msg || (!ok ? 'A name is required.' : res && res.error ? res.error
    : [nRe && !moving ? 'Renumbers ' + plural(nRe, 'run') + ' · analyses and visibility follow.'
      : moving ? (nRe ? 'Renumbers ' + nRe + ', then moves ' : 'Moves ') + plural(src.size, 'run slot') + ' from ' + sc.label + ' to ' + tLabel + (nShift ? ' · ' + nShift + ' already taken there, shifted to the next free run' : '') + '.'
      : '', mergeMsg].filter(Boolean).join(' ') || 'Renaming keeps every run attached to this row.');

  const save = () => {
    if (!res) { setE({ msg: 'A name is required.' }); return; }
    if (res.error) { setE({ msg: res.error }); return; }
    commit(res.store);
    onSaved(res.rowId, res.col || sel.s);
  };

  const lab = { fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--mut)' };
  const inp = { padding: '9px 11px', background: 'var(--field)', border: '1px solid var(--line)' };
  return (
    <div style={{ margin: '14px 20px 0', padding: '14px 16px 16px', border: '1px solid var(--acc)', borderRadius: 14, background: 'var(--surf)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        <label className="fld"><span style={lab}>Group</span><input value={ed.group} onChange={e => setE({ group: e.target.value })} list="pmf-groups-edit" style={inp} /></label>
        <label className="fld"><span style={lab}>Sequence name</span><input value={ed.name} onChange={e => setE({ name: e.target.value })} style={inp} /></label>
        <label className="fld"><span style={lab}>Sequence</span><input value={ed.seq} onChange={e => setE({ seq: e.target.value.toUpperCase() })} style={{ ...inp, letterSpacing: '0.16em', textTransform: 'uppercase' }} /></label>
      </div>
      <datalist id="pmf-groups-edit">{[...new Set(store.seqs.map(s => s.group).filter(Boolean))].map(gn => <option key={gn} value={gn} />)}</datalist>
      {isCell && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 12 }}>
            <span style={lab}>Column · moves every run and analysis in this cell</span>
            <ColPicker cols={cols} value={tcol} onPick={k => setE({ col: k })} hue={hue} dark={dark} size="s"
              extra={c => {
                const n = slotsIn(c.k).size, cc = cols.find(x => x.k === c.k)!;
                return {
                  count: n ? String(n) : '', fg: '#fff', title: cc.name + (n ? ' · ' + plural(n, 'run slot') + ' in use' : ' · empty'),
                  ring: ed.dropCol === c.k ? '2px dashed var(--acc)' : 'none',
                  onDragOver: e => { if (drag.current == null) return; e.preventDefault(); if (ed.dropCol !== c.k) setE({ dropCol: c.k }); },
                  onDrop: e => { e.preventDefault(); drag.current = null; setE({ col: c.k, dropCol: null }); },
                };
              }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={lab}>Run numbers</span>
              <span style={{ fontSize: 10, color: 'var(--mut)', flex: '1 1 0', minWidth: 160, lineHeight: 1.5 }}>
                drag a run onto another number to swap · or click one, then click its new place{moving ? ' · drop onto a column to move the cell' : ''}
              </span>
              {nRe > 0 && <button className="h-acc" onClick={() => setE({ order: null, pick: null })} style={{ flex: 'none', whiteSpace: 'nowrap', padding: '3px 9px', border: '1px solid var(--line)', borderRadius: 7, background: 'transparent', fontSize: 10, color: 'var(--mut)' }}>undo order</button>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
              {lib.SLOTS.map((k, i) => {
                const o = order[i], r = o ? row.runs.find(x => x.sacch === sel.s && x.run === o) : null;
                const exN = o ? row.extras.filter(e => e.sacch === sel.s && e.run === o).length : 0;
                const moved = !!o && o !== k, isPick = pick === i, hot = ed.dropAt === i;
                const vv = o ? vis[lib.slotKey(row.id, sel.s, o)] : null;
                return (
                  <div key={k}
                    onClick={() => { if (pick == null) { if (o) setE({ pick: i }); } else if (pick === i) setE({ pick: null }); else swap(pick, i); }}
                    onDragOver={e => { if (drag.current == null) return; e.preventDefault(); if (ed.dropAt !== i) setE({ dropAt: i }); }}
                    onDragLeave={() => { if (ed.dropAt === i) setE({ dropAt: null }); }}
                    onDrop={e => { e.preventDefault(); swap(drag.current, i); }}
                    style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, padding: 6, border: '1px ' + (o ? 'solid' : 'dashed') + ' ' + (hot || isPick ? 'var(--acc)' : 'var(--line)'), borderRadius: 9, background: hot ? 'var(--surf)' : 'transparent', cursor: pick != null || o ? 'pointer' : 'default' }}>
                    <span style={{ fontSize: 10, letterSpacing: '0.06em', color: 'var(--mut)' }}>{lib.runLabel(k)}</span>
                    {o && (
                      <div draggable
                        onDragStart={e => { drag.current = i; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* old browsers */ } }}
                        onDragEnd={() => { drag.current = null; if (ed.dropAt != null || ed.dropCol) setE({ dropAt: null, dropCol: null }); }}
                        title={lib.runLabel(o) + (r && r.file ? ' · ' + r.file : '') + (exN ? ' · ' + plural(exN, 'analysis', 'analyses') : '')}
                        style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, padding: '5px 7px', borderRadius: 6, background: isPick ? 'var(--acc)' : 'var(--surf)', color: isPick ? '#fff' : moved ? hue(sc) : 'var(--ink)', boxShadow: 'inset 0 0 0 1px ' + (isPick ? 'var(--acc)' : moved ? hue(sc) : 'transparent'), cursor: 'grab', opacity: vv === 'off' ? 0.5 : 1 }}>
                        <span className="ellip" style={{ fontSize: 11, fontWeight: 700 }}>{lib.runLabel(o).replace('run ', '#') + (moved ? ' → ' + (i + 1) : '')}</span>
                        <span className="ellip" style={{ fontSize: 9, opacity: 0.85 }}>{(r ? (r.time ? 't ' + r.time : lib.tagLabel(r.tags, lib.getTags(st)) || 'PMF') : 'no PMF') + (exN ? ' · +' + exN : '')}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
      <label className="fld" style={{ marginTop: 12 }}>
        <span style={lab}>Description</span>
        <textarea value={ed.desc} onChange={e => setE({ desc: e.target.value })} placeholder="What this sequence is, why it was run…"
          style={{ width: '100%', minHeight: 62, resize: 'vertical', padding: '9px 11px', background: 'var(--field)', border: '1px solid var(--line)', fontSize: 13, lineHeight: 1.6 }} />
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        <span aria-live="polite" style={{ flex: '1 1 200px', fontSize: 11, color: 'var(--mut)', lineHeight: 1.5 }}>{msg}</span>
        <button className="h-bg" onClick={() => setEdit(null)} style={{ padding: '9px 14px', border: '1px solid var(--line)', borderRadius: 10, background: 'transparent', fontSize: 12 }}>Cancel</button>
        <button onClick={save} style={{ padding: '9px 18px', border: 0, borderRadius: 10, background: ok ? 'var(--acc)' : 'var(--line)', color: ok ? '#fff' : 'var(--mut)', fontWeight: 700, fontSize: 12, letterSpacing: '0.03em' }}>
          {twin ? 'Merge rows' : moving ? 'Move to ' + tLabel : nRe ? 'Save order' : 'Save details'}
        </button>
      </div>
    </div>
  );
}

/** Where a run's original came from, as recorded in its GROMACS header (R1e). Missing fields say so. */
function Provenance({ fileId }: { fileId?: string }) {
  const { provenance } = useApp();
  const [h, setH] = useState<GmxHeader | null | 'unreadable' | undefined>(fileId ? undefined : null);
  const [copied, setCopied] = useState('');
  useEffect(() => {
    if (!fileId) return;
    let live = true;
    provenance(fileId).then(x => { if (live) setH(x); }, () => { if (live) setH('unreadable'); });
    return () => { live = false; };
  }, [fileId, provenance]);
  const pad = { padding: '0 13px 9px', fontSize: 11, color: 'var(--mut)' };
  if (h === undefined) return null;
  if (!h) return <div style={pad}>no provenance in file</div>;
  if (h === 'unreadable') return <div style={pad}>provenance unknown · the original can’t be read</div>;
  const copy = (label: string, text: string) => navigator.clipboard.writeText(text).then(() => setCopied(label + ' copied'), () => setCopied('could not copy'));
  const rows: [string, string | null][] = [['Command', h.command], ['Working dir', h.workdir], ['Executable', h.executable]];
  return (
    <details style={pad}>
      <summary style={{ cursor: 'pointer' }}>{['GROMACS ' + (h.version || '(version not recorded)'), h.tool || 'tool not recorded', h.created ? 'created ' + h.created : 'creation date not recorded'].join(' · ')}</summary>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: '6px 10px', alignItems: 'start', margin: '8px 0 0' }}>
        {rows.map(([label, v]) => (
          <div key={label} style={{ display: 'contents' }}>
            <dt>{label}</dt>
            <dd style={{ margin: 0, color: 'var(--ink)', overflowWrap: 'anywhere', fontFamily: 'var(--mono, monospace)' }}>{v || 'not recorded'}</dd>
            {v ? <button className="h-acc ob" onClick={() => void copy(label, v)} aria-label={'Copy ' + label.toLowerCase()}>copy</button> : <span />}
          </div>
        ))}
      </dl>
      <span aria-live="polite" style={{ display: 'block', marginTop: 4 }}>{copied}</span>
    </details>
  );
}
