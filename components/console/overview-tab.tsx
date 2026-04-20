"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Activity, Boxes, Network, Coins } from "lucide-react"
import { StatCard } from "@/components/console/stat-card"
import { StatusDot } from "@/components/console/status-dot"
import { formatCost } from "@/lib/console/format"
import type {
  AppWithStatus,
  GpuStats,
  PortRow,
  TokenUsageSummary,
} from "@/lib/console/types"

interface Summary {
  system: { cpuPercent: number; memoryPercent: number; diskPercent: number }
  containerCount: number
  gpu: GpuStats
}

export function OverviewTab({ onJump }: { onJump: (tab: "apps" | "ports" | "resources" | "tokens") => void }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [apps, setApps] = useState<AppWithStatus[]>([])
  const [ports, setPorts] = useState<PortRow[]>([])
  const [tokens, setTokens] = useState<TokenUsageSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    try {
      const [s, a, p, t] = await Promise.all([
        fetch("/api/console/resources/summary", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/console/apps", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/console/ports", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/console/tokens", { cache: "no-store" }).then((r) =>
          r.ok ? r.json() : null,
        ),
      ])
      setSummary(s)
      setApps(a)
      setPorts(p)
      setTokens(t)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, 5000)
    return () => clearInterval(t)
  }, [fetchAll])

  if (loading || !summary) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const running = apps.filter((a) => a.status === "running").length
  const partial = apps.filter((a) => a.status === "partial").length
  const conflicts = ports.filter((p) => p.conflict).length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="CPU"
          value={`${summary.system.cpuPercent.toFixed(0)}%`}
          percent={summary.system.cpuPercent}
        />
        <StatCard
          label="Memory"
          value={`${summary.system.memoryPercent.toFixed(0)}%`}
          percent={summary.system.memoryPercent}
        />
        <StatCard
          label="Disk"
          value={`${summary.system.diskPercent.toFixed(0)}%`}
          percent={summary.system.diskPercent}
        />
        {summary.gpu.available ? (
          <StatCard
            label="GPU"
            value={`${(summary.gpu.utilizationPercent ?? 0).toFixed(0)}%`}
            hint={`${summary.gpu.usedVramMb}/${summary.gpu.totalVramMb} MB`}
            percent={summary.gpu.utilizationPercent}
          />
        ) : (
          <StatCard label="Containers" value={summary.containerCount} hint="running" />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SummaryCard
          icon={<Boxes className="w-4 h-4" />}
          title="Apps"
          primary={`${running} running`}
          secondary={`${apps.length} total · ${partial} partial`}
          onClick={() => onJump("apps")}
        >
          <div className="space-y-1.5 mt-3">
            {apps.slice(0, 5).map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <StatusDot status={a.status} />
                <span className="truncate flex-1">{a.name}</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {a.runningCount}/{a.totalCount}
                </span>
              </div>
            ))}
          </div>
        </SummaryCard>

        <SummaryCard
          icon={<Network className="w-4 h-4" />}
          title="Ports"
          primary={`${ports.length} declared`}
          secondary={
            conflicts > 0
              ? `${conflicts} conflict${conflicts === 1 ? "" : "s"}`
              : "No conflicts"
          }
          onClick={() => onJump("ports")}
        >
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3">
            {ports.slice(0, 8).map((p) => (
              <div key={p.hostPort} className="flex items-center gap-2 text-sm">
                <span className={`w-1.5 h-1.5 rounded-full ${p.conflict ? "bg-amber-400" : "bg-emerald-400/70"}`} />
                <span className="font-mono text-xs">{p.hostPort}</span>
                <span className="text-xs text-muted-foreground truncate flex-1">
                  {p.apps[0]?.appName}
                </span>
              </div>
            ))}
          </div>
        </SummaryCard>

        <SummaryCard
          icon={<Activity className="w-4 h-4" />}
          title="Containers"
          primary={`${summary.containerCount} live`}
          secondary={summary.gpu.available ? `GPU ${summary.gpu.utilizationPercent?.toFixed(0)}%` : "No GPU detected"}
          onClick={() => onJump("resources")}
        />

        <SummaryCard
          icon={<Coins className="w-4 h-4" />}
          title="Token usage"
          primary={tokens ? formatCost(tokens.totalCost) : "—"}
          secondary={tokens ? `${tokens.entryCount} entries` : "Tracker missing"}
          onClick={() => onJump("tokens")}
        />
      </div>
    </div>
  )
}

function SummaryCard({
  icon,
  title,
  primary,
  secondary,
  onClick,
  children,
}: {
  icon: React.ReactNode
  title: string
  primary: string
  secondary: string
  onClick: () => void
  children?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-xl border border-border bg-card/50 p-4 hover:bg-card/80 hover:border-primary/30 transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <p className="text-sm font-medium text-foreground">{title}</p>
        </div>
      </div>
      <div className="mt-2.5">
        <p className="text-2xl font-semibold tracking-tight">{primary}</p>
        <p className="text-xs text-muted-foreground">{secondary}</p>
      </div>
      {children}
    </button>
  )
}
