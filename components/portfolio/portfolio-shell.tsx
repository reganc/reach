"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  LayoutGrid,
  Table2,
  Search,
  RefreshCw,
  Loader2,
  Plus,
  Pin,
  GitBranch,
  AlertTriangle,
  Inbox,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { StageBadge } from "@/components/portfolio/stage-badge"
import { HealthDot, healthLabel } from "@/components/portfolio/health-dot"
import { HudFrame } from "@/components/portfolio/holo/hud-frame"
import { GlassCard, Placeholder } from "@/components/portfolio/holo/glass-card"
import { ProjectDetailDrawer } from "@/components/portfolio/project-detail-drawer"
import { CreateProjectDialog } from "@/components/portfolio/create-project-dialog"
import { formatRelative } from "@/lib/console/format"
import { cn } from "@/lib/utils"
import {
  STAGES,
  type HealthLevel,
  type PortfolioProject,
} from "@/lib/projects/types"

type View = "board" | "table"
type HealthFilter = "all" | HealthLevel

export function PortfolioShell() {
  const [projects, setProjects] = useState<PortfolioProject[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [view, setView] = useState<View>("board")
  const [search, setSearch] = useState("")
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all")
  const [showArchived, setShowArchived] = useState(false)
  const [selected, setSelected] = useState<PortfolioProject | null>(null)
  const [creating, setCreating] = useState(false)

  const fetchProjects = useCallback(async (force = false) => {
    if (force) setRefreshing(true)
    try {
      const res = await fetch(`/api/projects${force ? "?force=1" : ""}`, { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setProjects(data.projects as PortfolioProject[])
        // Keep an open drawer's data in sync after a refresh.
        setSelected((prev) =>
          prev ? (data.projects as PortfolioProject[]).find((p) => p.slug === prev.slug) ?? prev : prev,
        )
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchProjects()
    const t = setInterval(() => fetchProjects(false), 30_000)
    return () => clearInterval(t)
  }, [fetchProjects])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return projects.filter((p) => {
      if (q) {
        const hay = `${p.displayName} ${p.slug} ${p.tags.join(" ")} ${p.description ?? ""}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (healthFilter !== "all" && p.health.level !== healthFilter) return false
      return true
    })
  }, [projects, search, healthFilter])

  const counts = useMemo(() => {
    const c = { total: projects.length, attention: 0, stale: 0, dirty: 0, unsorted: 0 }
    for (const p of projects) {
      if (p.health.level === "attention") c.attention++
      else if (p.health.level === "stale") c.stale++
      else if (p.health.level === "dirty") c.dirty++
      if (p.stage === "unsorted") c.unsorted++
    }
    return c
  }, [projects])

  const visibleStages = STAGES.filter((s) => showArchived || !s.archivedByDefault)

  return (
    <HudFrame
      title="◇ REACH"
      subtitle="PORTFOLIO · DEVELOPMENT LIFECYCLE ACROSS ~/APPS"
      watermark="R"
      statusRight={<span>{counts.total} PROJECTS</span>}
      className="h-full"
    >
      <div className="h-full overflow-y-auto pt-12">
      {/* Summary chips */}
      <div className="flex items-center gap-2 px-6 pt-4 flex-wrap">
        <SummaryChip label="projects" value={counts.total} />
        {counts.unsorted > 0 && (
          <SummaryChip label="to triage" value={counts.unsorted} icon={<Inbox className="w-3 h-3" />} tone="zinc" onClick={() => { setView("board") }} />
        )}
        {counts.attention > 0 && (
          <SummaryChip label="need attention" value={counts.attention} icon={<AlertTriangle className="w-3 h-3" />} tone="red" onClick={() => setHealthFilter(healthFilter === "attention" ? "all" : "attention")} active={healthFilter === "attention"} />
        )}
        {counts.stale > 0 && (
          <SummaryChip label="stale" value={counts.stale} tone="orange" onClick={() => setHealthFilter(healthFilter === "stale" ? "all" : "stale")} active={healthFilter === "stale"} />
        )}
        {counts.dirty > 0 && (
          <SummaryChip label="uncommitted" value={counts.dirty} tone="amber" onClick={() => setHealthFilter(healthFilter === "dirty" ? "all" : "dirty")} active={healthFilter === "dirty"} />
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-6 py-3 flex-wrap">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="pl-8 h-8 w-56"
          />
        </div>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-1">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-primary" />
          Show archived
        </label>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <ViewToggle icon={<LayoutGrid className="w-3.5 h-3.5" />} label="Board" active={view === "board"} onClick={() => setView("board")} />
            <ViewToggle icon={<Table2 className="w-3.5 h-3.5" />} label="Table" active={view === "table"} onClick={() => setView("table")} />
          </div>
          <Button size="sm" variant="outline" onClick={() => fetchProjects(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Rescan
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="w-3.5 h-3.5" />
            Plan
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : view === "board" ? (
        <div className="flex gap-3 px-6 pb-6 overflow-x-auto">
          {visibleStages.map((s) => {
            const items = filtered.filter((p) => p.stage === s.id)
            return (
              <div key={s.id} className="w-[264px] shrink-0 flex flex-col">
                <div className="flex items-center justify-between px-1 py-2 sticky top-0">
                  <StageBadge stage={s.id} />
                  <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((p) => (
                    <ProjectCard key={p.slug} project={p} onClick={() => setSelected(p)} />
                  ))}
                  {items.length === 0 && (
                    <div className="flex px-1 py-2">
                      <Placeholder label="EMPTY SLOT" />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="px-6 pb-6">
          <ProjectTable projects={filtered} onSelect={setSelected} />
        </div>
      )}

      {selected && (
        <ProjectDetailDrawer
          project={selected}
          onClose={() => setSelected(null)}
          onSaved={() => fetchProjects(false)}
        />
      )}
      {creating && (
        <CreateProjectDialog onClose={() => setCreating(false)} onCreated={() => fetchProjects(true)} />
      )}
      </div>
    </HudFrame>
  )
}

function ProjectCard({ project, onClick }: { project: PortfolioProject; onClick: () => void }) {
  const git = project.git
  return (
    <button onClick={onClick} className="holo-card block w-full text-left">
      <GlassCard
        title={project.displayName}
        hid={project.pinned ? "◆ PIN" : undefined}
        foot={`◈ ${healthLabel(project.health.level).toUpperCase()}`}
        footRight={
          project.lastActivityAt
            ? formatRelative(project.lastActivityAt).toUpperCase()
            : project.planned
              ? "PLANNED"
              : "—"
        }
        selected={project.health.level === "attention"}
      >
        {project.description ? (
          <p className="text-xs leading-relaxed text-white/55 line-clamp-2">{project.description}</p>
        ) : (
          <Placeholder label="NO BRIEF" />
        )}
        <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground">
          <HealthDot level={project.health.level} />
          {project.stack && project.stack.language !== "unknown" && (
            <Badge variant="secondary" className="font-normal capitalize text-[11px] py-0">{project.stack.language}</Badge>
          )}
          {project.missingDir && (
            <span className="inline-flex items-center gap-1 text-red-400"><AlertTriangle className="w-3 h-3" /> missing</span>
          )}
          {git?.isRepo && git.dirtyCount > 0 && <span className="text-amber-400">{git.dirtyCount}∆</span>}
          {git?.behind ? <span className="text-orange-400">↓{git.behind}</span> : null}
        </div>
      </GlassCard>
    </button>
  )
}

function ProjectTable({
  projects,
  onSelect,
}: {
  projects: PortfolioProject[]
  onSelect: (p: PortfolioProject) => void
}) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <p className="text-sm font-medium">No projects match</p>
        <p className="text-xs text-muted-foreground">Try clearing filters or rescanning.</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-xs">
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Project</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Stage</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Stack</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Git</th>
            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Activity</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p, i) => (
            <tr
              key={p.slug}
              onClick={() => onSelect(p)}
              className={cn(
                "cursor-pointer hover:bg-muted/20 transition-colors",
                i < projects.length - 1 && "border-b border-border",
              )}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <HealthDot level={p.health.level} />
                  <span className="font-medium">{p.displayName}</span>
                  {p.pinned && <Pin className="w-3 h-3 text-muted-foreground" />}
                </div>
                {p.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1 max-w-md">{p.description}</p>
                )}
              </td>
              <td className="px-4 py-3"><StageBadge stage={p.stage} /></td>
              <td className="px-4 py-3 hidden md:table-cell">
                <div className="flex flex-wrap gap-1">
                  {p.stack && p.stack.language !== "unknown" && (
                    <Badge variant="secondary" className="font-normal capitalize">{p.stack.language}</Badge>
                  )}
                  {p.stack?.hasCompose && <Badge variant="outline" className="font-normal">compose</Badge>}
                  {p.tags.slice(0, 2).map((t) => (
                    <Badge key={t} variant="outline" className="font-normal text-muted-foreground">{t}</Badge>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                {p.git?.isRepo ? (
                  <span className="inline-flex items-center gap-1.5">
                    <GitBranch className="w-3 h-3" />
                    {p.git.branch ?? "—"}
                    {p.git.dirtyCount > 0 && <span className="text-amber-400">· {p.git.dirtyCount}∆</span>}
                    {p.git.behind > 0 && <span className="text-orange-400">· ↓{p.git.behind}</span>}
                  </span>
                ) : p.missingDir ? (
                  <span className="text-red-400">missing dir</span>
                ) : p.planned ? (
                  "planned"
                ) : (
                  "no vcs"
                )}
              </td>
              <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                {p.lastActivityAt ? formatRelative(p.lastActivityAt) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ViewToggle({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 h-8 text-xs font-medium transition-colors",
        active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  )
}

const TONE_CLASS: Record<string, string> = {
  zinc: "border-zinc-500/30 text-zinc-300",
  red: "border-red-500/30 text-red-300",
  orange: "border-orange-500/30 text-orange-300",
  amber: "border-amber-500/30 text-amber-300",
  default: "border-border text-foreground",
}

function SummaryChip({
  label,
  value,
  icon,
  tone = "default",
  onClick,
  active,
}: {
  label: string
  value: number
  icon?: React.ReactNode
  tone?: string
  onClick?: () => void
  active?: boolean
}) {
  const Comp = onClick ? "button" : "div"
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors",
        TONE_CLASS[tone] ?? TONE_CLASS.default,
        onClick && "hover:bg-muted/40 cursor-pointer",
        active && "bg-muted/60 ring-1 ring-inset ring-border",
      )}
    >
      {icon}
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </Comp>
  )
}
