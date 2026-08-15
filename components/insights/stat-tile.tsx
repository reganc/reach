"use client"

interface StatTileProps {
  label: string
  value: string
  /** e.g. "+34 vs prior period" — already signed and phrased. */
  delta?: { text: string; positive: boolean } | null
  sub?: string
}

export function StatTile({ label, value, delta, sub }: StatTileProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {delta ? (
        <p
          className="mt-0.5 text-xs"
          style={{ color: delta.positive ? "#0ca30c" : "#e66767" }}
        >
          {delta.text}
        </p>
      ) : sub ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      ) : null}
    </div>
  )
}
