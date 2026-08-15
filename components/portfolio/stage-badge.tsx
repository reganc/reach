import { cn } from "@/lib/utils"
import { stageMeta } from "@/lib/projects/types"

export function StageBadge({ stage, className }: { stage: string; className?: string }) {
  const meta = stageMeta(stage)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        meta.accent,
        className,
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  )
}
