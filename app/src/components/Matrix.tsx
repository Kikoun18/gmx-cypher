import { useState, type ReactNode } from 'react';
import * as lib from '../lib/seq';
import type { Seq } from '../lib/types';
import { tileProvenance, tileText, type Tile } from '../lib/metrics';
import type { Scale } from '../lib/scales';
import { pickKey, useApp, type Sel } from '../ctx';
import { pad2, plural } from './ui';
import type { Group } from '../lib/matrix';

export function Matrix({ glist, anyGroup, sel, scale, tiles, onHover, onOpenCol, onOpenColumns, footer }: {
  glist: Group[]; anyGroup: boolean; sel: Sel | null; scale: Scale; tiles: Map<string, Tile>;
  onHover: (h: { k: string; x: number; y: number } | null) => void; onOpenCol: (k: string) => void; onOpenColumns: () => void; footer: ReactNode;
}) {
  const { cols, hue } = useApp();
  const gridCols = '250px repeat(' + cols.length + ', 76px) 40px';
  return (
    <div style={{ width: 'max-content', minWidth: '100%' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--bg)', display: 'grid', gridTemplateColumns: gridCols, gap: 8, padding: '10px 18px 8px', borderBottom: '1px solid var(--line)' }}>
        <div className="lbl" style={{ alignSelf: 'end' }}>Sequence</div>
        {cols.map(s => (
          <button key={s.k} className="h-row" title={s.name} onClick={() => onOpenCol(s.k)}
            onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); onHover({ k: s.k, x: r.left + r.width / 2, y: r.bottom + 12 }); }}
            onMouseLeave={() => onHover(null)}
            style={{ alignSelf: 'end', textAlign: 'center', padding: '5px 1px', background: 'transparent', border: '1px solid transparent', borderRadius: 11, minWidth: 0 }}>
            <div className="ellip" style={{ fontFamily: 'var(--arch)', fontWeight: 800, fontSize: 18, letterSpacing: '0.02em', color: hue(s) }}>{s.label}</div>
            <div className="ellip" style={{ fontSize: 10, color: 'var(--mut)', lineHeight: 1.25, marginTop: 3, letterSpacing: '-0.01em' }}>{s.short}</div>
          </button>
        ))}
        <button className="h-acc" onClick={onOpenColumns} title="Add or remove columns"
          style={{ alignSelf: 'end', height: 54, padding: 0, border: '1px dashed var(--line)', borderRadius: 11, background: 'transparent', color: 'var(--mut)', fontSize: 16, lineHeight: 1, width: 76 }}>+</button>
      </div>

      {glist.map(([g, rs]) => (
        <div key={g || '∅'}>
          {anyGroup && (
            <div className="lbl-wide" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px 7px' }}>
              <span>{g || 'no group'}</span>
              <span className="rule" />
              <span>{pad2(rs.length)}</span>
            </div>
          )}
          <div style={{ paddingTop: 8 }}>
            {rs.map(s => <Row key={s.id} s={s} sel={sel} scale={scale} tiles={tiles} gridCols={gridCols} />)}
          </div>
        </div>
      ))}
      {footer}
    </div>
  );
}

function Row({ s, sel, scale, tiles, gridCols }: { s: Seq; sel: Sel | null; scale: Scale; tiles: Map<string, Tile>; gridCols: string }) {
  const { store, cols, metricDef, types, settings, skip, dark, setSel, openForm, compare, readOnly, dropOnCell } = useApp();
  const pmfM = metricDef.type === 'pmf', tLabel = pmfM ? 'PMF' : types.find(t => t.k === metricDef.type)?.label || metricDef.type;
  // Files dragged over a cell: that cell is the drop target (not the app's other drags, not read-only, not while comparing).
  const [hot, setHot] = useState<string | null>(null);
  const fileDrag = (e: React.DragEvent) => !readOnly && !compare.held && e.dataTransfer.types.includes('Files');
  const rowPicked = compare.picked.has(pickKey({ id: s.id, col: null }));
  const nx = s.extras.length, ns = s.structures.length;
  const meta = plural(s.runs.length, 'run') + (nx ? ' · ' + plural(nx, 'analysis', 'analyses') : '') + (ns ? ' · ' + plural(ns, 'structure') : '') + (s.seq ? ' · ' + s.seq.length + ' aa' : '');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 8, padding: '0 18px 8px' }}>
      <button className="h-row" onClick={() => (compare.held ? compare.toggle({ id: s.id, col: null }) : setSel({ mode: 'row', id: s.id, s: cols[0].k }))}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, padding: '9px 12px', background: rowPicked ? 'var(--surf)' : 'transparent', border: '1px solid ' + (rowPicked ? 'var(--acc)' : 'transparent'), borderRadius: 11, textAlign: 'left', minWidth: 0, boxShadow: 'inset 3px 0 0 ' + (store.notes.row[s.id] ? 'var(--acc)' : 'transparent'), cursor: compare.held ? 'copy' : undefined }}>
        <span className="ellip" style={{ fontFamily: 'var(--arch)', fontWeight: 800, fontSize: 19, lineHeight: 1.1, letterSpacing: '-0.01em', maxWidth: '100%' }}>{s.name || '(unnamed)'}</span>
        <span className="ellip" style={{ fontSize: 11, letterSpacing: '0.16em', color: 'var(--mut)', maxWidth: '100%' }}>{s.seq || '—'}</span>
        <span style={{ fontSize: 10, letterSpacing: '0.06em', color: 'var(--mut)' }}>{meta}</span>
      </button>
      {cols.map(sc => {
        const tile = tiles.get(s.id + '|' + sc.k) ?? { kind: 'empty', hidden: false };
        const runs = s.runs.filter(r => r.sacch === sc.k).sort((a, b) => lib.SLOTS.indexOf(a.run) - lib.SLOTS.indexOf(b.run));
        const nEx = s.extras.filter(e => e.sacch === sc.k).length;
        const nLit = (store.lit[lib.litKey(sc.k, s.id)] || []).length;
        // Compare shows PMF runs; an export also takes a cell with analyses only (its first analysis, F134).
        const pickable = runs.length > 0 || (compare.forExport && nEx > 0);
        const picked = compare.picked.has(pickKey({ id: s.id, col: sc.k })) || (rowPicked && pickable);
        const isSel = picked || (!!sel && sel.mode === 'cell' && sel.id === s.id && sel.s === sc.k);
        const note = !!store.notes.cell[sc.k + '_' + s.id];
        const open = () => setSel({ mode: 'cell', id: s.id, s: sc.k });
        const bars = runs.length > 1 ? runs.map(r => { const vv = store.vis[lib.slotKey(s.id, r.sacch, r.run)]; return { k: r.id, op: vv === 'off' ? 0.15 : vv === 'dim' ? 0.4 : 0.8 }; }) : [];
        const litT = nLit ? ' · ' + plural(nLit, 'reference') : '';
        let c: { text: string; fill: string; ink: string; border: string; title: string; onClick: () => void; empty?: boolean; spread?: string };
        const prov = () => tileProvenance(s, sc.k, metricDef, tile, { st: settings, skip, scripts: store.scripts }) + (nEx && pmfM ? ' · ' + plural(nEx, 'analysis curve') : '') + litT;
        const who = s.name + ' × ' + sc.label + ' · ';
        if (tile.kind === 'pending') {
          c = { text: '…', fill: 'transparent', ink: 'var(--mut)', border: '1px solid var(--line)', onClick: open, title: who + 'computing ' + metricDef.label + '…' };
        } else if (tile.kind === 'none') {
          c = { text: '—', spread: 'error', fill: 'transparent', ink: 'var(--accInk)', border: '1px solid var(--line)', onClick: open, title: who + metricDef.label + ' · ' + prov() };
        } else if (tile.kind === 'empty' && (runs.length || nEx || nLit)) {
          c = { text: (pmfM ? runs.length : tile.hidden) ? 'off' : '—', fill: 'transparent', ink: 'var(--mut)', border: '1px solid var(--line)', onClick: open,
            title: who + (tile.hidden || (pmfM && runs.length) ? 'every run is hidden and left out of the value' : pmfM ? (nEx ? plural(nEx, 'analysis curve') + ', no PMF yet' : 'no PMF yet') : 'no ' + tLabel + ' analysis here') + litT };
        } else if (tile.kind === 'empty') {
          c = { text: '+', fill: 'transparent', ink: 'var(--mut)', border: '1px dashed var(--line)', empty: true,
            title: 'No ' + sc.label + ' run for ' + s.name + ' — click to upload one',
            onClick: () => openForm(lib.cellForm(s, sc.k)) };
        } else {
          const v = tile.v, tx = tileText(tile, metricDef, !!settings.tileSpread);
          c = { text: tx.main, spread: tx.spread, fill: scale.color(v, dark), ink: scale.ink(v, dark), border: '0', onClick: open, title: who + metricDef.label + ' = ' + prov() };
        }
        return (
          <button key={sc.k} className="h-cell" title={c.title} aria-label={c.title}
            onClick={() => { if (!compare.held) c.onClick(); else if (pickable) compare.toggle({ id: s.id, col: sc.k }); }}
            onDragOver={e => { if (!fileDrag(e)) return; e.preventDefault(); e.stopPropagation(); if (hot !== sc.k) setHot(sc.k); }}
            onDragLeave={() => { if (hot === sc.k) setHot(null); }}
            onDrop={e => { if (!fileDrag(e)) return; e.preventDefault(); e.stopPropagation(); setHot(null); dropOnCell(s.id, sc.k, e.dataTransfer); }}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '1', padding: 0, border: c.border, borderRadius: 13, background: c.fill, color: c.ink, fontWeight: 700, fontSize: 13, outline: hot === sc.k ? '2px dashed var(--acc)' : isSel ? '2px solid var(--acc)' : 'none', outlineOffset: 2, cursor: compare.held ? (pickable ? 'copy' : 'not-allowed') : undefined }}>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span>{hot === sc.k ? 'drop' : c.text}</span>
              {c.spread && hot !== sc.k && <span style={{ fontSize: 9, fontWeight: 400, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{c.spread}</span>}
            </span>
            {!c.empty && note && <span style={{ position: 'absolute', top: 5, right: 5, width: 5, height: 5, borderRadius: 99, background: 'currentColor' }} />}
            {!c.empty && nLit > 0 && <span style={{ position: 'absolute', top: 5, left: 5, width: 5, height: 5, borderRadius: 1.5, border: '1px solid currentColor', opacity: 0.8 }} />}
            {!c.empty && bars.length > 0 && (
              <span style={{ position: 'absolute', bottom: 5, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 2 }}>
                {bars.map(b => <span key={b.k} style={{ width: 3, height: 2, background: 'currentColor', opacity: b.op }} />)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
