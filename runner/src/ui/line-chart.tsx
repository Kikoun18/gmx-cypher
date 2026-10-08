import * as React from "react"

import { cn } from "../lib/utils"
import { TONES, toneVar, type Tone } from "../lib/tones"

/** Dash patterns for the curves of one series, in order (the codebase's DASH list). */
export const DASH = ["none", "5 4", "2 3", "8 3 2 3", "1 3", "10 4", "4 2 1 2", "6 6", "3 5", "12 3 3 3"]

export interface ChartSeries {
  label: string
  points: [number, number][]
  /** Column hue; defaults to palette order by index. */
  tone?: Tone
  /** Index into DASH (0 = solid). */
  dash?: number
  /** `dim` draws at 40%, `off` at 15%. */
  state?: "on" | "dim" | "off"
  /** Mark the curve's maximum or minimum with a dot. */
  marker?: "max" | "min"
  /** Write the marked point's x or y next to the dot. */
  markerLabel?: "x" | "y"
}

export interface LineChartProps extends Omit<React.ComponentProps<"figure">, "children"> {
  series: ChartSeries[]
  xLabel?: string
  yLabel?: string
  height?: number
  xDomain?: [number, number]
  yDomain?: [number, number]
  /** A dashed rule at y = 0. */
  zeroLine?: boolean
  legend?: boolean
}

function niceTicks(min: number, max: number, count = 5) {
  if (min === max) {
    min -= 1
    max += 1
  }
  const raw = (max - min) / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const err = raw / mag
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag
  const ticks: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(+v.toFixed(10))
  return { ticks, decimals: Math.max(0, -Math.floor(Math.log10(step) + 1e-9)) }
}

function useWidth(fallback: number) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [w, setW] = React.useState(fallback)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(([e]) => setW(Math.max(160, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

const OPACITY = { on: 1, dim: 0.4, off: 0.15 }

function LineChart({
  series,
  xLabel,
  yLabel,
  height = 240,
  xDomain,
  yDomain,
  zeroLine = true,
  legend = true,
  className,
  ...props
}: LineChartProps) {
  const [ref, width] = useWidth(560)
  const m = { l: 44, r: 16, t: yLabel ? 22 : 10, b: xLabel ? 40 : 26 }
  const all = series.flatMap((s) => s.points)
  const xs = all.map((p) => p[0]),
    ys = all.map((p) => p[1])
  const x0 = xDomain?.[0] ?? Math.min(...xs),
    x1 = xDomain?.[1] ?? Math.max(...xs)
  let y0 = yDomain?.[0] ?? Math.min(...ys),
    y1 = yDomain?.[1] ?? Math.max(...ys)
  if (!yDomain) {
    if (zeroLine) {
      y0 = Math.min(0, y0)
      y1 = Math.max(0, y1)
    }
    // Room for marker labels: below the lowest point for minima, above the highest for maxima.
    const pad = (y1 - y0) * 0.06 || 1
    const labelled = (k: "min" | "max") => series.some((s) => s.marker === k && s.markerLabel)
    y0 -= y0 < 0 || labelled("min") ? pad * (labelled("min") ? 2 : 1) : 0
    y1 += pad * (labelled("max") ? 2 : 1)
  }
  const W = width - m.l - m.r,
    H = height - m.t - m.b
  const sx = (v: number) => m.l + ((v - x0) / (x1 - x0 || 1)) * W
  const sy = (v: number) => m.t + H - ((v - y0) / (y1 - y0 || 1)) * H
  const xt = niceTicks(x0, x1, Math.max(3, Math.round(W / 90)))
  const yt = niceTicks(y0, y1, Math.max(3, Math.round(H / 48)))
  const toneOf = (s: ChartSeries, i: number) => s.tone ?? TONES[i % TONES.length]

  return (
    <figure data-slot="line-chart" className={cn("m-0 flex flex-col gap-2", className)} {...props}>
      <div ref={ref} className="w-full">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block overflow-visible" role="img"
          aria-label={[yLabel, xLabel].filter(Boolean).join(" against ") || "Line chart"}>
          {yLabel && (
            <text x={0} y={10} className="fill-muted-foreground text-label uppercase">{yLabel}</text>
          )}
          {xt.ticks.map((t) => (
            <line key={"gx" + t} x1={sx(t)} x2={sx(t)} y1={m.t} y2={m.t + H} className="stroke-border" strokeWidth={1} />
          ))}
          {yt.ticks.map((t) => (
            <line key={"gy" + t} x1={m.l} x2={m.l + W} y1={sy(t)} y2={sy(t)} className="stroke-border" strokeWidth={1} />
          ))}
          {zeroLine && y0 < 0 && y1 > 0 && (
            <line x1={m.l} x2={m.l + W} y1={sy(0)} y2={sy(0)} className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="3 3" />
          )}
          <path d={`M${m.l},${m.t} V${m.t + H} H${m.l + W}`} fill="none" className="stroke-foreground" strokeWidth={1.5} />
          {xt.ticks.map((t) => (
            <text key={"tx" + t} x={sx(t)} y={m.t + H + 16} textAnchor="middle" className="fill-muted-foreground text-caption">
              {t.toFixed(xt.decimals)}
            </text>
          ))}
          {yt.ticks.map((t) => (
            <text key={"ty" + t} x={m.l - 8} y={sy(t) + 4} textAnchor="end" className="fill-muted-foreground text-caption">
              {t.toFixed(yt.decimals)}
            </text>
          ))}
          {xLabel && (
            <text x={m.l + W} y={height - 2} textAnchor="end" className="fill-muted-foreground text-label uppercase">{xLabel}</text>
          )}
          {series.map((s, i) => {
            const c = toneVar(toneOf(s, i))
            const d = s.points.map((p, j) => (j ? "L" : "M") + sx(p[0]).toFixed(1) + "," + sy(p[1]).toFixed(1)).join("")
            let mk: [number, number] | null = null
            if (s.marker && s.points.length)
              mk = s.points.reduce((a, p) => ((s.marker === "max" ? p[1] > a[1] : p[1] < a[1]) ? p : a))
            return (
              <g key={i} opacity={OPACITY[s.state ?? "on"]}>
                <path d={d} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                  strokeDasharray={DASH[(s.dash ?? 0) % DASH.length]} />
                {mk && (
                  <g>
                    <circle cx={sx(mk[0])} cy={sy(mk[1])} r={4} fill={c} />
                    {s.markerLabel && (
                      <text x={sx(mk[0]) + 8} y={sy(mk[1]) + (s.marker === "min" ? 16 : -8)} className="fill-foreground stroke-background text-caption [paint-order:stroke] [stroke-linejoin:round] [stroke-width:3px]">
                        {(s.markerLabel === "x" ? mk[0] : mk[1]).toFixed(s.markerLabel === "x" ? xt.decimals + 1 : yt.decimals + 1)}
                      </text>
                    )}
                  </g>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      {legend && (
        <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
          {series.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-2" style={{ opacity: OPACITY[s.state ?? "on"] }}>
              <svg width={22} height={4} aria-hidden>
                <line x1={1} x2={21} y1={2} y2={2} stroke={toneVar(toneOf(s, i))} strokeWidth={2.5} strokeLinecap="round"
                  strokeDasharray={DASH[(s.dash ?? 0) % DASH.length]} />
              </svg>
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  )
}

export { LineChart }
