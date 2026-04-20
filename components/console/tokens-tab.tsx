"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw, Coins, Calendar, Cpu, Folder, Activity } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatCard } from "@/components/console/stat-card"
import { formatCost, formatNumber, formatRelative } from "@/lib/console/format"
import type { TokenProjects, TokenUsageSummary } from "@/lib/console/types"

export function TokensTab() {
  const [summary, setSummary] = useState<TokenUsageSummary | null>(null)
  const [projects, setProjects] = useState<TokenProjects | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    setError(null)
    try {
      const [s, p] = await Promise.all([
        fetch("/api/console/tokens", { cache: "no-store" }),
        fetch("/api/console/tokens/projects", { cache: "no-store" }),
      ])
      if (s.ok) setSummary(await s.json())
      else if (s.status === 404) setSummary(null)
      else setError(`Failed to load token usage (${s.status})`)
      if (p.ok) setProjects(await p.json())
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button size="sm" variant="outline" onClick={() => fetchAll(true)} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Total cost"
            value={formatCost(summary.totalCost)}
            hint={`${summary.entryCount} entries`}
          />
          <StatCard
            label="Total tokens"
            value={formatNumber(summary.totalTokens)}
            hint="from ~/.claude_usage.jsonl"
          />
          <StatCard
            label="Models"
            value={summary.byModel.length}
            hint="distinct models used"
          />
          <StatCard
            label="Last entry"
            value={summary.lastModified ? formatRelative(summary.lastModified) : "—"}
            hint="usage file mtime"
          />
        </div>
      )}

      {projects && projects.byProject.length > 0 && (
        <Section
          icon={<Folder className="w-4 h-4 text-muted-foreground" />}
          title="By project"
          subtitle={`${projects.byProject.length} projects · across ~/.claude/projects`}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Project</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Sessions</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Turns</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Cost</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Last active</th>
              </tr>
            </thead>
            <tbody>
              {projects.byProject.slice(0, 25).map((p, i) => (
                <tr
                  key={p.project}
                  className={`${i < projects.byProject.length - 1 ? "border-b border-border" : ""} hover:bg-muted/20 transition-colors`}
                >
                  <td className="px-4 py-2.5 font-medium">{p.project}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground hidden md:table-cell">{p.sessions}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground hidden md:table-cell">{p.turns}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatCost(p.cost)}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground hidden lg:table-cell">
                    {formatRelative(p.lastActive)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {projects && projects.byActivity.length > 0 && (
        <Section
          icon={<Activity className="w-4 h-4 text-muted-foreground" />}
          title="By activity"
          subtitle="How time and tokens are spent across projects"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Activity</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Turns</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Input</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Output</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Cost</th>
              </tr>
            </thead>
            <tbody>
              {projects.byActivity.map((a, i) => (
                <tr
                  key={a.activity}
                  className={`${i < projects.byActivity.length - 1 ? "border-b border-border" : ""} hover:bg-muted/20 transition-colors`}
                >
                  <td className="px-4 py-2.5 font-medium capitalize">{a.activity.replace("_", " ")}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{a.turns}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground hidden md:table-cell font-mono text-xs">
                    {formatNumber(a.inputTokens)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground hidden md:table-cell font-mono text-xs">
                    {formatNumber(a.outputTokens)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatCost(a.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {summary && summary.byModel.length > 0 && (
        <Section
          icon={<Cpu className="w-4 h-4 text-muted-foreground" />}
          title="By model"
          subtitle="From ~/.claude_usage.jsonl"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Model</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Calls</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Input</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Output</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Cost</th>
              </tr>
            </thead>
            <tbody>
              {summary.byModel.map((m, i) => (
                <tr
                  key={m.model}
                  className={`${i < summary.byModel.length - 1 ? "border-b border-border" : ""} hover:bg-muted/20 transition-colors`}
                >
                  <td className="px-4 py-2.5 font-medium font-mono text-xs">{m.model}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{m.count}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground hidden md:table-cell font-mono text-xs">
                    {formatNumber(m.inputTokens)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground hidden md:table-cell font-mono text-xs">
                    {formatNumber(m.outputTokens)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatCost(m.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {summary && summary.byDay.length > 0 && (
        <Section
          icon={<Calendar className="w-4 h-4 text-muted-foreground" />}
          title="By day"
          subtitle={`Latest ${Math.min(summary.byDay.length, 14)} days`}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Calls</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Tokens</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Cost</th>
              </tr>
            </thead>
            <tbody>
              {summary.byDay.slice(0, 14).map((d, i, arr) => (
                <tr
                  key={d.date}
                  className={`${i < arr.length - 1 ? "border-b border-border" : ""} hover:bg-muted/20 transition-colors`}
                >
                  <td className="px-4 py-2.5 font-medium font-mono text-xs">{d.date}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{d.count}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground font-mono text-xs">
                    {formatNumber(d.totalTokens)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">{formatCost(d.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {!summary && !error && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 rounded-xl border border-border">
          <Coins className="w-6 h-6 text-muted-foreground" />
          <p className="text-sm font-medium">No token usage tracker found</p>
          <p className="text-xs text-muted-foreground">
            Expected at <span className="font-mono">~/.claude_usage.jsonl</span>
          </p>
        </div>
      )}
    </div>
  )
}

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-4 h-11 border-b border-border bg-muted/30">
        {icon}
        <h3 className="text-sm font-medium">{title}</h3>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </div>
  )
}
