"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw, Cpu, MemoryStick, HardDrive, Zap, Server } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatCard } from "@/components/console/stat-card"
import { formatBytes } from "@/lib/console/format"
import type { ContainerStats, GpuStats, SystemStats } from "@/lib/console/types"

interface ResourceData {
  system: SystemStats
  gpu: GpuStats
  containers: ContainerStats[]
}

export function ResourcesTab() {
  const [data, setData] = useState<ResourceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAll = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    try {
      const [s, g, c] = await Promise.all([
        fetch("/api/console/resources/system", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/console/resources/gpu", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/console/resources/containers", { cache: "no-store" }).then((r) => r.json()),
      ])
      setData({ system: s, gpu: g, containers: c })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const t = setInterval(() => fetchAll(false), 5000)
    return () => clearInterval(t)
  }, [fetchAll])

  if (loading || !data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const { system, gpu, containers } = data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
          <StatCard
            label="CPU"
            value={`${system.cpuPercent.toFixed(1)}%`}
            hint={`${system.cpuCount} cores · load ${system.loadAvg[0].toFixed(2)}`}
            percent={system.cpuPercent}
          />
          <StatCard
            label="Memory"
            value={`${system.memoryPercent.toFixed(0)}%`}
            hint={`${formatBytes(system.memoryUsed)} / ${formatBytes(system.memoryTotal)}`}
            percent={system.memoryPercent}
          />
          <StatCard
            label="Disk"
            value={`${system.diskPercent.toFixed(0)}%`}
            hint={`${formatBytes(system.diskUsed)} / ${formatBytes(system.diskTotal)}`}
            percent={system.diskPercent}
          />
          {gpu.available ? (
            <StatCard
              label="GPU"
              value={`${(gpu.utilizationPercent ?? 0).toFixed(0)}%`}
              hint={`${gpu.usedVramMb}/${gpu.totalVramMb} MB · ${gpu.temperatureC?.toFixed(0)}°C`}
              percent={gpu.utilizationPercent}
            />
          ) : (
            <StatCard label="GPU" value="—" hint="No GPU detected" />
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="ml-3"
          onClick={() => fetchAll(true)}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      {gpu.available && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-medium">{gpu.name}</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Field label="Utilization" value={`${gpu.utilizationPercent?.toFixed(0)}%`} />
            <Field label="VRAM" value={`${gpu.usedVramMb} / ${gpu.totalVramMb} MB`} />
            <Field label="Temp" value={`${gpu.temperatureC?.toFixed(0)}°C`} />
            <Field
              label="Power"
              value={gpu.powerDrawW != null ? `${gpu.powerDrawW.toFixed(0)} W` : "—"}
            />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 h-11 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Containers</h3>
            <span className="text-xs text-muted-foreground">{containers.length} running</span>
          </div>
        </div>
        {containers.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No running containers</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Image</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-20">CPU</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-32">Memory</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-28 hidden lg:table-cell">Net I/O</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-16 hidden lg:table-cell">PIDs</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((c, i) => (
                <tr
                  key={c.containerId}
                  className={`${i < containers.length - 1 ? "border-b border-border" : ""} hover:bg-muted/20 transition-colors`}
                >
                  <td className="px-4 py-2.5 font-medium">{c.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                    <span className="truncate max-w-[280px] inline-block align-middle">{c.image}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    <CpuBar value={c.cpuPercent} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    <span>{formatBytes(c.memoryUsage)}</span>
                    <span className="text-muted-foreground ml-1.5">{c.memoryPercent.toFixed(0)}%</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground hidden lg:table-cell">
                    ↓{formatBytes(c.networkRx)} ↑{formatBytes(c.networkTx)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground hidden lg:table-cell">
                    {c.pids}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-base font-medium">{value}</p>
    </div>
  )
}

function CpuBar({ value }: { value: number }) {
  const tone = value >= 90 ? "bg-rose-500" : value >= 60 ? "bg-amber-500" : "bg-emerald-500"
  return (
    <div className="flex items-center gap-2 justify-end">
      <span>{value.toFixed(1)}%</span>
      <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  )
}
