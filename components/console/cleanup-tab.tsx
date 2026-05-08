"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  HardDrive,
  Loader2,
  RefreshCw,
  Shield,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { formatBytes, formatRelative } from "@/lib/console/format"
import { cn } from "@/lib/utils"
import type {
  CategoryScan,
  CleanupCategory,
  CleanupItem,
  CleanupSummary,
  PruneResult,
} from "@/lib/console/cleanup/types"

const CATEGORY_ORDER: CleanupCategory[] = [
  "docker-build-cache",
  "docker-images",
  "docker-volumes",
  "docker-containers",
  "docker-networks",
  "ollama-models",
  "stray-models",
  "build-artifacts",
  "container-logs",
  "journald",
  "tmp-files",
  "listening-ports",
]

interface ConfirmState {
  category: CleanupCategory
  preview: CleanupItem[]
  totalBytes: number
}

export function CleanupTab() {
  const [summary, setSummary] = useState<CleanupSummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [expanded, setExpanded] = useState<Set<CleanupCategory>>(new Set())
  const [scans, setScans] = useState<Partial<Record<CleanupCategory, CategoryScan>>>({})
  const [scanLoading, setScanLoading] = useState<Set<CleanupCategory>>(new Set())
  const [selected, setSelected] = useState<Partial<Record<CleanupCategory, Set<string>>>>({})
  const [pruning, setPruning] = useState<Set<CleanupCategory>>(new Set())
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true)
    try {
      const r = await fetch("/api/console/cleanup/summary", { cache: "no-store" })
      if (r.ok) setSummary(await r.json())
    } finally {
      setLoadingSummary(false)
    }
  }, [])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  const fetchScan = useCallback(async (category: CleanupCategory) => {
    setScanLoading((prev) => new Set(prev).add(category))
    try {
      const r = await fetch(`/api/console/cleanup/${category}`, { cache: "no-store" })
      if (r.ok) {
        const data = (await r.json()) as CategoryScan
        setScans((prev) => ({ ...prev, [category]: data }))
      }
    } finally {
      setScanLoading((prev) => {
        const next = new Set(prev)
        next.delete(category)
        return next
      })
    }
  }, [])

  const toggleExpand = useCallback((category: CleanupCategory) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
        if (!scans[category]) fetchScan(category)
      }
      return next
    })
  }, [scans, fetchScan])

  const requestPrune = useCallback(async (category: CleanupCategory) => {
    const ids = Array.from(selected[category] ?? [])
    const r = await fetch(`/api/console/cleanup/${category}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: false, ids: ids.length > 0 ? ids : undefined }),
    })
    if (!r.ok) {
      setToast(`Preview failed: HTTP ${r.status}`)
      return
    }
    const data = (await r.json()) as PruneResult
    setConfirm({ category, preview: data.preview, totalBytes: data.preview.reduce((a, b) => a + b.bytes, 0) })
  }, [selected])

  const executePrune = useCallback(async () => {
    if (!confirm) return
    const { category } = confirm
    const ids = Array.from(selected[category] ?? [])
    setConfirm(null)
    setPruning((prev) => new Set(prev).add(category))
    try {
      const r = await fetch(`/api/console/cleanup/${category}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true, ids: ids.length > 0 ? ids : undefined }),
      })
      if (!r.ok) {
        setToast(`Prune failed: HTTP ${r.status}`)
        return
      }
      const data = (await r.json()) as PruneResult
      const successCount = (data.executed ?? []).filter((e) => e.ok).length
      const errorCount = (data.executed ?? []).filter((e) => !e.ok).length
      setToast(
        `${categoryLabel(category)}: freed ${formatBytes(data.bytesFreed)} (${successCount} ok` +
        (errorCount > 0 ? `, ${errorCount} failed` : "") + ")",
      )
      setSelected((prev) => ({ ...prev, [category]: new Set() }))
      fetchScan(category)
      fetchSummary()
    } finally {
      setPruning((prev) => {
        const next = new Set(prev)
        next.delete(category)
        return next
      })
    }
  }, [confirm, selected, fetchScan, fetchSummary])

  const toggleItem = useCallback((category: CleanupCategory, id: string) => {
    setSelected((prev) => {
      const current = new Set(prev[category] ?? [])
      if (current.has(id)) current.delete(id)
      else current.add(id)
      return { ...prev, [category]: current }
    })
  }, [])

  const toggleAllInCategory = useCallback((category: CleanupCategory) => {
    const scan = scans[category]
    if (!scan) return
    setSelected((prev) => {
      const current = prev[category] ?? new Set()
      const reclaimable = scan.items.filter((it) => !it.protected && (it.inUseBy ?? []).length === 0)
      if (current.size >= reclaimable.length) {
        return { ...prev, [category]: new Set() }
      }
      return { ...prev, [category]: new Set(reclaimable.map((it) => it.id)) }
    })
  }, [scans])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const totalReclaim = summary?.totalReclaimableBytes ?? 0
  const orderedRows = summary
    ? CATEGORY_ORDER.map((cat) => summary.rows.find((r) => r.category === cat)).filter(Boolean) as typeof summary.rows
    : []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <HardDrive className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            <span className="text-foreground font-medium">{formatBytes(totalReclaim)}</span> reclaimable across{" "}
            {orderedRows.length} categories
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSummary} disabled={loadingSummary}>
          {loadingSummary ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span className="ml-1.5">Rescan all</span>
        </Button>
      </div>

      <div className="border border-border rounded-lg divide-y divide-border">
        {orderedRows.map((row) => {
          const cat = row.category
          const isOpen = expanded.has(cat)
          const isScanning = scanLoading.has(cat)
          const isPruning = pruning.has(cat)
          const scan = scans[cat]
          const sel = selected[cat] ?? new Set<string>()
          return (
            <div key={cat}>
              <button
                type="button"
                onClick={() => toggleExpand(cat)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 text-left"
              >
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{row.label}</span>
                    {row.error && (
                      <span title={row.error} className="inline-flex items-center text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {row.count} item{row.count === 1 ? "" : "s"} ·{" "}
                    <span className="text-foreground/80">{formatBytes(row.reclaimableBytes)}</span> reclaimable
                    {row.totalBytes > row.reclaimableBytes && (
                      <> · {formatBytes(row.totalBytes)} total</>
                    )}
                  </p>
                </div>
                {row.reclaimableBytes > 0 && (
                  <Badge variant="secondary" className="font-mono text-xs">
                    {formatBytes(row.reclaimableBytes)}
                  </Badge>
                )}
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-1 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="ghost" onClick={() => fetchScan(cat)} disabled={isScanning}>
                      {isScanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      <span className="ml-1.5">Rescan</span>
                    </Button>
                    {scan && scan.items.length > 0 && hasPruneCapability(cat) && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => toggleAllInCategory(cat)}>
                          {sel.size > 0 ? "Clear selection" : "Select all reclaimable"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => requestPrune(cat)}
                          disabled={isPruning}
                        >
                          {isPruning ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                          <span className="ml-1.5">
                            {sel.size > 0 ? `Preview delete (${sel.size})` : "Preview delete reclaimable"}
                          </span>
                        </Button>
                      </>
                    )}
                  </div>
                  {scan?.warnings && scan.warnings.length > 0 && (
                    <div className="text-xs text-amber-400 bg-amber-400/5 border border-amber-400/20 rounded px-3 py-2">
                      {scan.warnings.join(" · ")}
                    </div>
                  )}
                  {scan && scan.items.length === 0 && !isScanning && (
                    <p className="text-xs text-muted-foreground py-2">Nothing to clean up here.</p>
                  )}
                  {scan && scan.items.length > 0 && (
                    <ItemList
                      items={scan.items}
                      selected={sel}
                      onToggle={(id) => toggleItem(cat, id)}
                      selectable={hasPruneCapability(cat)}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {confirm && (
        <AlertDialog open onOpenChange={(open) => !open && setConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {confirm.preview.length} item{confirm.preview.length === 1 ? "" : "s"} from{" "}
                {categoryLabel(confirm.category)}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will free <span className="text-foreground font-medium">{formatBytes(confirm.totalBytes)}</span>.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="max-h-72 overflow-y-auto border border-border rounded text-xs font-mono space-y-0.5 p-2">
              {confirm.preview.slice(0, 100).map((it) => (
                <div key={it.id} className="flex items-center gap-2">
                  <span className="text-muted-foreground tabular-nums w-16 text-right">{formatBytes(it.bytes)}</span>
                  <span className="truncate">{it.label}</span>
                </div>
              ))}
              {confirm.preview.length > 100 && (
                <div className="text-muted-foreground italic pt-1">+ {confirm.preview.length - 100} more…</div>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={executePrune}>
                Delete {formatBytes(confirm.totalBytes)}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-foreground text-background text-sm px-4 py-2 rounded-md shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

function ItemList({
  items,
  selected,
  onToggle,
  selectable,
}: {
  items: CleanupItem[]
  selected: Set<string>
  onToggle: (id: string) => void
  selectable: boolean
}) {
  return (
    <div className="border border-border rounded text-sm">
      {items.slice(0, 200).map((it, idx) => {
        const inUse = (it.inUseBy ?? []).length > 0
        const isProtected = !!it.protected
        const reclaimable = !inUse && !isProtected
        const isSelected = selected.has(it.id)
        return (
          <label
            key={it.id}
            className={cn(
              "flex items-start gap-3 px-3 py-2 cursor-pointer",
              idx > 0 && "border-t border-border",
              isProtected && "opacity-60",
              !reclaimable && "cursor-not-allowed",
            )}
          >
            {selectable && (
              <input
                type="checkbox"
                disabled={!reclaimable}
                checked={isSelected}
                onChange={() => reclaimable && onToggle(it.id)}
                className="mt-1 shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs">{it.label}</span>
                {isProtected && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Shield className="w-3 h-3" />
                    protected
                  </Badge>
                )}
                {inUse && (
                  <Badge variant="outline" className="text-xs">
                    in use: {it.inUseBy?.join(", ")}
                  </Badge>
                )}
              </div>
              {it.detail && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate" title={it.detail}>
                  {it.detail}
                </p>
              )}
            </div>
            <div className="text-right text-xs shrink-0 tabular-nums">
              <div className="font-mono">{formatBytes(it.bytes)}</div>
              {it.ageMs !== undefined && (
                <div className="text-muted-foreground">{formatRelative(new Date(Date.now() - it.ageMs).toISOString())}</div>
              )}
            </div>
          </label>
        )
      })}
      {items.length > 200 && (
        <div className="px-3 py-2 text-xs text-muted-foreground italic border-t border-border">
          + {items.length - 200} more not shown
        </div>
      )}
    </div>
  )
}

function categoryLabel(c: CleanupCategory): string {
  const map: Record<CleanupCategory, string> = {
    "docker-build-cache": "Docker build cache",
    "docker-images": "Docker images",
    "docker-containers": "Docker containers",
    "docker-volumes": "Docker volumes",
    "docker-networks": "Docker networks",
    "ollama-models": "Ollama models",
    "stray-models": "Stray model files",
    "build-artifacts": "Build artifacts",
    "container-logs": "Container logs",
    journald: "Systemd journal",
    "tmp-files": "/tmp files",
    "listening-ports": "Listening ports",
  }
  return map[c]
}

function hasPruneCapability(c: CleanupCategory): boolean {
  return c !== "listening-ports"
}
