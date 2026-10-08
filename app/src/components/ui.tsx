import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export const stop = (e: { stopPropagation(): void }) => e.stopPropagation();
export const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);
export const pad2 = (n: number) => String(n).padStart(2, '0');

/** Section header: small caps label, hairline, optional trailing content. */
export function Section({ label, children, style, wide = true }: { label: ReactNode; children?: ReactNode; style?: CSSProperties; wide?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...style }}>
      <span className={wide ? 'lbl-wide' : 'lbl'}>{label}</span>
      <span className="rule" />
      {children}
    </div>
  );
}

export interface SegOpt<T> { v: T; label: ReactNode; title?: string }

export function Seg<T>({ value, opts, onPick, size = 'm', style, bg }: { value: T; opts: SegOpt<T>[]; onPick: (v: T) => void; size?: 's' | 'm' | 'l'; style?: CSSProperties; bg?: string }) {
  const pad = size === 'l' ? '6px 14px' : size === 's' ? '5px 12px' : '6px 12px';
  return (
    <div className="seg" style={{ background: bg, ...style }}>
      {opts.map((o, i) => (
        <button key={i} className={o.v === value ? 'on' : ''} title={o.title} onClick={() => onPick(o.v)}
          style={{ padding: pad, fontSize: size === 'l' ? 12 : 11, fontWeight: size === 'l' ? 700 : undefined, letterSpacing: size === 'l' ? '0.04em' : size === 's' ? '0.02em' : undefined }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Click once to arm, again within 2.6 s to confirm. */
export function useConfirm(): [string | null, (key: string) => boolean] {
  const [armed, setArmed] = useState<string | null>(null);
  const t = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  const hit = useCallback((key: string) => {
    if (armed === key) { clearTimeout(t.current); setArmed(null); return true; }
    setArmed(key);
    clearTimeout(t.current);
    t.current = window.setTimeout(() => setArmed(null), 2600);
    return false;
  }, [armed]);
  return [armed, hit];
}

const svg = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const DownloadIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...svg}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
);

export const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...svg}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
);

export const SlidersIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...svg}><line x1="21" x2="14" y1="4" y2="4" /><line x1="10" x2="3" y1="4" y2="4" /><line x1="21" x2="12" y1="12" y2="12" /><line x1="8" x2="3" y1="12" y2="12" /><line x1="21" x2="16" y1="20" y2="20" /><line x1="12" x2="3" y1="20" y2="20" /><line x1="14" x2="14" y1="2" y2="6" /><line x1="8" x2="8" y1="10" y2="14" /><line x1="16" x2="16" y1="18" y2="22" /></svg>
);

export type ExportFormat = 'xvg' | 'png' | 'pdf';

/** Dropdown with xvg / png / pdf. `trigger` renders the button given open state + toggle. */
export function ExportMenu({ open, setOpen, head, hints, width, onPick, trigger }: {
  open: boolean; setOpen: (v: boolean) => void; head: string; hints: Record<ExportFormat, string>; width: number;
  onPick: (f: ExportFormat) => void; trigger: (open: boolean, toggle: () => void) => ReactNode;
}) {
  return (
    <div style={{ position: 'relative' }}>
      {trigger(open, () => setOpen(!open))}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div className="menu" style={{ width }}>
            <div className="lbl" style={{ padding: '6px 8px 4px' }}>{head}</div>
            {(['xvg', 'png', 'pdf'] as ExportFormat[]).map(f => (
              <button key={f} className="h-surf" onClick={() => { setOpen(false); onPick(f); }}
                style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 10px', border: 0, borderRadius: 8, background: 'transparent', textAlign: 'left' }}>
                <span style={{ fontWeight: 700, fontSize: 12, width: 30, flex: 'none' }}>{f}</span>
                <span style={{ fontSize: 11, color: 'var(--mut)' }}>{hints[f]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Checkbox-style chip used for run flags. */
export function FlagChip({ on, label, onToggle, small, onBg = 'var(--surf)', italic }: { on: boolean; label: string; onToggle: () => void; small?: boolean; onBg?: string; italic?: boolean }) {
  return (
    <button aria-pressed={on} onClick={onToggle} style={{ fontStyle: italic ? 'italic' : undefined,
      display: 'flex', alignItems: 'center', gap: 7, padding: small ? '7px 13px' : '8px 14px', border: '1px solid ' + (on ? 'var(--acc)' : 'var(--line)'),
      borderRadius: 99, background: on ? onBg : 'transparent', color: 'var(--ink)', fontSize: small ? 11 : 12,
    }}>
      <span style={{
        width: small ? 12 : 13, height: small ? 12 : 13, borderRadius: 4, border: '1px solid ' + (on ? 'var(--acc)' : 'var(--line)'), background: on ? 'var(--acc)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: small ? 8 : 9, color: '#fff', lineHeight: 1,
      }}>{on ? '✓' : ''}</span>
      {label}
    </button>
  );
}

/** Column picker: a row of buttons tinted with the chosen column's colour. */
export function ColPicker({ cols, value, onPick, hue, dark, size = 'm', extra }: {
  cols: { k: string; label: string; light: string; dark: string; name?: string }[]; value: string; onPick: (k: string) => void;
  hue: (c: { light: string; dark: string }) => string; dark: boolean; size?: 's' | 'm';
  extra?: (c: { k: string }) => { count?: string; title?: string; ring?: string; onDragOver?: (e: React.DragEvent) => void; onDrop?: (e: React.DragEvent) => void; fg?: string };
}) {
  return (
    <div style={{ display: 'flex', gap: 2, padding: size === 's' ? 2 : 3, border: '1px solid var(--line)', borderRadius: size === 's' ? 9 : 10, background: size === 's' ? 'var(--bg)' : 'var(--surf)', flexWrap: 'wrap' }}>
      {cols.map(c => {
        const on = c.k === value, x = extra ? extra(c) : {};
        return (
          <button key={c.k} onClick={() => onPick(c.k)} title={x.title} onDragOver={x.onDragOver} onDrop={x.onDrop}
            style={{
              flex: size === 's' ? '1 1 56px' : '1 1 60px', display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6,
              padding: size === 's' ? '6px 4px' : '7px 8px', border: 0, borderRadius: 7, background: on ? hue(c) : 'transparent',
              color: on ? (x.fg || (dark ? '#141312' : '#ffffff')) : 'var(--ink)', fontWeight: 700, fontSize: size === 's' ? 11 : 12,
              whiteSpace: 'nowrap', outline: x.ring || 'none', outlineOffset: -2,
            }}>
            {c.label}
            {x.count ? <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.8 }}>{x.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
