"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, RefreshCw, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { AppInsight, InsightsPayload } from "@/lib/insights/types"
import { AppTable, TableApp } from "./app-table"
import { FocusShare } from "./focus-share"
import { FocusTimeline, TimelineSeries } from "./focus-timeline"
import { OTHER_COLOR, SERIES_COLORS, MAX_NAMED_SERIES } from "./palette"
import { StatTile } from "./stat-tile"

const RANGES = [
  { weeks: 4, label: "4 weeks" },
  { weeks: 12, label: "12 weeks" },
  { weeks: 26, label: "6 months" },
  { weeks: 52, label: "1 year" },
] as const

type SortKey = "commits" | "name" | "lastCommit" | "lastStarted"

interface GenState {
  running: boolean
  done: number
  total: number
  errors: string[]
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0)
}

export function InsightsShell() {
  const [payload, setPayload] = useState<InsightsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rangeWeeks, setRangeWeeks] = useState<number>(12)
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("commits")
  const [gen, setGen] = useState<GenState | null>(null)

  const load = useCallback(async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/console/insights${force ? "?force=1" : ""}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setPayload((await res.json()) as InsightsPayload)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load insights")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const derived = useMemo(() => {
    if (!payload) return null
    const { weeks, apps } = payload
    const start = Math.max(0, weeks.length - rangeWeeks)
    const rangeWeekLabels = weeks.slice(start)

    const tableApps: TableApp[] = apps.map((a) => ({
      ...a,
      rangeWeekly: a.weeklyCommits.slice(start),
      rangeCommits: sum(a.weeklyCommits.slice(start)),
    }))

    // Series identity is fixed by full-year rank so changing the range filter
    // never repaints an app with a different hue (color follows the entity).
    const byYear = [...tableApps].sort((x, y) => y.totalCommits - x.totalCommits)
    const named = byYear.filter((a) => a.totalCommits > 0).slice(0, MAX_NAMED_SERIES)
    const namedSet = new Set(named.map((a) => a.slug))
    const otherValues = rangeWeekLabels.map((_, i) =>
      sum(tableApps.filter((a) => !namedSet.has(a.slug)).map((a) => a.rangeWeekly[i] ?? 0)),
    )
    const series: TimelineSeries[] = [
      ...named.map((a, i) => ({
        key: a.slug,
        label: a.displayName,
        color: SERIES_COLORS[i],
        values: a.rangeWeekly,
      })),
      { key: "__other", label: "Other", color: OTHER_COLOR, values: otherValues },
    ]

    const commitsInRange = sum(tableApps.map((a) => a.rangeCommits))
    let delta: { text: string; positive: boolean } | null = null
    if (rangeWeeks * 2 <= weeks.length) {
      const prev = sum(
        apps.map((a) => sum(a.weeklyCommits.slice(start - rangeWeeks, start))),
      )
      const diff = commitsInRange - prev
      delta = {
        text: `${diff >= 0 ? "+" : ""}${diff.toLocaleString("en-US")} vs prior period`,
        positive: diff >= 0,
      }
    }

    const shareSorted = [...tableApps]
      .filter((a) => a.rangeCommits > 0)
      .sort((x, y) => y.rangeCommits - x.rangeCommits)
    const shareTop = shareSorted.slice(0, 12).map((a) => ({
      label: a.displayName,
      value: a.rangeCommits,
    }))
    const shareRest = sum(shareSorted.slice(12).map((a) => a.rangeCommits))
    const shareRows = shareRest > 0
      ? [...shareTop, { label: `Other (${shareSorted.length - 12} apps)`, value: shareRest, isOther: true }]
      : shareTop

    return {
      rangeWeekLabels,
      tableApps,
      series,
      shareRows,
      commitsInRange,
      delta,
      activeInRange: tableApps.filter((a) => a.rangeCommits > 0).length,
      runningNow: tableApps.filter((a) => a.runtime.runningContainers > 0).length,
      staleSlugs: apps.filter((a) => a.summaryStale).map((a) => a.slug),
    }
  }, [payload, rangeWeeks])

  const filteredSorted = useMemo(() => {
    if (!derived) return []
    const q = search.trim().toLowerCase()
    const filtered = q
      ? derived.tableApps.filter(
          (a) =>
            a.slug.toLowerCase().includes(q) ||
            (a.summary ?? a.detectedDescription ?? "").toLowerCase().includes(q),
        )
      : derived.tableApps
    const ts = (iso: string | null) => (iso ? Date.parse(iso) : 0)
    return [...filtered].sort((x, y) => {
      switch (sortKey) {
        case "name": return x.displayName.localeCompare(y.displayName)
        case "lastCommit": return ts(y.lastCommitAt) - ts(x.lastCommitAt)
        case "lastStarted": return ts(y.runtime.lastStartedAt) - ts(x.runtime.lastStartedAt)
        default: return y.rangeCommits - x.rangeCommits
      }
    })
  }, [derived, search, sortKey])

  const generateSummaries = useCallback(async () => {
    if (!payload || gen?.running) return
    const stale = payload.apps.filter((a) => a.summaryStale).map((a) => a.slug)
    if (stale.length === 0) return
    const errors: string[] = []
    let done = 0
    setGen({ running: true, done: 0, total: stale.length, errors: [] })
    // One at a time — the local 14B model serves one request well, not four.
    for (const slug of stale) {
      try {
        const res = await fetch("/api/console/insights/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        })
        const data = (await res.json()) as { summary?: string; error?: string }
        if (!res.ok || !data.summary) throw new Error(data.error ?? `HTTP ${res.status}`)
        const summary = data.summary
        setPayload((p) =>
          p
            ? {
                ...p,
                apps: p.apps.map((a): AppInsight =>
                  a.slug === slug ? { ...a, summary, summaryStale: false } : a,
                ),
              }
            : p,
        )
      } catch (e) {
        errors.push(`${slug}: ${e instanceof Error ? e.message : "failed"}`)
        if (errors.length >= 3) {
          errors.push("Stopping — the LLM looks unavailable.")
          break
        }
      }
      done++
      setGen({ running: true, done, total: stale.length, errors: [...errors] })
    }
    setGen((g) => (g ? { ...g, running: false } : g))
  }, [payload, gen])

  if (loading && !payload) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning ~/apps…
      </div>
    )
  }
  if (error && !payload) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={() => load(true)}>Retry</Button>
      </div>
    )
  }
  if (!payload || !derived) return null

  return (
    <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")}>
      {/* header row: title + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Insights</h1>
          <p className="text-xs text-muted-foreground">
            {payload.apps.length} apps under ~/apps · scanned {new Date(payload.generatedAt).toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={generateSummaries}
            disabled={gen?.running || derived.staleSlugs.length === 0}
          >
            {gen?.running ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />{gen.done}/{gen.total}</>
            ) : (
              <><Sparkles className="mr-1.5 h-3.5 w-3.5" />
                {derived.staleSlugs.length > 0
                  ? `Summarize ${derived.staleSlugs.length} apps`
                  : "Summaries current"}</>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {gen && gen.errors.length > 0 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {gen.errors[gen.errors.length - 1]}
        </p>
      )}

      {/* filter row — scopes everything below */}
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r.weeks}
            onClick={() => setRangeWeeks(r.weeks)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs transition-colors",
              rangeWeeks === r.weeks
                ? "bg-primary/15 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Apps tracked" value={String(payload.apps.length)} />
        <StatTile
          label="Active this period"
          value={String(derived.activeInRange)}
          sub="apps with ≥1 commit"
        />
        <StatTile
          label="Running now"
          value={String(derived.runningNow)}
          sub="apps with live containers"
        />
        <StatTile
          label="Commits"
          value={derived.commitsInRange.toLocaleString("en-US")}
          delta={derived.delta}
        />
      </div>

      {/* charts */}
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-4 xl:col-span-3">
          <h2 className="mb-3 text-sm font-medium">Focus over time</h2>
          <FocusTimeline weeks={derived.rangeWeekLabels} series={derived.series} />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 xl:col-span-2">
          <h2 className="mb-3 text-sm font-medium">Focus share</h2>
          <FocusShare rows={derived.shareRows} total={derived.commitsInRange} />
        </div>
      </div>

      {/* table */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">All apps</h2>
          <div className="flex items-center gap-2">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground"
            >
              <option value="commits">Most commits</option>
              <option value="lastCommit">Recent commit</option>
              <option value="lastStarted">Recently started</option>
              <option value="name">Name</option>
            </select>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter apps…"
              className="h-8 w-44 text-xs"
            />
          </div>
        </div>
        <AppTable apps={filteredSorted} />
      </div>
    </div>
  )
}
