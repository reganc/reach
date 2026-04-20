"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw, Search, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import type { PortRow } from "@/lib/console/types"

export function PortsTab() {
  const [rows, setRows] = useState<PortRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("")

  const fetchPorts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/console/ports", { cache: "no-store" })
      if (res.ok) setRows(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPorts()
  }, [fetchPorts])

  const filtered = rows.filter((r) => {
    if (!filter) return true
    const f = filter.toLowerCase()
    return (
      String(r.hostPort).includes(f) ||
      r.apps.some((a) => a.appName.toLowerCase().includes(f) || a.serviceName.toLowerCase().includes(f))
    )
  })

  const conflicts = rows.filter((r) => r.conflict)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground font-medium">{rows.length}</span> ports declared
          {conflicts.length > 0 && (
            <>
              <span className="mx-1.5">·</span>
              <span className="text-amber-400 inline-flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"}
              </span>
            </>
          )}
        </p>
        <div className="flex items-center gap-2 ml-auto">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter port or app…"
              className="pl-8 h-8 w-56"
            />
          </div>
          <Button size="sm" variant="outline" onClick={fetchPorts} disabled={loading}>
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <p className="text-sm font-medium">No ports</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-24">Host port</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">App</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Service</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">→ Container</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr
                  key={row.hostPort}
                  className={`${i < filtered.length - 1 ? "border-b border-border" : ""} ${row.conflict ? "bg-amber-500/5" : "hover:bg-muted/20"} transition-colors`}
                >
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-2">
                      <a
                        href={`http://localhost:${row.hostPort}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono font-medium text-foreground hover:text-primary"
                      >
                        {row.hostPort}
                      </a>
                      {row.conflict && (
                        <Badge variant="destructive" className="text-[10px]">
                          conflict
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {row.apps.map((a) => (
                      <div key={`${a.appId}-${a.serviceName}`} className="text-sm">
                        {a.appName}
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground hidden md:table-cell">
                    {row.apps.map((a) => (
                      <div key={`${a.appId}-${a.serviceName}-svc`}>{a.serviceName}</div>
                    ))}
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground font-mono text-xs hidden lg:table-cell">
                    {row.apps.map((a) => (
                      <div key={`${a.appId}-${a.serviceName}-cp`}>
                        {a.containerPort}/{a.protocol}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
