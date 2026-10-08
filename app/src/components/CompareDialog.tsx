import { useState } from 'react';
import * as lib from '../lib/seq';
import { fmt } from '../lib/pmf';
import { download, fileBase, graphScene, graphXvg, toPDF, toPNG, type GraphData } from '../lib/export';
import type { Column, Run } from '../lib/types';
import { DASH, pickKey, useApp, type ComparePick } from '../ctx';
import { ExportMenu, DownloadIcon, Seg, plural, stop } from './ui';
import { Plot, type PlotLine, type PlotMarker } from './Plot';
import { keyLabel } from './Laser';

const W = 720, H = 450;

interface Line { key: string; pick: ComparePick; label: string; col: Column; run: Run; color: string; dash: string; y: number[] }

/**
 * Picked sequences on one graph: run 1 of each (or every run), corrected or raw,
 * with each curve's well and area, exportable like any other graph.
 */
export function CompareDialog({ picks, setPicks, onClose }: { picks: ComparePick[]; setPicks: (p: ComparePick[]) => void; onClose: () => void }) {
  const { store, allCols, colOf, corrected, setCorrected, dark, settings: st } = useApp();
  const [allRuns, setAllRuns] = useState(false);
  const [menu, setMenu] = useState(false);

  // Each pick → its columns (a whole sequence: every column with a run) → run 1, or every run.
  const lines: Line[] = [];
  let n = 0;
  for (const pick of picks) {
    const row = store.seqs.find(s => s.id === pick.id);
    if (!row) continue;
    const ks = pick.col ? [pick.col] : allCols.map(c => c.k).filter(k => row.runs.some(r => r.sacch === k));
    for (const k of ks) {
      const runs = row.runs.filter(r => r.sacch === k && r.state !== 'missing' && r.x.length).sort((a, b) => lib.SLOTS.indexOf(a.run) - lib.SLOTS.indexOf(b.run));
      if (!runs.length) continue;
      const col = colOf(k), pal = lib.PALETTE[n++ % lib.PALETTE.length];
      (allRuns ? runs : runs.slice(0, 1)).forEach((run, j) => {
        lines.push({
          key: pickKey(pick) + '|' + k + '|' + run.id, pick, col, run,
          label: col.label + ' × ' + (row.name || '(unnamed)') + (allRuns && runs.length > 1 ? ' · ' + lib.runLabel(run.run) : ''),
          color: dark ? pal.dark : pal.light, dash: DASH[j % DASH.length], y: lib.runCurve(run, corrected),
        });
      });
    }
  }

  const g = lib.buildPlotMulti(lines.length ? lines.map(l => ({ x: l.run.x, y: l.y })) : [{ x: [0, 1], y: [0, 0] }], { w: W, h: H, domain: null, yStep: null, pad: { l: 58, r: 14, t: 14, b: 36 } });
  const plotLines: PlotLine[] = g.paths.slice(0, lines.length).map((d, i) => ({ d, k: lines[i].key, color: lines[i].color, width: 2.2, dash: lines[i].dash, op: 1 }));
  const marks = lines.map(l => lib.curveMark(l.run.x, l.y, 'min', 'none', false));
  const markers: PlotMarker[] = lib.plotMarkers(lines.map((l, i) => ({ k: l.key, color: l.color, op: 1, mark: marks[i] })), g);

  // Title: one column → "PG × A / B / C"; several → "PG × A · HA × B".
  const byCol = new Map<string, string[]>();
  for (const l of lines) {
    const name = store.seqs.find(s => s.id === l.pick.id)?.name || '(unnamed)', list = byCol.get(l.col.k) || [];
    if (!list.includes(name)) list.push(name);
    byCol.set(l.col.k, list);
  }
  const title = [...byCol].map(([k, names]) => colOf(k).label + ' × ' + names.join(' / ')).join(' · ');
  const runNote = allRuns ? 'every run' : 'run 1 of each';
  const graph: GraphData = {
    file: 'compare_' + title,
    kicker: 'Compare · PMF · ' + (corrected ? 'corrected' : 'raw') + ' · ' + runNote,
    title,
    sub: plural(lines.length, 'curve') + ' · ' + plural(picks.length, 'pick'),
    xLabel: st.xLabel, yLabel: st.yLabel, domain: null, yStep: null,
    note: corrected ? 'corrected: + 2kT·ln r, plateau = 0 · autoscaled' : 'raw gmx awh output · autoscaled',
    series: lines.map((l, i) => {
      const pal = lib.PALETTE.find(p => p.dark === l.color || p.light === l.color);
      return { x: l.run.x, y: l.y, rx: l.run.x, ry: l.y, mark: marks[i], label: l.label, color: pal ? pal.light : l.color, width: 2.2, dash: l.dash };
    }),
  };
  const exportGraph = async (f: 'xvg' | 'png' | 'pdf') => {
    const blob = f === 'xvg' ? new Blob([graphXvg(graph)], { type: 'text/plain' }) : f === 'png' ? await toPNG(graphScene(graph), 2) : toPDF(graphScene(graph));
    download(blob, fileBase(graph.file) + '.' + f);
  };

  const pill = { height: 34, border: '1px solid var(--line)', borderRadius: 99, background: 'transparent', fontSize: 11, whiteSpace: 'nowrap' as const };
  const pickLabel = (p: ComparePick) => {
    const row = store.seqs.find(s => s.id === p.id);
    return (p.col ? colOf(p.col).label + ' × ' : '') + (row ? row.name || '(unnamed)' : '?') + (p.col ? '' : ' · all columns');
  };

  return (
    <div className="scrim" onClick={onClose} style={{ zIndex: 11 }}>
      <div className="card" onClick={stop} style={{ width: 'min(760px, 100%)' }}>
        <div className="card-head">
          <div style={{ minWidth: 0 }}>
            <div className="lbl-wide" style={{ color: 'var(--acc)' }}>Compare</div>
            <div className="title22" style={{ textTransform: 'uppercase', letterSpacing: '0.02em', marginTop: 4 }}>{title || 'nothing to compare'}</div>
            <div style={{ fontSize: 11, color: 'var(--mut)', letterSpacing: '0.06em', marginTop: 4 }}>{plural(lines.length, 'curve')} · {runNote} · hold {keyLabel(st.compareKey)} and click to add or remove</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flex: 'none' }}>
            <ExportMenu open={menu} setOpen={v => setMenu(v && lines.length > 0)} width={270} head="Export comparison" onPick={exportGraph}
              hints={{ xvg: 'every curve, one set each', png: 'image, 2× resolution', pdf: 'vector, one page' }}
              trigger={(open, toggle) => (
                <button className="h-acc" onClick={toggle} style={{ ...pill, display: 'flex', alignItems: 'center', gap: 6, padding: '0 13px', borderColor: open ? 'var(--acc)' : 'var(--line)', color: 'var(--ink)', opacity: lines.length ? 1 : 0.45 }}>
                  <DownloadIcon size={13} />export
                </button>
              )} />
            <button className="x-btn h-surf" onClick={onClose} style={{ marginLeft: 0 }}>×</button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px 18px', padding: '14px 20px 0', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="lbl">Runs</span>
            <Seg value={allRuns} onPick={setAllRuns} opts={[{ v: false, label: 'run 1' }, { v: true, label: 'every run' }]} />
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="lbl">Curve</span>
            <Seg value={corrected} onPick={setCorrected} opts={[{ v: true, label: 'corrected' }, { v: false, label: 'raw awh' }]} />
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '12px 20px 0' }}>
          {picks.map(p => (
            <span key={pickKey(p)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 11px', border: '1px solid var(--line)', borderRadius: 99, background: 'var(--surf)', fontSize: 11 }}>
              {pickLabel(p)}
              <button className="h-acc" title="Take it out of the comparison" onClick={() => setPicks(picks.filter(q => pickKey(q) !== pickKey(p)))}
                style={{ width: 20, height: 20, padding: 0, border: 0, borderRadius: 99, background: 'transparent', color: 'var(--mut)', fontSize: 13, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>

        <div style={{ padding: '14px 20px 4px' }}>
          <Plot g={g} W={W} H={H} lines={plotLines} markers={markers} yLabel={st.yLabel} xLabel={st.xLabel} />
          {!lines.length && <div style={{ fontSize: 11, color: 'var(--mut)', padding: '6px 0' }}>None of the picks has a PMF run to show.</div>}
        </div>

        {lines.length > 0 && (
          <div style={{ padding: '6px 20px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) 90px 80px 100px', gap: '6px 12px', alignItems: 'center', fontSize: 11 }}>
              <span /><span className="lbl">Curve</span><span className="lbl" style={{ textAlign: 'right' }}>Min</span><span className="lbl" style={{ textAlign: 'right' }}>Well at</span><span className="lbl" style={{ textAlign: 'right' }}>Area</span>
              {lines.map(l => {
                const s = lib.curveStats(l.run);
                return [
                  <svg key={l.key + 'k'} width="24" height="6" viewBox="0 0 24 6"><line x1="1" x2="23" y1="3" y2="3" stroke={l.color} strokeWidth="2.6" strokeDasharray={l.dash === 'none' ? undefined : l.dash} /></svg>,
                  <span key={l.key + 'l'} className="ellip" style={{ fontWeight: 700 }}>{l.label}</span>,
                  <span key={l.key + 'm'} style={{ textAlign: 'right' }}>{fmt(s.min)} <span style={{ color: 'var(--mut)' }}>kJ/mol</span></span>,
                  <span key={l.key + 'a'} style={{ textAlign: 'right' }}>{s.at.toFixed(2)} <span style={{ color: 'var(--mut)' }}>nm</span></span>,
                  <span key={l.key + 'r'} style={{ textAlign: 'right' }}>{fmt(s.area)} <span style={{ color: 'var(--mut)' }}>kJ·nm/mol</span></span>,
                ];
              })}
            </div>
            <div style={{ fontSize: 10, color: 'var(--mut)', letterSpacing: '0.04em', paddingTop: 10 }}>min, well and area are from the corrected curve at each run’s temperature, as in the matrix</div>
          </div>
        )}
      </div>
    </div>
  );
}
