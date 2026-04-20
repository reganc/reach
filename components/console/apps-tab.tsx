"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Play,
  Square,
  RotateCw,
  ExternalLink,
  Loader2,
  RefreshCw,
  Terminal,
  Search,
  Layers,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { StatusDot } from "@/components/console/status-dot"
import type { AppWithStatus } from "@/lib/console/types"

type Action = "start" | "stop" | "restart"

export function AppsTab() {
  const [apps, setApps] = useState<AppWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<Record<string, Action | undefined>>({})
  const [filter, setFilter] = useState("")
  const [logsApp, setLogsApp] = useState<AppWithStatus | null>(null)

  const fetchApps = useCallback(async (force = false) => {
    if (force) setRefreshing(true)
    try {
      const res = await fetch(force ? "/api/console/apps/scan" : "/api/console/apps", {
        method: force ? "POST" : "GET",
        cache: "no-store",
      })
      if (res.ok) {
        const data = await res.json()
        setApps(force ? data.apps : data)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchApps()
    const t = setInterval(() => fetchApps(false), 6000)
    return () => clearInterval(t)
  }, [fetchApps])

  async function runAction(id: string, action: Action) {
    setBusy((b) => ({ ...b, [id]: action }))
    try {
      await fetch(`/api/console/apps/${id}/${action}`, { method: "POST" })
      await fetchApps(false)
    } finally {
      setBusy((b) => ({ ...b, [id]: undefined }))
    }
  }

  const filtered = apps.filter((a) =>
    a.name.toLowerCase().includes(filter.toLowerCase()),
  )
  const runningCount = apps.filter((a) => a.status === "running").length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            <span className="text-foreground font-medium">{runningCount}</span> running
            <span className="mx-1.5">·</span>
            {apps.length} total
          </p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter apps…"
              className="pl-8 h-8 w-56"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchApps(true)}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Rescan
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <p className="text-sm font-medium">No apps found</p>
          <p className="text-xs text-muted-foreground">
            {apps.length === 0
              ? "No docker-compose files discovered in /home/regan/apps"
              : "Try a different filter"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">App</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Services</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Ports</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((app, i) => {
                const isBusy = busy[app.id]
                return (
                  <tr
                    key={app.id}
                    className={`${i < filtered.length - 1 ? "border-b border-border" : ""} hover:bg-muted/20 transition-colors`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <StatusDot status={app.status} />
                        <span className="font-medium">{app.name}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{app.runningCount}/{app.totalCount} running</span>
                        {app.uiUrl && (
                          <>
                            <span>·</span>
                            <a
                              href={app.uiUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                            >
                              {app.uiUrl.replace("http://", "")}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {app.services.slice(0, 4).map((s) => (
                          <Badge key={s.name} variant="outline" className="font-normal">
                            {s.name}
                          </Badge>
                        ))}
                        {app.services.length > 4 && (
                          <Badge variant="outline" className="font-normal">
                            +{app.services.length - 4}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                      {app.ports.length === 0
                        ? "—"
                        : app.ports
                            .map((p) => `${p.hostPort}→${p.containerPort}`)
                            .slice(0, 3)
                            .join(", ")}
                      {app.ports.length > 3 && ` +${app.ports.length - 3}`}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <ActionButton
                          icon={<Play className="w-3.5 h-3.5" />}
                          label="Start"
                          loading={isBusy === "start"}
                          disabled={!!isBusy}
                          onClick={() => runAction(app.id, "start")}
                        />
                        <ActionButton
                          icon={<RotateCw className="w-3.5 h-3.5" />}
                          label="Restart"
                          loading={isBusy === "restart"}
                          disabled={!!isBusy}
                          onClick={() => runAction(app.id, "restart")}
                        />
                        <ActionButton
                          icon={<Square className="w-3.5 h-3.5" />}
                          label="Stop"
                          loading={isBusy === "stop"}
                          disabled={!!isBusy}
                          onClick={() => runAction(app.id, "stop")}
                          tone="destructive"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Logs"
                          onClick={() => setLogsApp(app)}
                        >
                          <Terminal className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {logsApp && <LogsDrawer app={logsApp} onClose={() => setLogsApp(null)} />}
    </div>
  )
}

function ActionButton({
  icon,
  label,
  loading,
  disabled,
  onClick,
  tone = "default",
}: {
  icon: React.ReactNode
  label: string
  loading?: boolean
  disabled?: boolean
  onClick: () => void
  tone?: "default" | "destructive"
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className={`h-7 w-7 ${tone === "destructive" ? "text-muted-foreground hover:text-destructive" : "text-muted-foreground hover:text-foreground"}`}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
    </Button>
  )
}

function LogsDrawer({ app, onClose }: { app: AppWithStatus; onClose: () => void }) {
  const [logs, setLogs] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [lines, setLines] = useState(200)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/console/apps/${app.id}/logs?lines=${lines}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs)
      }
    } finally {
      setLoading(false)
    }
  }, [app.id, lines])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  return (
    <div
      className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl h-full bg-card border-l border-border flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 h-12 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">{app.name}</h2>
            <span className="text-xs text-muted-foreground">logs</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={lines}
              onChange={(e) => setLines(Number(e.target.value))}
              className="bg-muted text-xs rounded-md border border-border px-2 py-1"
            >
              <option value={100}>100 lines</option>
              <option value={200}>200 lines</option>
              <option value={500}>500 lines</option>
              <option value={1000}>1000 lines</option>
            </select>
            <Button size="sm" variant="ghost" onClick={fetchLogs} disabled={loading}>
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Refresh
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto px-4 py-3 text-xs font-mono leading-relaxed text-foreground/80 whitespace-pre-wrap break-all">
          {loading ? "Loading…" : logs || "No logs"}
        </pre>
      </div>
    </div>
  )
}
