import { cn } from "@/lib/utils"
import type { AppStatus } from "@/lib/console/types"

const colorMap: Record<AppStatus, string> = {
  running: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]",
  partial: "bg-amber-400",
  stopped: "bg-zinc-500/60",
  unknown: "bg-zinc-500/60",
}

const labelMap: Record<AppStatus, string> = {
  running: "Running",
  partial: "Partial",
  stopped: "Stopped",
  unknown: "Unknown",
}

export function StatusDot({ status, label = false }: { status: AppStatus; label?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("w-2 h-2 rounded-full shrink-0", colorMap[status])} />
      {label && <span className="text-xs text-muted-foreground">{labelMap[status]}</span>}
    </span>
  )
}
