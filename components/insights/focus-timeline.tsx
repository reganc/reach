"use client"

import { useState } from "react"
import { CHART } from "./palette"
import { useMeasuredWidth } from "./use-measure"

export interface TimelineSeries {
  key: string
  label: string
  color: string
  /** Aligned with the weeks prop. */
  values: number[]
}

interface FocusTimelineProps {
  weeks: string[]
  series: TimelineSeries[]
}

const M = { top: 8, right: 8, bottom: 24, left: 40 }
const HEIGHT = 260
const SEG_GAP = 2
const MAX_BAR_W = 24

function niceCeil(v: number): number {
  if (v <= 0) return 4
  const pow = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pow >= v) return m * pow
  }
  return 10 * pow
}

/** Rect with only the top corners rounded — the 4px data-end cap. */
function topRoundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h, w / 2)
  return [
    `M${x},${y + h}`,
    `L${x},${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    `L${x + w - rr},${y}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `L${x + w},${y + h}`,
    "Z",
  ].join(" ")
}

function monthLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  })
}

function weekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function FocusTimeline({ weeks, series }: FocusTimelineProps) {
  const [wrapRef, width] = useMeasuredWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const innerW = Math.max(0, width - M.left - M.right)
  const innerH = HEIGHT - M.top - M.bottom

  const totals = weeks.map((_, i) =>
    series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0),
  )
  const yMax = niceCeil(Math.max(...totals, 1))
  const yScale = (v: number) => (v / yMax) * innerH

  const bandW = weeks.length > 0 ? innerW / weeks.length : 0
  const barW = Math.max(2, Math.min(MAX_BAR_W, bandW * 0.72))

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f))
  const uniqueTicks = [...new Set(ticks)]

  // Month labels at each month boundary, skipping collisions.
  const monthTicks: { i: number; label: string }[] = []
  let lastMonth = ""
  weeks.forEach((w, i) => {
    const m = w.slice(0, 7)
    if (m !== lastMonth) {
      lastMonth = m
      monthTicks.push({ i, label: monthLabel(w) })
    }
  })
  const minLabelGap = 34
  const visibleMonths = monthTicks.filter((t, idx, arr) => {
    if (idx === 0) return true
    return (t.i - arr[idx - 1].i) * bandW >= minLabelGap
  })

  const hoverRows = hover !== null
    ? [...series]
        .map((s) => ({ label: s.label, color: s.color, value: s.values[hover] ?? 0 }))
        .reverse() // top of the stack first
    : []

  const tooltipLeft = hover !== null
    ? Math.min(Math.max(M.left + hover * bandW + bandW / 2 - 90, 4), Math.max(4, width - 190))
    : 0

  return (
    <div ref={wrapRef} className="relative">
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label="Commits per week by app">
          {/* gridlines + y ticks */}
          {uniqueTicks.map((t) => {
            const y = M.top + innerH - yScale(t)
            return (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y} y2={y} stroke={CHART.grid} strokeWidth={1} />
                <text x={M.left - 8} y={y + 3.5} textAnchor="end" fontSize={10} fill={CHART.inkMuted}>
                  {t.toLocaleString("en-US")}
                </text>
              </g>
            )
          })}
          {/* baseline */}
          <line
            x1={M.left} x2={width - M.right}
            y1={M.top + innerH} y2={M.top + innerH}
            stroke={CHART.axis} strokeWidth={1}
          />
          {/* stacks */}
          {weeks.map((_, i) => {
            const x = M.left + i * bandW + (bandW - barW) / 2
            let cursor = M.top + innerH
            const segs: React.ReactNode[] = []
            let topIdx = -1
            for (let s = series.length - 1; s >= 0; s--) {
              if ((series[s].values[i] ?? 0) > 0) { topIdx = s; break }
            }
            series.forEach((s, sIdx) => {
              const v = s.values[i] ?? 0
              if (v <= 0) return
              const h = Math.max(1, yScale(v))
              const y = cursor - h
              const isTop = sIdx === topIdx
              segs.push(
                isTop && h >= 4 ? (
                  <path key={s.key} d={topRoundedRect(x, y, barW, h, 4)} fill={s.color} />
                ) : (
                  <rect key={s.key} x={x} y={y} width={barW} height={h} fill={s.color} />
                ),
              )
              cursor = y - SEG_GAP
            })
            return (
              <g key={i} opacity={hover === null || hover === i ? 1 : 0.45} style={{ transition: "opacity 120ms" }}>
                {segs}
              </g>
            )
          })}
          {/* month labels */}
          {visibleMonths.map((t) => (
            <text
              key={t.i}
              x={M.left + t.i * bandW + bandW / 2}
              y={HEIGHT - 8}
              textAnchor="middle"
              fontSize={10}
              fill={CHART.inkMuted}
            >
              {t.label}
            </text>
          ))}
          {/* hover hit bands — full column height, wider than the mark */}
          {weeks.map((_, i) => (
            <rect
              key={`hit-${i}`}
              x={M.left + i * bandW}
              y={M.top}
              width={bandW}
              height={innerH}
              fill={hover === i ? "rgba(255,255,255,0.04)" : "transparent"}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            />
          ))}
        </svg>
      )}

      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 w-[180px] rounded-lg border border-border bg-popover p-2.5 shadow-xl"
          style={{ left: tooltipLeft, top: 6 }}
        >
          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
            Week of {weekLabel(weeks[hover])} · {totals[hover].toLocaleString("en-US")} commits
          </p>
          <div className="space-y-1">
            {hoverRows.map((r) => (
              <div key={r.label} className="flex items-center gap-2 text-xs">
                <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: r.color }} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.label}</span>
                <span className="font-semibold tabular-nums">{r.value.toLocaleString("en-US")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* legend — always present (≥2 series) */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
