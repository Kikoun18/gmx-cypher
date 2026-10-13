import { useRef, useState } from 'react';
import { useApp } from '../ctx';
import * as lib from '../lib/seq';
import { AREA, BUILTINS, MIN, cleanMetric, metricUnit } from '../lib/metrics';
import type { MetricDef, Transform } from '../lib/types';
import { useScripts } from './scriptHooks';
import { ParamInputs, TransformPicker } from './TransformPicker';
import { Seg, stop, useConfirm } from './ui';

const item = { display: 'flex', alignItems: 'baseline', gap: 8, width: '100%', padding: '7px 10px', border: 0, borderRadius: 8, background: 'transparent', textAlign: 'left' as const, fontSize: 12 };
const small = { fontSize: 11, color: 'var(--mut)' };
const OTHER = Object.keys(BUILTINS).filter(k => k !== 'area' && k !== 'min');
/** F99: from zero for Area, Min and barrier, min–max for the rest. */
const scaleFor = (fn: MetricDef['fn']): MetricDef['scale'] => ({ kind: fn.kind === 'builtin' && ['area', 'min', 'barrier'].includes(fn.name) ? 'zero' : 'minmax' });
const newMetricId = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/**
 * The matrix metric (R4a, mock-up 5), in place of the Area/Min toggle: PMF's built-ins, the project's saved metrics,
 * the built-in functions and the scripts' matrix functions (each opens the editor), recent ones, and "+ new metric…".
 */
export function MetricPicker() {
  const { metricDef, setMetricId, settings, readOnly } = useApp();
  const { scripts, fnsOf } = useScripts();
  const [open, setOpen] = useState(false), [edit, setEdit] = useState<MetricDef | null>(null), btn = useRef<HTMLButtonElement>(null);
  const saved = (settings.metrics || []).map(cleanMetric).filter((m): m is MetricDef => !!m);
  const byId = (id: string) => (id === AREA.id ? AREA : id === MIN.id ? MIN : saved.find(m => m.id === id));
  const recent = (settings.recentMetrics || []).map(byId).filter((m): m is MetricDef => !!m && m.id !== metricDef.id).slice(0, 4);
  const pick = (id: string) => { setOpen(false); setMetricId(id); };
  const draft = (fn: MetricDef['fn']) => { setOpen(false); setEdit({ id: '', label: '', type: metricDef.type === 'pmf' && fn.kind === 'builtin' && OTHER.includes(fn.name) ? 'data' : metricDef.type, fn, agg: 'mean', scale: scaleFor(fn) }); };
  const head = (t: string) => <div className="lbl" style={{ padding: '8px 10px 2px' }}>{t}</div>;
  const row = (key: string, label: string, note: string, onClick: () => void, first?: boolean) => (
    <button key={key} role="menuitem" className="h-surf" style={item} onClick={onClick} autoFocus={first}><span style={{ fontWeight: key === metricDef.id ? 700 : 400 }}>{label}</span>{note && <span style={small}>{note}</span>}</button>
  );
  const fns = fnsOf('metric');
  return (
    <div style={{ position: 'relative' }} onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); btn.current?.focus(); } }}>
      <button ref={btn} className="h-surf" aria-haspopup="menu" aria-expanded={open} aria-label={"Matrix metric: " + metricDef.label} onClick={() => setOpen(!open)} title="The matrix metric on this page (remembered with the page)"
        style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 340, padding: '8px 13px', border: '1px solid ' + (open ? 'var(--acc)' : 'var(--line)'), borderRadius: 9, background: 'transparent', fontSize: 12, fontWeight: 700 }}>
        <span className="ellip">{metricDef.label}</span><span aria-hidden="true">▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div className="menu" role="menu" aria-label="Matrix metric" style={{ width: 320, maxHeight: '70vh', overflow: 'auto', left: 0, right: 'auto' }}>
            {head('Built-in · PMF')}
            {row(AREA.id, 'Area', AREA.unit!, () => pick(AREA.id), true)}
            {row(MIN.id, 'Min', MIN.unit!, () => pick(MIN.id))}
            {saved.length > 0 && head('Saved in this project')}
            {saved.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center' }}>
                {row(m.id, m.label, metricUnit(m, settings), () => pick(m.id))}
                {!readOnly && <button className="h-surf" aria-label={'Edit ' + m.label} onClick={() => { setOpen(false); setEdit(m); }} style={{ ...item, width: 'auto', ...small }}>edit</button>}
              </div>
            ))}
            {!readOnly && head('Built-in functions')}
            {!readOnly && OTHER.map(k => row('b:' + k, BUILTINS[k].label + (BUILTINS[k].params ? '…' : ''), '', () => draft({ kind: 'builtin', name: k })))}
            {!readOnly && scripts.map(k => {
              const mine = fns.filter(q => q.k.id === k.id);
              return mine.length > 0 && <div key={k.id}>{head('Functions · ' + k.name)}{mine.map(({ f }) => row('s:' + k.id + f.name, k.fns[f.name]?.label || f.name, k.fns[f.name]?.unit || f.unit || '', () => draft({ kind: 'script', script: k.id, fn: f.name })))}</div>;
            })}
            {recent.length > 0 && head('Recent')}
            {recent.map(m => row('r:' + m.id, m.label, metricUnit(m, settings), () => pick(m.id)))}
            {!readOnly && <button role="menuitem" className="h-acc" onClick={() => draft({ kind: 'builtin', name: 'mean' })} style={{ ...item, marginTop: 4, border: '1px dashed var(--line)', color: 'var(--mut)' }}>+ new metric…</button>}
          </div>
        </>
      )}
      {edit && <MetricEditor start={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** A metric's definition: type, curve, transform, function and values, unit and name; saved in metrics.json (F97). */
function MetricEditor({ start, onClose }: { start: MetricDef; onClose: () => void }) {
  const { store, settings, types, setSetting, setMetricId } = useApp();
  const { scripts, fnsOf, infos } = useScripts();
  const [d, setD] = useState<MetricDef>(start), [armed, confirm] = useConfirm();
  const set = (p: Partial<MetricDef>) => setD(q => ({ ...q, ...p }));
  const T = types.find(t => t.k === d.type);
  // Curve names by their place in the analyses of this type (the first legend found for each place).
  const names: string[] = [];
  for (const s of store.seqs) for (const e of s.extras) if (e.type === d.type) e.curves.forEach((c, i) => { names[i] ??= c.label || 'col ' + (i + 2); });
  const fnKey = d.fn.kind === 'builtin' ? 'b:' + d.fn.name : 's:' + d.fn.script + ':' + d.fn.fn;
  const sfn = d.fn.kind === 'script' ? fnsOf('metric').find(q => d.fn.kind === 'script' && q.k.id === d.fn.script && q.f.name === d.fn.fn) : undefined;
  const params = d.fn.kind === 'builtin' ? BUILTINS[d.fn.name]?.params || [] : sfn?.f.params || [];
  const fnName = d.fn.kind === 'builtin' ? BUILTINS[d.fn.name]?.label || d.fn.name : (sfn?.k.fns[sfn.f.name]?.label || d.fn.fn);
  const cName = names[d.curve ?? 0] || 'curve ' + ((d.curve ?? 0) + 1);
  const auto = fnName + ' · ' + (d.type === 'pmf' ? 'PMF' : T?.label || d.type) + (d.type !== 'pmf' && names.length > 1 && cName !== T?.label ? ' · ' + cName : '');
  const unitHint = sfn ? sfn.k.fns[sfn.f.name]?.unit || sfn.f.unit || '' : metricUnit({ ...d, unit: undefined }, settings);
  const pickFn = (k: string) => {
    const fn: MetricDef['fn'] = k.startsWith('b:') ? { kind: 'builtin', name: k.slice(2) } : { kind: 'script', script: k.split(':')[1], fn: k.split(':')[2] };
    // A new metric takes the function's default scale until you choose one.
    set({ fn, params: undefined, ...(d.id || d.scale.kind === 'diverging' ? {} : { scale: scaleFor(fn) }) });
  };
  const save = () => {
    const def = cleanMetric({ ...d, id: d.id || newMetricId(), label: d.label || auto, unit: d.unit || (sfn ? unitHint : undefined) })!;
    const list = (settings.metrics || []).filter(m => m.id !== def.id);
    setSetting({ metrics: [...list, def] });
    setMetricId(def.id);
    onClose();
  };
  const lab = (t: string, el: React.ReactNode) => <label className="fld" style={{ gap: 4 }}><span className="lbl">{t}</span>{el}</label>;
  const ready = !params.some(p => p.required && d.params?.[p.name] === undefined);
  return (
    <div className="scrim" onClick={onClose} style={{ zIndex: 15 }}>
      <div className="card" role="dialog" aria-modal="true" aria-labelledby="metric-title" onClick={stop} style={{ width: 'min(560px, 100%)' }}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
        <div className="card-head">
          <div>
            <div className="title22" id="metric-title">{d.id ? 'Edit metric' : 'New metric'}</div>
            <div style={{ ...small, letterSpacing: '0.06em', marginTop: 4 }}>each tile: the function on each run’s curve, then the mean over runs, with n and SD</div>
          </div>
          <button className="x-btn h-surf" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 20px 20px' }}>
          {lab('Analysis', (
            <select className="inp-s" value={d.type} autoFocus onChange={e => set({ type: e.target.value, curve: undefined, ...(e.target.value !== 'pmf' && d.fn.kind === 'builtin' && BUILTINS[d.fn.name]?.pmf ? { fn: { kind: 'builtin', name: 'mean' } } : {}) })}>
              <option value="pmf">PMF</option>
              {types.map(t => <option key={t.k} value={t.k}>{t.label}</option>)}
            </select>
          ))}
          {d.type !== 'pmf' && lab('Curve', (
            <select className="inp-s" value={d.curve ?? 0} onChange={e => set({ curve: Number(e.target.value) || undefined })}>
              {(names.length ? names : ['curve 1']).map((n, i) => <option key={i} value={i}>{i + 1} · {n}</option>)}
            </select>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <input type="checkbox" checked={!!d.transform} onChange={e => set({ transform: e.target.checked ? lib.NONE : undefined })} />
              its own transform <span style={small}>(otherwise {d.type === 'pmf' ? 'PMF’s correction setting' : 'the type’s: ' + lib.TRANSFORMS[T ? lib.transformOf(T, settings).kind : 'none'].label})</span>
            </label>
            {d.transform && <TransformPicker label="Metric transform" value={d.transform} builtIns={['none', 'entropy']} onChange={(t: Transform) => set({ transform: t })} />}
          </div>
          {lab('Function', (
            <select className="inp-s" value={fnKey} onChange={e => pickFn(e.target.value)}>
              <optgroup label="Built-in">
                {Object.keys(BUILTINS).filter(k => d.type === 'pmf' || !BUILTINS[k].pmf).map(k => <option key={k} value={'b:' + k}>{BUILTINS[k].label}</option>)}
              </optgroup>
              {scripts.map(k => { const mine = fnsOf('metric').filter(q => q.k.id === k.id); return mine.length > 0 && <optgroup key={k.id} label={'Functions · ' + k.name}>{mine.map(({ f }) => <option key={f.name} value={'s:' + k.id + ':' + f.name}>{k.fns[f.name]?.label || f.name}</option>)}</optgroup>; })}
              {d.fn.kind === 'script' && !sfn && <option value={fnKey}>{d.fn.fn}() — {infos[scripts.find(k => d.fn.kind === 'script' && k.id === d.fn.script)?.fileId || '']?.fns ? 'not available' : 'reading…'}</option>}
            </select>
          ))}
          {d.fn.kind === 'builtin' && BUILTINS[d.fn.name] && <span style={small}>{BUILTINS[d.fn.name].desc}</span>}
          {params.length > 0 && <ParamInputs params={params} values={d.params as Record<string, string | number | boolean> | undefined} label={'Metric'} onChange={v => set({ params: v })} />}
          {lab('Over runs', <span style={{ fontSize: 12 }}>mean ± SD (n runs)</span>)}
          <div className="fld" style={{ gap: 6 }}>
            <span className="lbl">Colour scale</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Seg<MetricDef['scale']['kind']> value={d.scale.kind} bg="var(--bg)" onPick={k => set({ scale: k === 'diverging' ? { kind: k, center: d.scale.center ?? 0 } : { kind: k } })}
                opts={[{ v: 'zero', label: 'from zero' }, { v: 'minmax', label: 'min–max' }, { v: 'diverging', label: 'diverging' }]} />
              {d.scale.kind === 'diverging' && <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>around <input className="inp-s" type="number" step="any" aria-label="Centre of the scale" value={d.scale.center ?? 0} onChange={e => set({ scale: { kind: 'diverging', center: Number(e.target.value) || 0 } })} style={{ width: 90 }} /></label>}
            </span>
            <span style={small}>{d.scale.kind === 'zero' ? 'magnitude from zero, as Area and Min' : d.scale.kind === 'minmax' ? 'lowest to highest tile on the page' : 'warm above the value, cool below'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 12 }}>
            {lab('Unit', <input className="inp-s" value={d.unit || ''} placeholder={unitHint || 'none'} onChange={e => set({ unit: e.target.value || undefined })} />)}
            {lab('Name', <input className="inp-s" value={d.label} placeholder={auto} onChange={e => set({ label: e.target.value })} />)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            {d.id && (
              <button className="h-acc" onClick={() => { if (confirm('del')) { setSetting({ metrics: (settings.metrics || []).filter(m => m.id !== d.id) }); onClose(); } }}
                style={{ marginRight: 'auto', padding: '9px 14px', border: '1px solid var(--line)', borderRadius: 10, background: 'transparent', fontSize: 12, color: armed === 'del' ? 'var(--accInk)' : 'var(--mut)' }}>{armed === 'del' ? 'delete it?' : 'delete'}</button>
            )}
            <button className="h-acc" onClick={onClose} style={{ padding: '9px 14px', border: '1px solid var(--line)', borderRadius: 10, background: 'transparent', fontSize: 12 }}>cancel</button>
            <button className="h-bright" disabled={!ready} onClick={save} style={{ padding: '9px 16px', border: 0, borderRadius: 10, background: 'var(--acc)', color: '#fff', fontWeight: 700, fontSize: 12, opacity: ready ? 1 : 0.5 }}>save and show</button>
          </div>
        </div>
      </div>
    </div>
  );
}
