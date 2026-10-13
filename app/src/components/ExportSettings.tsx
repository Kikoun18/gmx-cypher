import { useEffect, useState, type ReactNode } from 'react';
import * as lib from '../lib/seq';
import { useApp } from '../ctx';
import { SIZE_PRESETS, exportName, pngDpi, type ExportPrefs } from '../lib/exportPrefs';
import { chooseExportFolder, loadExportFolder } from '../lib/folders';
import { Seg } from './ui';
import { keyLabel } from '../lib/keys';

const small = { fontSize: 11, color: 'var(--mut)', lineHeight: 1.6 };
const onOff = [{ v: true, label: 'on' }, { v: false, label: 'off' }];

/** A number typed freely; stored once it's in range (left blank = 0, automatic, where allowed); shows the stored value again on leaving. */
function NumField({ value, onSet, label, min, max, blank, width }: { value: number; onSet: (v: number) => void; label: string; min: number; max: number; blank?: boolean; width: number }) {
  const [t, setT] = useState<string | null>(null);
  return (
    <input className="inp-s" type="number" step="any" min={min} max={max} aria-label={label} placeholder={blank ? 'auto' : undefined} value={t ?? (blank && !value ? '' : value)} style={{ width }}
      onChange={e => { const s = e.target.value, v = Number(s); setT(s); if (s.trim() !== '' && v >= min && v <= max) onSet(v); }} onBlur={() => { if (blank && t?.trim() === '') onSet(0); setT(null); }} />
  );
}

/** Settings → Export (R8a, mock-up 9): this browser's; every export and menu follows it. */
export function ExportSettings({ sect, keyRow }: { sect: (label: string, extra?: ReactNode, mb?: number, tag?: string) => ReactNode; keyRow: ReactNode }) {
  const { exportPrefs: p, setSetting, settings, store, cols, pmfT, projectName, page, vaultFolder, metricDef } = useApp();
  const E = keyLabel(settings.exportKey);
  // Switching between pixels and millimetres moves the PNG scale to the nearest offered (1–3×, or 150–600 dpi).
  const snap = (q: ExportPrefs) => {
    if (!pngDpi(q) === !pngDpi(p)) return q;
    const opts = pngDpi(q) ? [150 / 72, 300 / 72, 600 / 72] : [1, 2, 3];
    return { ...q, scale: opts.reduce((a, b) => (Math.abs(b - q.scale) < Math.abs(a - q.scale) ? b : a)) };
  };
  const set = (patch: Partial<ExportPrefs>) => setSetting({ exportPrefs: snap({ ...p, ...patch }) });
  const [folder, setFolder] = useState<string | null>(null), [folderMsg, setFolderMsg] = useState(''), [today] = useState(() => new Date().toISOString().slice(0, 10));
  useEffect(() => { void loadExportFolder().then(h => setFolder(h?.name ?? null)); }, []);
  const choose = async () => {
    const r = await chooseExportFolder(vaultFolder);
    if (!r) return;
    if ('error' in r) { setFolderMsg(r.error); return; }
    setFolder(r.name); setFolderMsg(''); set({ dest: 'folder' });
  };
  const preset = SIZE_PRESETS.find(s => s.w === p.w && (s.w === 0 || s.unit === p.unit));
  const example = exportName(p.name, { column: cols[0]?.label || 'HA', sequence: store.seqs[0]?.name || 'POPE', tab: lib.TRANSFORMS[pmfT.kind].file, project: projectName, page: page?.name || '', date: today }, p.format, new Set());
  const dpi = pngDpi(p);
  const row = (label: string, body: ReactNode, hint?: ReactNode) => (
    <div role="group" aria-label={label} style={{ display: 'contents' }}>
      <span className="lbl" style={{ paddingTop: 8 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px 12px', flexWrap: 'wrap', minWidth: 0 }}>{body}{hint && <span style={small}>{hint}</span>}</div>
    </div>
  );
  return (
    <div style={{ padding: '0 20px 22px' }}>
      {sect('Export', undefined, 12, 'every project')}
      <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: '10px 14px', alignItems: 'start' }}>
        {row('Default format', <Seg value={p.format} onPick={v => set({ format: v })} opts={(['pdf', 'png', 'svg', 'xvg'] as const).map(v => ({ v, label: v }))} />, 'used by ' + keyLabel(settings.exportKey) + '; the menus offer every format')}
        {row('Size', <>
          <NumField value={p.w} onSet={w => set({ w })} label={'Width (' + p.unit + ')'} min={20} max={5000} blank width={76} />
          <span style={small}>×</span>
          <NumField value={p.h} onSet={h => set({ h })} label={'Height (' + p.unit + ')'} min={20} max={5000} blank width={76} />
          <Seg<ExportPrefs['unit']> value={p.unit} onPick={v => set({ unit: v })} opts={[{ v: 'mm', label: 'mm' }, { v: 'px', label: 'px' }]} />
          <select className="inp-s" aria-label="Size preset" value={preset ? SIZE_PRESETS.indexOf(preset) : ''} onChange={e => { const s = SIZE_PRESETS[Number(e.target.value)]; if (s) set({ w: s.w, unit: s.unit, ...(s.w ? {} : { h: 0 }) }); }}>
            {!preset && <option value="">custom</option>}
            {SIZE_PRESETS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
          </select>
        </>, p.w ? undefined : 'automatic: as on screen; a blank height fits the graph')}
        {row(dpi ? 'PNG resolution' : 'PNG scale', dpi
          ? <Seg value={p.scale} onPick={v => set({ scale: v })} opts={[150, 300, 600].map(d => ({ v: d / 72, label: d + ' dpi' }))} />
          : <Seg value={p.scale} onPick={v => set({ scale: v })} opts={[1, 2, 3].map(v => ({ v, label: v + '×' }))} />,
        dpi ? dpi + ' dpi at ' + p.w + ' mm' : undefined)}
        {row('Theme', <Seg<ExportPrefs['theme']> value={p.theme} onPick={v => set({ theme: v })} opts={[{ v: 'light', label: 'light' }, { v: 'dark', label: 'dark' }, { v: 'print', label: 'print' }]} />,
          p.theme === 'print' ? 'black and white, with dashes' : p.theme === 'dark' ? 'the dark screen’s colours' : 'white page, the light colours')}
        {row('Font size', <NumField value={p.font} onSet={font => set({ font })} label="Font size (pt)" min={4} max={30} width={64} />,
          'pt, the tick labels; the rest keeps its proportion' + (p.w ? ' (a matrix is scaled to the width instead)' : ''))}
        {row('Title block', <Seg value={p.title} onPick={v => set({ title: v })} opts={onOff} />)}
        {row('Grid', <Seg value={p.grid} onPick={v => set({ grid: v })} opts={onOff} />)}
        {row('Legend', <>
          <span className="seg">{([['legendMarks', '+ marks'], ['legendValue', '+ matrix value']] as const).map(([k, label]) => (
            <button key={k} className={p[k] ? 'on' : ''} aria-pressed={p[k]} onClick={() => set({ [k]: !p[k] })} style={{ padding: '6px 12px', fontSize: 11 }}>{label}</button>
          ))}</span>
          <Seg<ExportPrefs['legendAt']> value={p.legendAt} onPick={v => set({ legendAt: v })} opts={(['below', 'right', 'inside'] as const).map(v => ({ v, label: v }))} />
        </>, 'the curves' + (p.legendMarks ? ', each mark’s value' : '') + (p.legendValue ? ', the cell’s ' + metricDef.label + ' (± spread, unit, function, transform)' : ''))}
        {row('Several graphs', <>
          <Seg<ExportPrefs['layout']> value={p.layout} onPick={v => set({ layout: v })} opts={[{ v: 'each', label: 'one file each' }, { v: 'pdf', label: 'multi-page pdf' }, { v: 'grid', label: 'grid figure' }]} />
          {p.layout === 'grid' && <NumField value={p.gridCols} onSet={v => set({ gridCols: Math.round(v) })} label="Grid columns" min={1} max={6} width={56} />}
        </>, (p.layout === 'grid' ? 'columns, in the default format; ' : '') + 'for graphs picked with ' + E + ' held on the matrix')}
        {row('File names', <input className="inp-s" aria-label="File name template" value={p.name} spellCheck={false} onChange={e => set({ name: e.target.value })} style={{ width: 230, fontFamily: 'inherit' }} />,
          <>→ {example} <br />{'{column} {sequence} {tab} {project} {page} {date} · a graph’s name; the matrix keeps its own'}</>)}
        {row('Destination', <>
          <Seg<ExportPrefs['dest']> value={p.dest} onPick={v => (v === 'folder' && !folder ? void choose() : set({ dest: v }))} opts={[{ v: 'downloads', label: 'downloads' }, { v: 'folder', label: 'folder' }]} />
          <button className="h-acc ob" onClick={() => void choose()}>{folder ? 'change folder…' : 'choose folder…'}</button>
        </>, <span role="status" style={folderMsg ? { color: 'var(--accInk)' } : undefined}>{folderMsg || (folder ? folder + '/ (not inside the vault)' : 'a folder outside the vault, remembered in this browser')}</span>)}
        {row('Export key', keyRow)}
      </div>
    </div>
  );
}
