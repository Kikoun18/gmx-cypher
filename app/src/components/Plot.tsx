import { labelLeft, type buildPlotMulti } from '../lib/seq';

export interface PlotLine { d: string; k: string; color: string; width: number; dash: string; op: number }
export interface PlotMarker { k: string; x: number; y: number; color: string; op: number; halo?: boolean; label?: string }

/** The 16:10 dialog plot: grid, zero line, axes, curves, well markers, HTML tick labels. */
export function Plot({ g, W, H, lines, markers, yLabel, xLabel }: {
  g: ReturnType<typeof buildPlotMulti>; W: number; H: number; lines: PlotLine[]; markers: PlotMarker[]; yLabel: string; xLabel: string;
}) {
  const zeroY = g.inRangeZero ? g.zeroY : g.plotB;
  return (
    <>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mut)', paddingBottom: 6 }}>{yLabel}</div>
      <div style={{ position: 'relative', maxWidth: 700 }}>
        <svg viewBox={'0 0 ' + W + ' ' + H} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
          {g.yticks.map((t, i) => <line key={'y' + i} x1={g.plotL} x2={g.plotR} y1={t.y} y2={t.y} stroke="var(--line)" strokeWidth={1} />)}
          {g.xticks.map((t, i) => <line key={'x' + i} x1={t.x} x2={t.x} y1={g.plotT} y2={g.plotB + 5} stroke="var(--line)" strokeWidth={1} />)}
          <line x1={g.plotL} x2={g.plotR} y1={zeroY} y2={zeroY} stroke="var(--mut)" strokeWidth={1} strokeDasharray="2 3" />
          <line x1={g.plotL} x2={g.plotL} y1={g.plotT} y2={g.plotB} stroke="var(--rule)" strokeWidth={2} />
          <line x1={g.plotL} x2={g.plotR} y1={g.plotB} y2={g.plotB} stroke="var(--rule)" strokeWidth={2} />
          {lines.map((l, i) => <path key={i} d={l.d} fill="none" stroke={l.color} strokeWidth={l.width} strokeDasharray={l.dash === 'none' ? undefined : l.dash} strokeOpacity={l.op} strokeLinejoin="round" />)}
          {markers.map((m, i) => (
            <g key={i} opacity={m.op}>
              {m.halo && <circle cx={m.x} cy={m.y} r={6} fill="var(--bg)" />}
              <circle cx={m.x} cy={m.y} r={m.halo ? 4.5 : 3.5} fill={m.color} />
              {m.label && <text x={labelLeft(m.x, g.plotR) ? m.x - 8 : m.x + 8} y={m.y - 7} textAnchor={labelLeft(m.x, g.plotR) ? 'end' : 'start'} fontSize={11} fill="var(--ink)">{m.label}</text>}
            </g>
          ))}
        </svg>
        {g.yticks.map((t, i) => (
          <span key={'yl' + i} style={{ position: 'absolute', left: ((g.plotL - 8) / W * 100).toFixed(3) + '%', top: (t.y / H * 100).toFixed(3) + '%', transform: 'translate(-100%, -50%)', fontSize: 11, color: 'var(--mut)' }}>{t.label}</span>
        ))}
        {g.xticks.map((t, i) => (
          <span key={'xl' + i} style={{ position: 'absolute', left: (t.x / W * 100).toFixed(3) + '%', top: ((g.plotB + 7) / H * 100).toFixed(3) + '%', transform: 'translate(-50%, 0)', fontSize: 11, color: 'var(--mut)' }}>{t.label}</span>
        ))}
      </div>
      <div style={{ maxWidth: 700, textAlign: 'right', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mut)', paddingTop: 4 }}>{xLabel}</div>
    </>
  );
}
