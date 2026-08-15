import { cn } from "@/lib/utils"
import type { HealthLevel } from "@/lib/projects/types"

const colorMap: Record<HealthLevel, string> = {
  healthy: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]",
  dirty: "bg-amber-400",
  stale: "bg-orange-400",
  attention: "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]",
  unknown: "bg-zinc-500/60",
}

const labelMap: Record<HealthLevel, string> = {
  healthy: "Healthy",
  dirty: "Uncommitted",
  stale: "Stale",
  attention: "Needs attention",
  unknown: "Unknown",
}

export function healthLabel(level: HealthLevel): string {
  return labelMap[level]
}

export function HealthDot({
  level,
  label = false,
}: {
  level: HealthLevel
  label?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1.5" title={labelMap[level]}>
      <span className={cn("w-2 h-2 rounded-full shrink-0", colorMap[level])} />
      {label && <span className="text-xs text-muted-foreground">{labelMap[level]}</span>}
    </span>
  )
}
