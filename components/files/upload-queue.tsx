"use client"

import { CheckCircle2, Loader2, X, AlertCircle, ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/lib/console/format"
import type { UploadItem } from "./use-uploads"

interface UploadQueueProps {
  items: UploadItem[]
  onCancel: (id: string) => void
  onClear: () => void
}

export function UploadQueue({ items, onCancel, onClear }: UploadQueueProps) {
  const [collapsed, setCollapsed] = useState(false)
  if (items.length === 0) return null

  const active = items.filter((i) => i.status === "uploading" || i.status === "queued").length
  const done = items.filter((i) => i.status === "done").length
  const failed = items.filter((i) => i.status === "error").length
  const allFinished = active === 0

  return (
    <div className="fixed bottom-6 right-6 z-40 w-80 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 h-11 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-medium">
          {active > 0 ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span>
                Uploading {done}/{items.length}
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className={cn("w-3.5 h-3.5", failed > 0 ? "text-amber-400" : "text-emerald-400")} />
              <span>
                {done} uploaded{failed > 0 ? `, ${failed} failed` : ""}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {allFinished && (
            <button
              onClick={onClear}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="max-h-72 overflow-y-auto divide-y divide-border">
          {items.map((item) => {
            const pct = item.size > 0 ? Math.min(100, Math.round((item.loaded / item.size) * 100)) : item.status === "done" ? 100 : 0
            return (
              <div key={item.id} className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" title={item.relPath}>
                      {item.finalName && item.finalName !== item.relPath.split("/").pop()
                        ? `${item.relPath} → ${item.finalName}`
                        : item.relPath}
                    </p>
                  </div>
                  <StatusIcon item={item} onCancel={onCancel} />
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-150",
                        item.status === "error" && "bg-destructive",
                        item.status === "canceled" && "bg-muted-foreground/40",
                        item.status === "done" && "bg-emerald-400",
                        (item.status === "uploading" || item.status === "queued") && "bg-primary",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground w-20 text-right">
                    {item.status === "error"
                      ? "failed"
                      : item.status === "canceled"
                        ? "canceled"
                        : item.status === "done"
                          ? formatBytes(item.size)
                          : `${formatBytes(item.loaded)} / ${formatBytes(item.size)}`}
                  </span>
                </div>
                {item.status === "error" && item.error && (
                  <p className="mt-1 text-[10px] text-destructive truncate" title={item.error}>
                    {item.error}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusIcon({ item, onCancel }: { item: UploadItem; onCancel: (id: string) => void }) {
  if (item.status === "done") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
  if (item.status === "error") return <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
  if (item.status === "canceled") return <X className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
  return (
    <button
      onClick={() => onCancel(item.id)}
      className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0"
      title="Cancel"
    >
      <X className="w-3.5 h-3.5" />
    </button>
  )
}
