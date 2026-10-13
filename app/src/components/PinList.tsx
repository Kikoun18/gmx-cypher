import { useState } from 'react';
import { fmtValue } from '../lib/seq';
import { unitText } from '../lib/interact';
import type { GraphMark, GraphRefLine } from '../lib/graph';
import { useConfirm } from './ui';

const small = { fontSize: 11, color: 'var(--mut)' };
const btn = { padding: '4px 9px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', fontSize: 11, whiteSpace: 'nowrap' as const };
type Edit = { kind: 'mark' | 'line'; at: number; text: string } | null;
type Adding = { kind: 'mark'; series: number; text: string } | { kind: 'line'; axis: 'x' | 'y'; text: string } | null;

/**
 * Under the graph (R5d, mock-up 6): every mark (with its value, or why it is flagged) and every reference line of this
 * graph; edited by keyboard (a mark's new x moves to its curve's nearest data point), removed by arm and confirm, and
 * added without the pointer.
 */
export function PinList({ marks, lines, series, xLabel, yLabel, readOnly, ops }: {
  marks: GraphMark[]; lines: GraphRefLine[]; series: { label: string }[]; xLabel: string; yLabel: string; readOnly: boolean;
  ops: { moveMark(at: number, x: number): void; removeMark(at: number): void; addMark(series: number, x: number): void; moveLine(at: number, v: number): void; removeLine(at: number): void; addLine(axis: 'x' | 'y', v: number): void };
}) {
  const [edit, setEdit] = useState<Edit>(null), [adding, setAdding] = useState<Adding>(null), [armed, confirm] = useConfirm();
  const xu = unitText(xLabel), yu = unitText(yLabel), u = (v: number, unit: string) => fmtValue(v) + (unit ? ' ' + unit : '');
  const n = marks.length + lines.length;
  if (!n && readOnly) return null;
  const num = (t: string) => (t.trim() !== '' && isFinite(Number(t)) ? Number(t) : null);
  const keys = (save: () => void, cancel: () => void) => (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); save(); } else if (e.key === 'Escape') { e.stopPropagation(); cancel(); } };
  const saveEdit = () => { const v = edit && num(edit.text); if (edit && v != null) (edit.kind === 'mark' ? ops.moveMark : ops.moveLine)(edit.at, v); setEdit(null); };
  const saveAdd = () => { const v = adding && num(adding.text); if (adding && v != null) { if (adding.kind === 'mark') ops.addMark(adding.series, v); else ops.addLine(adding.axis, v); } setAdding(null); };
  const editor = (label: string, text: string, set: (t: string) => void, save: () => void, cancel: () => void) => (
    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input className="inp-s" type="number" step="any" autoFocus aria-label={label} value={text} onChange={e => set(e.target.value)} onKeyDown={keys(save, cancel)} style={{ width: 110 }} />
      <button className="h-acc" style={btn} onClick={save}>save</button>
      <button className="h-acc" style={btn} onClick={cancel}>cancel</button>
    </span>
  );
  const remove = (key: string, label: string, go: () => void) => (
    <button className="h-acc" aria-label={armed === key ? 'Remove ' + label + '? Press again' : 'Remove ' + label} style={{ ...btn, color: armed === key ? 'var(--accInk)' : 'var(--mut)' }} onClick={() => { if (confirm(key)) go(); }}>{armed === key ? 'remove?' : '×'}</button>
  );
  const row = (key: string, kind: string, what: React.ReactNode, value: React.ReactNode, actions: React.ReactNode) => (
    <div key={key} role="listitem" style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto auto', gap: 10, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line)', fontSize: 12 }}>
      <span style={small}>{kind}</span><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{what}</span><span style={small}>{value}</span><span style={{ display: 'flex', gap: 6 }}>{actions}</span>
    </div>
  );
  return (
    <section aria-label="Marks and lines" style={{ maxWidth: 700, marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span className="lbl-wide">Marks & lines</span><span className="rule" /><span style={small}>{String(n).padStart(2, '0')}</span>
        {!readOnly && series.length > 0 && <button className="h-acc" style={btn} onClick={() => setAdding({ kind: 'mark', series: 0, text: '' })}>+ mark at x…</button>}
        {!readOnly && <button className="h-acc" style={btn} onClick={() => setAdding({ kind: 'line', axis: 'x', text: '' })}>+ line…</button>}
      </div>
      {adding && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0' }}>
          {adding.kind === 'mark'
            ? <select className="inp-s" aria-label="Curve to mark" value={adding.series} onChange={e => setAdding({ ...adding, series: Number(e.target.value) })}>{series.map((q, i) => <option key={i} value={i}>{q.label}</option>)}</select>
            : <select className="inp-s" aria-label="Line direction" value={adding.axis} onChange={e => setAdding({ ...adding, axis: e.target.value as 'x' | 'y' })}><option value="x">vertical at x</option><option value="y">horizontal at y</option></select>}
          {editor(adding.kind === 'mark' ? 'x of the new mark' + (xu ? ' (' + xu + ')' : '') : 'Value of the new line', adding.text, t => setAdding({ ...adding, text: t }), saveAdd, () => setAdding(null))}
        </div>
      )}
      <div role="list">
        {marks.map(mk => {
          const name = (mk.series >= 0 ? series[mk.series]?.label : 'a removed curve') + ' at x = ' + u(mk.x, xu), key = 'm' + mk.at;
          return row(key, '● mark', edit?.kind === 'mark' && edit.at === mk.at ? editor('New x of ' + name, edit.text, t => setEdit({ ...edit, text: t }), saveEdit, () => setEdit(null)) : name,
            mk.flagged ? <span style={{ color: 'var(--accInk)' }}>{mk.flagged}</span> : u(mk.v!, yu),
            !readOnly && <>{mk.series >= 0 && !edit && <button className="h-acc" style={btn} aria-label={'Edit ' + name} onClick={() => setEdit({ kind: 'mark', at: mk.at, text: String(mk.x) })}>edit</button>}{remove(key, 'mark ' + name, () => ops.removeMark(mk.at))}</>);
        })}
        {lines.map(l => {
          const name = (l.axis === 'x' ? 'vertical at x = ' + u(l.v, xu) : 'horizontal at y = ' + u(l.v, yu)), key = 'l' + l.at;
          return row(key, l.axis === 'x' ? '┆ line' : '┄ line', edit?.kind === 'line' && edit.at === l.at ? editor('New value of the line ' + name, edit.text, t => setEdit({ ...edit, text: t }), saveEdit, () => setEdit(null)) : name, '',
            !readOnly && <>{!edit && <button className="h-acc" style={btn} aria-label={'Edit line ' + name} onClick={() => setEdit({ kind: 'line', at: l.at, text: String(l.v) })}>edit</button>}{remove(key, 'line ' + name, () => ops.removeLine(l.at))}</>);
        })}
      </div>
      {!n && <div style={{ ...small, padding: '6px 0' }}>none yet</div>}
    </section>
  );
}
