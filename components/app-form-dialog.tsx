"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { APP_COLORS, type App } from "@/lib/types"
import { cn } from "@/lib/utils"

interface AppFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  app?: App | null
  onSave: (app: App) => void
}

const DEFAULT_ICON = "🚀"
const DEFAULT_COLOR = "#8b5cf6"

export default function AppFormDialog({
  open,
  onOpenChange,
  app,
  onSave,
}: AppFormDialogProps) {
  const isEditing = !!app

  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [description, setDescription] = useState("")
  const [icon, setIcon] = useState(DEFAULT_ICON)
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(app?.name ?? "")
      setUrl(app?.url ?? "")
      setDescription(app?.description ?? "")
      setIcon(app?.icon ?? DEFAULT_ICON)
      setColor(app?.color ?? DEFAULT_COLOR)
      setError("")
    }
  }, [open, app])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSaving(true)

    const endpoint = isEditing ? `/api/apps/${app!.id}` : "/api/apps"
    const method = isEditing ? "PUT" : "POST"

    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, url, description, icon, color }),
    })

    setSaving(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Something went wrong")
      return
    }

    const saved = await res.json()
    onSave(saved)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit app" : "Add app"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the details for this app."
              : "Add an app to your portal. The URL must be accessible from your browser."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Icon + Name row */}
          <div className="flex gap-3">
            <div className="space-y-1.5 w-24 shrink-0">
              <Label htmlFor="icon">Icon</Label>
              <Input
                id="icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="🚀"
                className="text-center text-xl"
                maxLength={4}
              />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My App"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="url">URL *</Label>
            <Input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://localhost:8080"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this app do?"
            />
          </div>

          {/* Color picker */}
          <div className="space-y-1.5">
            <Label>Accent color</Label>
            <div className="flex gap-2 flex-wrap">
              {APP_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={cn(
                    "w-7 h-7 rounded-full border-2 transition-transform hover:scale-110",
                    color === c.value
                      ? "border-foreground scale-110"
                      : "border-transparent"
                  )}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEditing ? "Save changes" : "Add app"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
