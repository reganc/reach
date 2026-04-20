import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: string | number
  hint?: string
  percent?: number
  tone?: "default" | "good" | "warn" | "bad"
}

const toneBar: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-primary",
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-rose-500",
}

function pickTone(percent: number | undefined): NonNullable<StatCardProps["tone"]> {
  if (percent === undefined) return "default"
  if (percent >= 90) return "bad"
  if (percent >= 70) return "warn"
  return "good"
}

export function StatCard({ label, value, hint, percent, tone }: StatCardProps) {
  const finalTone = tone ?? pickTone(percent)
  return (
    <div className="rounded-xl border border-border bg-card/50 p-4 flex flex-col gap-2">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {percent !== undefined && (
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full transition-all duration-500", toneBar[finalTone])}
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
