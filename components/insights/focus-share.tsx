"use client"

import { OTHER_COLOR, SEQUENTIAL_HUE } from "./palette"

export interface ShareRow {
  label: string
  value: number
  isOther?: boolean
}

interface FocusShareProps {
  rows: ShareRow[]
  total: number
}

// Magnitude comparison → single hue, fully direct-labeled (no tooltip needed).
export function FocusShare({ rows, total }: FocusShareProps) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const pct = total > 0 ? Math.round((r.value / total) * 100) : 0
        return (
          <div key={r.label} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-xs text-muted-foreground" title={r.label}>
              {r.label}
            </span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(57,135,229,0.10)" }}>
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${(r.value / max) * 100}%`,
                  background: r.isOther ? OTHER_COLOR : SEQUENTIAL_HUE,
                }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-xs tabular-nums">
              <span className="font-semibold">{r.value.toLocaleString("en-US")}</span>
              <span className="text-muted-foreground"> · {pct}%</span>
            </span>
          </div>
        )
      })}
      {rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">No commits in this period.</p>
      )}
    </div>
  )
}
