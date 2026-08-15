"use client"

import { OTHER_COLOR, SEQUENTIAL_HUE, CHART } from "./palette"

interface SparklineProps {
  values: number[]
  width?: number
  height?: number
}

// De-emphasis line with the current point in the accent hue (stat-tile trend spec).
export function Sparkline({ values, width = 96, height = 26 }: SparklineProps) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const pad = 4
  const step = (width - pad * 2) / (values.length - 1)
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2)
  const points = values.map((v, i) => `${pad + i * step},${y(v).toFixed(1)}`).join(" ")
  const lastX = pad + (values.length - 1) * step
  const lastY = y(values[values.length - 1])

  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={OTHER_COLOR}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.7}
      />
      {/* end marker with a surface ring so it reads over the line */}
      <circle cx={lastX} cy={lastY} r={4.5} fill={CHART.surface} />
      <circle cx={lastX} cy={lastY} r={3} fill={SEQUENTIAL_HUE} />
    </svg>
  )
}
