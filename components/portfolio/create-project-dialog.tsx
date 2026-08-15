"use client"

import { useState } from "react"
import { Loader2, X, Lightbulb } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { STAGES, type LifecycleStage } from "@/lib/projects/types"

export function CreateProjectDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [slug, setSlug] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [stage, setStage] = useState<LifecycleStage>("idea")
  const [description, setDescription] = useState("")
  const [owner, setOwner] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!slug.trim()) {
      setError("A slug is required")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim(),
          displayName: displayName.trim() || null,
          stage,
          description: description.trim() || null,
          owner: owner.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? `Failed (HTTP ${res.status})`)
        return
      }
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Lightbulb className="w-4 h-4 text-violet-400" />
            <h2 className="text-sm font-medium">Plan a project</h2>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="p-5 space-y-3.5">
          <p className="text-xs text-muted-foreground -mt-1">
            Track an app you haven&apos;t built yet. When you create its directory under
            <span className="font-mono text-foreground/80"> ~/apps/&lt;slug&gt;</span>, it links up automatically.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug (directory name)</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-next-app"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="displayName">Display name (optional)</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="My Next App"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stage">Stage</Label>
            <select
              id="stage"
              value={stage}
              onChange={(e) => setStage(e.target.value as LifecycleStage)}
              className="w-full bg-muted text-sm rounded-md border border-border px-3 h-9"
            >
              {STAGES.filter((s) => s.id !== "unsorted").map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One-line summary"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="owner">Owner (optional)</Label>
            <Input
              id="owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="you"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 h-14 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Create
          </Button>
        </div>
      </div>
    </div>
  )
}
