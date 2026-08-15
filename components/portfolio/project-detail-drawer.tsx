"use client"

import { useCallback, useEffect, useState } from "react"
import {
  X,
  Loader2,
  GitBranch,
  GitCommitHorizontal,
  FolderOpen,
  ExternalLink,
  Trash2,
  Check,
  FileText,
  FlaskConical,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { StageBadge } from "@/components/portfolio/stage-badge"
import { HealthDot, healthLabel } from "@/components/portfolio/health-dot"
import { formatRelative } from "@/lib/console/format"
import { STAGES, type LifecycleStage, type PortfolioProject } from "@/lib/projects/types"
import type { CommitEntry } from "@/lib/projects/scan"

export function ProjectDetailDrawer({
  project,
  onClose,
  onSaved,
}: {
  project: PortfolioProject
  onClose: () => void
  onSaved: () => void
}) {
  const [stage, setStage] = useState<LifecycleStage>(project.stage)
  const [owner, setOwner] = useState(project.owner ?? "")
  const [description, setDescription] = useState(project.description ?? "")
  const [notes, setNotes] = useState(project.notes ?? "")
  const [tags, setTags] = useState(project.tags.join(", "))
  const [pinned, setPinned] = useState(project.pinned)
  const [checksEnabled, setChecksEnabled] = useState(project.checksEnabled)
  const [saving, setSaving] = useState(false)
  const [commits, setCommits] = useState<CommitEntry[]>([])
  const [loadingCommits, setLoadingCommits] = useState(project.exists && !!project.git?.isRepo)

  useEffect(() => {
    if (!project.exists || !project.git?.isRepo) return
    let cancelled = false
    fetch(`/api/projects/${encodeURIComponent(project.slug)}?commits=1`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { commits: [] }))
      .then((data: { commits?: CommitEntry[] }) => {
        if (!cancelled) setCommits(data.commits ?? [])
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingCommits(false)
      })
    return () => {
      cancelled = true
    }
  }, [project.slug, project.exists, project.git?.isRepo])

  const save = useCallback(
    async (extra?: Record<string, unknown>) => {
      setSaving(true)
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(project.slug)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            stage,
            owner: owner.trim() || null,
            description: description.trim() || null,
            notes: notes.trim() || null,
            tags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            pinned,
            checksEnabled,
            ...extra,
          }),
        })
        if (res.ok) onSaved()
      } finally {
        setSaving(false)
      }
    },
    [project.slug, stage, owner, description, notes, tags, pinned, checksEnabled, onSaved],
  )

  async function removeCuration() {
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.slug)}`, {
        method: "DELETE",
      })
      if (res.ok) {
        onSaved()
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }

  const git = project.git
  const stack = project.stack

  return (
    <div
      className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl h-full bg-card border-l border-border flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <HealthDot level={project.health.level} />
            <h2 className="text-sm font-medium truncate">{project.displayName}</h2>
            {project.slug !== project.displayName && (
              <span className="text-xs text-muted-foreground font-mono truncate">{project.slug}</span>
            )}
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-5">
          {/* Status summary */}
          <div className="flex flex-wrap items-center gap-2">
            <StageBadge stage={project.stage} />
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{healthLabel(project.health.level)}</span>
            {project.planned && <Badge variant="outline" className="font-normal">Planned</Badge>}
            {project.missingDir && (
              <Badge variant="destructive" className="font-normal gap-1">
                <AlertTriangle className="w-3 h-3" /> Directory missing
              </Badge>
            )}
            {project.health.flags.map((f) => (
              <Badge key={f} variant="outline" className="font-normal text-muted-foreground">
                {f}
              </Badge>
            ))}
          </div>

          {/* Path + quick links */}
          {project.path && (
            <div className="flex items-center gap-2 text-xs">
              <FolderOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="font-mono text-foreground/80 truncate">{project.path}</span>
              <a
                href={`/files?path=${encodeURIComponent(project.path)}`}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground shrink-0"
              >
                Files <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Git */}
          {git?.isRepo ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border bg-muted/30">
                <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">{git.branch ?? "—"}</span>
                {git.detached && <Badge variant="destructive" className="font-normal">detached</Badge>}
                <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                  {git.dirtyCount > 0 ? (
                    <span className="text-amber-400">{git.dirtyCount} uncommitted</span>
                  ) : (
                    <span className="text-emerald-400/80">clean</span>
                  )}
                  {git.ahead > 0 && <span>↑{git.ahead}</span>}
                  {git.behind > 0 && <span className="text-orange-400">↓{git.behind}</span>}
                  {!git.hasRemote && <span>no remote</span>}
                </div>
              </div>
              <div className="max-h-56 overflow-auto divide-y divide-border/60">
                {loadingCommits ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : commits.length === 0 ? (
                  <p className="px-3.5 py-3 text-xs text-muted-foreground">No commits</p>
                ) : (
                  commits.map((c) => (
                    <div key={c.hash} className="px-3.5 py-2 flex items-start gap-2">
                      <GitCommitHorizontal className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground/90 truncate">{c.subject}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {c.author} · {c.at ? formatRelative(c.at) : "—"} · {c.hash.slice(0, 7)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : project.exists ? (
            <p className="text-xs text-muted-foreground">Not a git repository.</p>
          ) : null}

          {/* Stack chips */}
          {stack && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="font-normal capitalize">{stack.language}</Badge>
              {stack.hasCompose && <Badge variant="outline" className="font-normal">compose</Badge>}
              {stack.hasDockerfile && <Badge variant="outline" className="font-normal">docker</Badge>}
              <Badge variant="outline" className={`font-normal gap-1 ${stack.hasReadme ? "" : "text-muted-foreground/60"}`}>
                <FileText className="w-3 h-3" /> {stack.hasReadme ? "readme" : "no readme"}
              </Badge>
              <Badge variant="outline" className={`font-normal gap-1 ${stack.hasTests ? "" : "text-muted-foreground/60"}`}>
                <FlaskConical className="w-3 h-3" /> {stack.hasTests ? "tests" : "no tests"}
              </Badge>
              {stack.hasClaudeMd && <Badge variant="outline" className="font-normal">CLAUDE.md</Badge>}
            </div>
          )}

          {/* Editable curated fields */}
          <div className="space-y-3.5 pt-1 border-t border-border">
            <h3 className="text-xs font-medium text-muted-foreground pt-3">Curated metadata</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="d-stage">Stage</Label>
                <select
                  id="d-stage"
                  value={stage}
                  onChange={(e) => setStage(e.target.value as LifecycleStage)}
                  className="w-full bg-muted text-sm rounded-md border border-border px-3 h-9"
                >
                  {STAGES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-owner">Owner</Label>
                <Input id="d-owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="—" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="d-desc">Description</Label>
              <Input id="d-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One-line summary" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="d-tags">Tags (comma-separated)</Label>
              <Input id="d-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="internal, ai, client-work" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="d-notes">Notes</Label>
              <textarea
                id="d-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Where this stands, blockers, next steps…"
                className="w-full bg-muted text-sm rounded-md border border-border px-3 py-2 resize-y"
              />
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="accent-primary" />
                Pinned
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer" title="Phase 2: scheduled build/test health checks">
                <input type="checkbox" checked={checksEnabled} onChange={(e) => setChecksEnabled(e.target.checked)} className="accent-primary" />
                Enable build checks <span className="text-xs text-muted-foreground">(Phase 2)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 px-5 h-14 border-t border-border shrink-0">
          {project.curated && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={removeCuration}
              disabled={saving}
              title={project.planned ? "Delete planned project" : "Reset curated metadata"}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {project.planned ? "Delete" : "Reset"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => save({ markReviewed: true })}
            disabled={saving}
          >
            <Check className="w-3.5 h-3.5" />
            Mark reviewed
          </Button>
          <Button size="sm" onClick={() => save()} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
