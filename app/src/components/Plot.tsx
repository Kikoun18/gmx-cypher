import { Fragment, useRef, useState } from 'react';
import { fmtValue, labelLeft, labelParts, shapePath, splitUnit, type buildPlotMulti } from '../lib/seq';
import { modKeyLabel, nearestIndex, pxToData, readout, roundToAxis, snapPoint, stepIndex } from '../lib/interact';

const mod = modKeyLabel();

export interface PlotLine { d: string; k: string; color: string; width: number; dash: string; op: number; shape?: number }
export interface PlotMarker { k: string; x: number; y: number; color: string; op: number; halo?: boolean; label?: string }

/** What the readout reads: each drawn curve's full data (R5a). */
export interface ReadSeries { label: string; color: string; rx: (number | null)[]; ry: (number | null)[]; uy?: (number | null)[] }

/**
 * The 16:10 dialog plot: grid, zero line, axes, curves, well markers, HTML tick labels. With `series`, hovering shows a
 * crosshair and each curve's value at its nearest data point (R5a); focused, ← and → step through the points, ↑ and ↓
 * change the curve, Home and End jump to the ends, and Esc puts the cursor away. The readout is announced.
 */
export function Plot({ g, W, H, lines, markers, yLabel, xLabel, series, onMark, refLines, onLine, exportKey }: {
  g: ReturnType<typeof buildPlotMulti>; W: number; H: number; lines: PlotLine[]; markers: PlotMarker[]; yLabel: string; xLabel: string; series?: ReadSeries[];
  /** A click (or Enter) marks a curve's data point (R5b); unset while marking isn't possible (read-only, laser on). */
  onMark?: (series: number, i: number) => void;
  /** Reference lines of this graph (R5c), and adding one: Ctrl/⌘+click (vertical), with Shift (horizontal), or Ctrl/⌘+Enter. */
  refLines?: { axis: 'x' | 'y'; v: number; label: string }[];
  onLine?: (axis: 'x' | 'y', v: number) => void;
  /** The export key and the format it exports (R8b), for the hints. */
  exportKey?: { key: string; format: string };
}) {
  const zeroY = g.inRangeZero ? g.zeroY : g.plotB;
  const [cur, setCur] = useState<{ x: number; k: number } | null>(null), [said, setSaid] = useState(''), svg = useRef<SVGSVGElement>(null);
  const mark = (k: number, i: number) => { if (!onMark || !series) return; onMark(k, i); setSaid('marked ' + series[k].label + ' at x = ' + fmtValue(series[k].rx[i] as number)); };
  const reads = cur && series?.length ? readout(series, cur.x, xLabel, yLabel) : [];
  const act = reads.find(r => r.series === cur?.k) ?? reads[0];
  const at = (e: { clientX: number; clientY: number }) => { const r = svg.current!.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H; return { px, py, ...pxToData(g, px, py) }; };
  const onMove = (e: React.PointerEvent) => {
    if (!series?.length) return;
    const p = at(e);
    if (p.px < g.plotL || p.px > g.plotR || p.py < g.plotT - 4 || p.py > g.plotB + 4) return;
    // The active curve is the one whose point is nearest the pointer's height.
    const rs = readout(series, p.x, xLabel, yLabel), near = rs.reduce((b, r) => (Math.abs(g.sy(r.y) - p.py) < Math.abs(g.sy(b.y) - p.py) ? r : b), rs[0]);
    setCur({ x: p.x, k: near ? near.series : 0 });
    setSaid('');
  };
  const line = (axis: 'x' | 'y', v: number) => { if (!onLine) return; onLine(axis, v); setSaid((axis === 'x' ? 'vertical line at x = ' : 'horizontal line at y = ') + fmtValue(v)); };
  const onClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const p = at(e);
      if (!onLine || p.px < g.plotL || p.px > g.plotR || p.py < g.plotT || p.py > g.plotB) return;
      line(e.shiftKey ? 'y' : 'x', e.shiftKey ? roundToAxis(p.y, g.lo, g.hi) : roundToAxis(p.x, g.x0, g.x1));
      return;
    }
    if (!series?.length || !onMark) return;
    const p = at(e), hit = snapPoint(series, g, p.px, p.py);
    if (hit) mark(hit.series, hit.i);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!series?.length) return;
    const k = cur ? Math.min(cur.k, series.length - 1) : 0, s = series[k];
    const first = stepIndex(s.ry, -1, 1), last = stepIndex(s.ry, s.ry.length, -1);
    const i = act && act.series === k ? act.i : nearestIndex(s.rx, s.ry, cur ? cur.x : (s.rx[first] as number));
    const go = (j: number, kk = k) => { e.preventDefault(); e.stopPropagation(); if (j >= 0 && j < series[kk].rx.length) setCur({ x: series[kk].rx[j] as number, k: kk }); };
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const dir = e.key === 'ArrowRight' ? 1 : -1; let j = cur ? i : first; if (cur) for (let n = 0; n < (e.shiftKey ? 10 : 1); n++) j = stepIndex(s.ry, j, dir); go(j); }
    else if (e.key === 'Home') go(first);
    else if (e.key === 'End') go(last);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); const kk = (k + (e.key === 'ArrowDown' ? 1 : series.length - 1)) % series.length; setCur({ x: cur ? cur.x : (series[kk].rx[stepIndex(series[kk].ry, -1, 1)] as number), k: kk }); }
    else if (e.key === 'Enter' && act && (e.ctrlKey || e.metaKey) && onLine) { e.preventDefault(); e.stopPropagation(); line(e.shiftKey ? 'y' : 'x', e.shiftKey ? act.y : act.x); }
    else if (e.key === 'Enter' && act && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); mark(act.series, act.i); }
    else if (e.key === 'Escape' && cur) { e.stopPropagation(); setCur(null); }
  };
  const ax = act ? g.sx(act.x) : 0, flip = act ? ax > (g.plotL + g.plotR) / 2 : false;
  return (
    <>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--mut)', paddingBottom: 6 }}><Rich s={yLabel} upper /></div>
      <div style={{ position: 'relative', maxWidth: 700, outlineOffset: 4, userSelect: series?.length ? 'none' : undefined }} tabIndex={series?.length ? 0 : undefined} role={series?.length ? 'group' : undefined}
        aria-label={series?.length ? 'Graph: hover or use the arrow keys to read values' : undefined} onKeyDown={onKey} onPointerMove={onMove} onClick={onClick} onPointerLeave={() => setCur(null)} onBlur={() => setCur(null)}>
        <svg ref={svg} viewBox={'0 0 ' + W + ' ' + H} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
          {g.yticks.map((t, i) => <line key={'y' + i} x1={g.plotL} x2={g.plotR} y1={t.y} y2={t.y} stroke="var(--line)" strokeWidth={1} />)}
          {g.xticks.map((t, i) => <line key={'x' + i} x1={t.x} x2={t.x} y1={g.plotT} y2={g.plotB + 5} stroke="var(--line)" strokeWidth={1} />)}
          <line x1={g.plotL} x2={g.plotR} y1={zeroY} y2={zeroY} stroke="var(--mut)" strokeWidth={1} strokeDasharray="2 3" />
          <line x1={g.plotL} x2={g.plotL} y1={g.plotT} y2={g.plotB} stroke="var(--rule)" strokeWidth={2} />
          <line x1={g.plotL} x2={g.plotR} y1={g.plotB} y2={g.plotB} stroke="var(--rule)" strokeWidth={2} />
          {lines.map((l, i) => <path key={i} d={l.d} fill="none" stroke={l.color} strokeWidth={l.width} strokeDasharray={l.dash === 'none' ? undefined : l.dash} strokeOpacity={l.op} strokeLinejoin="round" />)}
          {g.bars.map((bs, i) => bs.map((b, k) => <rect key={'b' + i + '-' + k} x={b.x} y={b.y} width={b.w} height={b.h} fill={lines[i]?.color} opacity={lines[i]?.op} />))}
          {g.points.map((ps, i) => ps.length > 0 && <path key={'p' + i} d={ps.map(([x, y]) => shapePath(lines[i]?.shape || 0, x, y)).join('')} fill={lines[i]?.color} fillOpacity={lines[i]?.op} />)}
          {(refLines || []).map((l, i) => {
            if (l.axis === 'x' ? l.v < Math.min(g.x0, g.x1) || l.v > Math.max(g.x0, g.x1) : l.v < g.lo || l.v > g.hi) return null;
            const p = l.axis === 'x' ? g.sx(l.v) : g.sy(l.v);
            return (
              <g key={'r' + i}>
                {l.axis === 'x' ? <line x1={p} x2={p} y1={g.plotT} y2={g.plotB} stroke="var(--mut)" strokeWidth={1} strokeDasharray="2 3" /> : <line x1={g.plotL} x2={g.plotR} y1={p} y2={p} stroke="var(--mut)" strokeWidth={1} strokeDasharray="2 3" />}
                <text x={l.axis === 'x' ? p + 5 : g.plotR - 4} y={l.axis === 'x' ? g.plotT + 10 : p - 4} textAnchor={l.axis === 'x' ? 'start' : 'end'} fontSize={10} fill="var(--mut)">{l.label}</text>
              </g>
            );
          })}
          {markers.map((m, i) => (
            <g key={i} opacity={m.op}>
              {m.halo && <circle cx={m.x} cy={m.y} r={6} fill="var(--bg)" />}
              <circle cx={m.x} cy={m.y} r={m.halo ? 4.5 : 3.5} fill={m.color} />
              {m.label && <text x={labelLeft(m.x, g.plotR) ? m.x - 8 : m.x + 8} y={m.y - 7} textAnchor={labelLeft(m.x, g.plotR) ? 'end' : 'start'} fontSize={11} fill="var(--ink)">{m.label}</text>}
            </g>
          ))}
        </svg>
        {/* The cursor draws on its own layer, so moving it doesn't repaint the curves. */}
        {act && (
          <svg viewBox={'0 0 ' + W + ' ' + H} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: 'auto', overflow: 'visible', pointerEvents: 'none', willChange: 'transform' }}>
            <line x1={ax} x2={ax} y1={g.plotT} y2={g.plotB} stroke="var(--mut)" strokeWidth={1} />
            {reads.map(r => <circle key={r.series} cx={g.sx(r.x)} cy={g.sy(r.y)} r={r.series === act.series ? 5 : 3.5} fill={r.color} stroke="var(--bg)" strokeWidth={1.5} />)}
          </svg>
        )}
        {act && (
          <div style={{ position: 'absolute', top: ((g.plotT + 6) / H * 100).toFixed(3) + '%', ...(flip ? { right: ((W - ax + 12) / W * 100).toFixed(3) + '%' } : { left: ((ax + 12) / W * 100).toFixed(3) + '%' }), pointerEvents: 'none',
            padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 11, lineHeight: 1.6, whiteSpace: 'nowrap', boxShadow: '0 6px 18px rgba(0,0,0,0.12)' }}>
            <div style={{ color: 'var(--mut)' }}>x = {fmtValue(act.x)}{act.xUnit ? ' ' + act.xUnit : ''}</div>
            {reads.slice(0, 8).map(r => (
              <div key={r.series} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: r.series === act.series ? 700 : 400 }}>
                <span style={{ width: 14, height: 2, background: r.color }} />
                <span>{r.label}{r.x !== act.x ? ' (x ' + fmtValue(r.x) + ')' : ''}</span>
                <span>{fmtValue(r.y)}{r.yUnit ? ' ' + r.yUnit : ''}{r.raw !== undefined ? ' · ' + fmtValue(r.raw) + ' before smoothing' : ''}</span>
              </div>
            ))}
            {reads.length > 8 && <div style={{ color: 'var(--mut)' }}>+ {reads.length - 8} more</div>}
          </div>
        )}
        {g.yticks.map((t, i) => (
          <span key={'yl' + i} style={{ position: 'absolute', left: ((g.plotL - 8) / W * 100).toFixed(3) + '%', top: (t.y / H * 100).toFixed(3) + '%', transform: 'translate(-100%, -50%)', fontSize: 11, color: 'var(--mut)' }}>{t.label}</span>
        ))}
        {g.xticks.map((t, i) => (
          <span key={'xl' + i} style={{ position: 'absolute', left: (t.x / W * 100).toFixed(3) + '%', top: ((g.plotB + 7) / H * 100).toFixed(3) + '%', transform: 'translate(-50%, 0)', fontSize: 11, color: 'var(--mut)' }}>{t.label}</span>
        ))}
      </div>
      <div style={{ maxWidth: 700, textAlign: 'right', fontSize: 10, letterSpacing: '0.1em', color: 'var(--mut)', paddingTop: 4 }}><Rich s={xLabel} upper /></div>
      {series && series.length > 0 && <div role="status" aria-label="Graph readout" style={{ maxWidth: 700, minHeight: 16, fontSize: 11, color: 'var(--mut)' }}>{said || (act ? act.text : '')}</div>}
      {series && series.length > 0 && (
        <div style={{ maxWidth: 700, fontSize: 10, color: 'var(--mut)', lineHeight: 2 }}>
          hover to read values{exportKey ? <> · <kbd>{exportKey.key}</kbd> export ({exportKey.format})</> : ''}{onMark ? ' · click: mark the nearest point' : ''}{onLine ? <> · <kbd>{mod}</kbd>+click: vertical line · <kbd>{mod}</kbd>+<kbd>Shift</kbd>+click: horizontal line</> : ''} · graph focused: <kbd>←</kbd><kbd>→</kbd> step points (<kbd>Shift</kbd> ×10) · <kbd>↑</kbd><kbd>↓</kbd> change curve · <kbd>Home</kbd><kbd>End</kbd>{onMark ? <> · <kbd>Enter</kbd> mark</> : ''}{onLine ? <> · <kbd>{mod}</kbd>+<kbd>Enter</kbd> / <kbd>{mod}</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd> line</> : ''} · <kbd>Esc</kbd> hide
        </div>
      )}
    </>
  );
}

/** A label with ^{…} and _{…} drawn as super- and subscripts; `upper` capitalises its Latin letters but not its unit (F109: "DENSITY (kg m⁻³)"). */
export function Rich({ s, upper }: { s: string; upper?: boolean }) {
  const [name, unit] = upper ? splitUnit(s) : [s, ''];
  const runs = (t: string, up: boolean) => labelParts(t).map((p, i) => {
    // Only Latin letters: a Greek symbol (ξ is not Ξ) and µ keep their case, like the unit.
    const v = up ? p.t.replace(/[a-zà-öø-þ]+/g, m => m.toUpperCase()) : p.t;
    return p.v > 0 ? <sup key={i}>{v}</sup> : p.v < 0 ? <sub key={i}>{v}</sub> : <Fragment key={i}>{v}</Fragment>;
  });
  return <>{runs(name, !!upper)}{runs(unit, false)}</>;
}
