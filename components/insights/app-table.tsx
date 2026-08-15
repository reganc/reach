"use client"

import { formatRelative } from "@/lib/console/format"
import type { AppInsight } from "@/lib/insights/types"
import { Sparkline } from "./sparkline"

export interface TableApp extends AppInsight {
  rangeCommits: number
  rangeWeekly: number[]
}

interface AppTableProps {
  apps: TableApp[]
}

function RunningDot({ runtime }: { runtime: AppInsight["runtime"] }) {
  if (runtime.totalContainers === 0) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  const up = runtime.runningContainers > 0
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: up ? "#0ca30c" : "#52514e" }}
      />
      <span className={up ? "" : "text-muted-foreground"}>
        {runtime.runningContainers}/{runtime.totalContainers} up
      </span>
    </span>
  )
}

export function AppTable({ apps }: AppTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">App</th>
            <th className="py-2 pr-3 font-medium">Purpose</th>
            <th className="py-2 pr-3 text-right font-medium">Commits</th>
            <th className="py-2 pr-3 font-medium">Trend</th>
            <th className="py-2 pr-3 font-medium">Last commit</th>
            <th className="py-2 pr-3 font-medium">Last started</th>
            <th className="py-2 font-medium">Containers</th>
          </tr>
        </thead>
        <tbody>
          {apps.map((a) => {
            const purpose = a.summary ?? a.detectedDescription
            return (
              <tr key={a.slug} className="border-b border-border/50 align-top hover:bg-accent/40">
                <td className="max-w-[180px] py-2.5 pr-3">
                  <p className="truncate font-medium" title={a.slug}>{a.displayName}</p>
                  <p className="text-xs text-muted-foreground">{a.language !== "unknown" ? a.language : ""}</p>
                </td>
                <td className="max-w-[420px] py-2.5 pr-3">
                  {purpose ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground" title={purpose}>
                      {purpose}
                      {a.summaryStale && a.summary && (
                        <span className="ml-1.5 text-[10px] text-amber-400/80">stale</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs italic text-muted-foreground/60">No summary yet</p>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">
                  {a.rangeCommits.toLocaleString("en-US")}
                </td>
                <td className="py-2.5 pr-3">
                  <Sparkline values={a.rangeWeekly} />
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-muted-foreground">
                  {a.lastCommitAt ? formatRelative(a.lastCommitAt) : "—"}
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-muted-foreground">
                  {a.runtime.lastStartedAt ? formatRelative(a.runtime.lastStartedAt) : "—"}
                </td>
                <td className="py-2.5">
                  <RunningDot runtime={a.runtime} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {apps.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">No apps match.</p>
      )}
    </div>
  )
}
