import { useState } from 'react';
import { useApp } from '../ctx';
import { stop } from './ui';

type Block = { k: 'p'; html: string } | { k: 'ul'; items: string[] };
export interface SacchData {
  label?: string;
  name?: string;
  formula?: string;
  structure?: { light: string; dark: string };
  structureNote?: string;
  sections?: { title: string | null; blocks: Block[] }[];
}

// Theory text is the project's own reference file (sacch.json), authored alongside the page.
const Rich = ({ html }: { html: string }) => <span dangerouslySetInnerHTML={{ __html: html }} />;

export function HoverCard({ h, data }: { h: { k: string; x: number; y: number }; data?: SacchData }) {
  const { dark, colOf } = useApp();
  const src = data && data.structure && (dark ? data.structure.dark : data.structure.light);
  if (!src) return null;
  const sc = colOf(h.k);
  const w = Math.min(520, window.innerWidth - 24);
  const imgH = Math.max(110, Math.min(250, window.innerHeight - h.y - 132));
  return (
    <div style={{
      position: 'fixed', zIndex: 8, left: Math.max(12, Math.min(h.x - w / 2, window.innerWidth - w - 12)), top: Math.max(12, Math.min(h.y, window.innerHeight - imgH - 120)), width: w,
      pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: 12, padding: '15px 21px', background: dark ? '#0e0d0c' : '#ffffff',
      border: '1px solid var(--line)', borderRadius: 18, boxShadow: '0 14px 34px rgba(0,0,0,0.22)',
    }}>
      <img src={src} alt="" style={{ width: '100%', height: 'auto', maxHeight: imgH, objectFit: 'contain', display: 'block' }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontFamily: 'var(--arch)', fontWeight: 800, fontSize: 17, color: dark ? '#f0eeec' : '#201e1d' }}>{sc.label + ' · ' + sc.name}</span>
        <span style={{ fontSize: 11, letterSpacing: '0.06em', lineHeight: 1.6, color: dark ? '#938d89' : '#6b6663' }}>{data!.structureNote || ''}</span>
      </span>
    </div>
  );
}

export function ColumnDialog({ k, data, onClose, onEditColumns }: { k: string; data?: SacchData; onClose: () => void; onEditColumns: () => void }) {
  const { dark, colOf, hue } = useApp();
  const [theoryOpen, setTheoryOpen] = useState(true);
  const sc = colOf(k), sd = data || {};
  const src = sd.structure && (dark ? sd.structure.dark : sd.structure.light);
  const note = sd.structureNote || (src ? '' : 'No reference drawing or theory for this column. Label, name and colour can be changed in Settings.');
  return (
    <div className="scrim" onClick={onClose} style={{ zIndex: 11 }}>
      <div className="card" onClick={stop} style={{ width: 'min(720px, 100%)' }}>
        <div className="card-head">
          <div>
            <div className="title22" style={{ color: hue(sc) }}>{sc.label}</div>
            <div style={{ fontSize: 11, color: 'var(--mut)', letterSpacing: '0.06em', marginTop: 4 }}>{sc.name}</div>
          </div>
          <button className="x-btn h-surf" onClick={onClose}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 20px 4px' }}>
          {sd.formula && (
            <div style={{ padding: '11px 15px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surf)' }}>
              <div className="lbl">Formula</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, marginTop: 4, overflowWrap: 'anywhere' }}>{sd.formula}</div>
            </div>
          )}
          {src ? (
            <div style={{ padding: '16px 18px 12px', background: dark ? '#0e0d0c' : '#ffffff', border: '1px solid var(--line)', borderRadius: 14 }}>
              <img src={src} alt={sc.name + ' repeat unit'} style={{ width: '100%', height: 'auto', maxHeight: 300, objectFit: 'contain', display: 'block' }} />
              <div className="lbl" style={{ letterSpacing: '0.1em', marginTop: 10 }}>{note}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 16px', border: '1px dashed var(--line)', borderRadius: 12, fontSize: 11, color: 'var(--mut)' }}>
              <span style={{ flex: '1 1 240px' }}>{note}</span>
              <button className="h-accb" onClick={onEditColumns} style={{ padding: '6px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'transparent', fontSize: 11 }}>edit columns</button>
            </div>
          )}
        </div>

        {sd.sections ? (
          <div style={{ padding: '10px 18px 22px' }}>
            <button onClick={() => setTheoryOpen(!theoryOpen)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '0 0 8px', background: 'transparent', border: 0, textAlign: 'left' }}>
              <span className="lbl-wide">Theory</span>
              <span className="rule" />
              <span style={{ fontSize: 10, letterSpacing: '0.06em', color: 'var(--mut)' }}>{theoryOpen ? 'hide' : 'show'}</span>
            </button>
            {theoryOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 6 }}>
                {sd.sections.map((sec, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sec.title && (
                      <div style={{ fontFamily: 'var(--arch)', fontWeight: 800, fontSize: 13, letterSpacing: '0.01em', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--acc)', flex: 'none' }} />
                        <span>{sec.title}</span>
                      </div>
                    )}
                    {sec.blocks.map((b, j) => b.k === 'p'
                      ? <p key={j} style={{ margin: 0, fontSize: 12, lineHeight: 1.75, color: 'var(--ink)', textWrap: 'pretty' }}><Rich html={b.html} /></p>
                      : (
                        <ul key={j} style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {b.items.map((t, m) => <li key={m} style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--ink)' }}><Rich html={t} /></li>)}
                        </ul>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : <div style={{ height: 16 }} />}
      </div>
    </div>
  );
}
