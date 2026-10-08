import { useState } from 'react';
import * as lib from '../lib/seq';
import { useApp } from '../ctx';
import { FlagChip } from './ui';

/**
 * Tag chips for one run or upload (R2c): the project's tags in order, then tags the
 * list doesn't know (kept from an import, shown in italics), and "+ tag" to create
 * one inline (F18). A new label that matches an existing tag reuses it.
 */
export function TagPicker({ value, onChange, small, onBg }: { value: string[]; onChange: (tags: string[]) => void; small?: boolean; onBg?: string }) {
  const { settings: st, setSetting, readOnly } = useApp();
  const list = lib.getTags(st), unknown = value.filter(k => !list.some(t => t.k === k));
  const [label, setLabel] = useState<string | null>(null);
  const add = () => {
    const l = (label || '').trim();
    setLabel(null);
    if (!l) return;
    const t = list.find(x => x.label.toLowerCase() === l.toLowerCase()) || lib.newTag(list, l);
    if (!list.includes(t)) setSetting({ tags: list.concat(t) });
    if (!value.includes(t.k)) onChange([...value, t.k].sort());
  };
  return (
    <div role="group" aria-label="Tags" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {list.map(t => <FlagChip key={t.k} small={small} onBg={onBg} on={value.includes(t.k)} label={t.label} onToggle={() => onChange(lib.toggleTag(value, t.k))} />)}
      {unknown.map(k => <FlagChip key={k} small={small} onBg={onBg} italic on label={k + ' · not in the tag list'} onToggle={() => onChange(lib.toggleTag(value, k))} />)}
      {!readOnly && (label == null
        ? <button className="h-acc" onClick={() => setLabel('')} style={{ padding: small ? '7px 12px' : '8px 13px', border: '1px dashed var(--line)', borderRadius: 99, background: 'transparent', color: 'var(--ink)', fontSize: small ? 11 : 12 }}>+ tag</button>
        : <input className="inp-s" autoFocus aria-label="New tag" value={label} placeholder="new tag, Enter to add" onChange={e => setLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add} style={{ width: 170 }} />)}
    </div>
  );
}
