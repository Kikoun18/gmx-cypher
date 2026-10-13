import { useState } from 'react';
import { useApp } from '../ctx';
import * as lib from '../lib/seq';
import { checkParams, type ParamValue, type ScriptParam } from '../lib/scripts';
import { useScripts } from './scriptHooks';
import type { ScriptRef, Transform } from '../lib/types';
import { TrustDialog } from './FunctionsPanel';
import { Seg } from './ui';

const small = { fontSize: 11, color: 'var(--mut)', lineHeight: 1.5 };

/**
 * A transform (R2) chosen from the built-ins or a script's transform function (R3c), with its parameter values (F90).
 * A script that isn't trusted in this browser yet is offered for review first; nothing runs before that.
 */
export function TransformPicker({ value, builtIns, onChange, label }: { value: Transform; builtIns: ('entropy' | 'none')[]; onChange: (t: Transform) => void; label: string }) {
  const { trust } = useApp();
  const { scripts, infos, fnsOf, isTrusted: trustedK, markTrusted } = useScripts();
  const [draft, setDraft] = useState(false), [review, setReview] = useState(false);
  const choices = fnsOf('transform');
  const kind = draft ? 'script' : value.kind, t = value.kind === 'script' ? value : null;
  const cur = t && choices.find(c => c.k.id === t.script && c.f.name === t.fn), ref: ScriptRef | undefined = t ? scripts.find(k => k.id === t.script) : undefined;
  const info = ref && infos[ref.fileId], isTrusted = !!ref && trustedK(ref);
  const pick = (id: string) => { const c = choices.find(q => q.k.id + ':' + q.f.name === id); if (c) { setDraft(false); onChange({ kind: 'script', script: c.k.id, fn: c.f.name }); } };
  const check = cur ? checkParams(cur.f, t!.params) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="lbl">{label}</span>
        <Seg<Transform['kind']> value={kind} bg="var(--bg)" opts={[...builtIns, 'script' as const].map(v => ({ v, label: lib.TRANSFORMS[v].label }))}
          onPick={v => { if (v === 'script') { if (value.kind !== 'script') setDraft(true); } else { setDraft(false); onChange(v === 'none' ? lib.NONE : lib.ENTROPY); } }} />
      </div>
      {kind === 'script' && (
        <div role="group" aria-label={label + ': script function'} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 12, borderLeft: '2px solid var(--line)' }}>
          {!choices.length && !t ? <span style={small}>{scripts.length ? 'No transform functions yet: a function returning a list, or one you set to “transform” in Functions below.' : 'Add a Python file in Functions below; its functions that return a list are transforms.'}</span> : (
            <select className="inp-s" aria-label={label + ' function'} value={cur ? cur.k.id + ':' + cur.f.name : ''} onChange={e => pick(e.target.value)} style={{ maxWidth: 360 }}>
              {!cur && <option value="" disabled>{t ? t.fn + '() — not available' : 'choose a function…'}</option>}
              {choices.map(c => <option key={c.k.id + ':' + c.f.name} value={c.k.id + ':' + c.f.name}>{(c.k.fns[c.f.name]?.label || c.f.name) + ' — ' + c.k.name}</option>)}
            </select>
          )}
          {cur && <ParamInputs params={cur.f.params} values={t!.params} label={label} onChange={params => onChange({ ...t!, params })} />}
          {check && !check.ok && <span style={{ fontSize: 11, color: 'var(--accInk)' }}>{check.error}</span>}
          {cur && info && !isTrusted && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11 }}>
              <span style={{ color: 'var(--accInk)' }}>{ref!.name} isn’t trusted in this browser yet, so nothing is transformed.</span>
              <button className="h-acc ob" onClick={() => setReview(true)}>review and trust…</button>
            </span>
          )}
        </div>
      )}
      {review && ref && info && (
        <TrustDialog name={ref.name} source={info.source} sha256={info.sha256} matches={!ref.sha256 || info.sha256 === ref.sha256} trusted={false} action="trust and run"
          onTrust={() => void trust.add(ref.id, ref.sha256 || '').then(() => markTrusted(ref))} onClose={() => setReview(false)} />
      )}
    </div>
  );
}

/** Inputs for a function's parameters by kind (F90); a value left empty uses the default, which shows as the placeholder. */
export function ParamInputs({ params, values, label, onChange }: { params: ScriptParam[]; values?: Record<string, ParamValue>; label: string; onChange: (v: Record<string, ParamValue> | undefined) => void }) {
  const set = (p: ScriptParam, v: ParamValue | undefined) => {
    const { [p.name]: _old, ...rest } = values || {};
    const next = v === undefined ? rest : { ...rest, [p.name]: v };
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <>
      {params.map(p => {
        const v = values?.[p.name], id = label + ' ' + p.name;
        return (
          <label key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
            <code style={{ minWidth: 90 }}>{p.name}</code>
            {p.kind === 'bool' ? <input type="checkbox" aria-label={id} checked={(v ?? p.default) === true} onChange={e => set(p, e.target.checked)} />
              : p.kind === 'literal' ? <select className="inp-s" aria-label={id} value={String(v ?? p.default ?? '')} onChange={e => set(p, p.choices!.find(c => String(c) === e.target.value))}>{!p.required || v !== undefined ? null : <option value="">choose…</option>}{p.choices!.map(c => <option key={String(c)} value={String(c)}>{String(c)}</option>)}</select>
              : <input className="inp-s" aria-label={id} type={p.kind === 'str' ? 'text' : 'number'} step={p.kind === 'int' ? 1 : 'any'} value={v === undefined ? '' : String(v)} placeholder={p.default === undefined ? 'required' : String(p.default)}
                onChange={e => set(p, e.target.value === '' ? undefined : p.kind === 'str' ? e.target.value : Number(e.target.value))} style={{ width: 120 }} />}
            <span style={small}>{p.kind}</span>
          </label>
        );
      })}
    </>
  );
}
