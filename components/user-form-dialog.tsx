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
import type { User } from "@/lib/types"

interface UserFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: User | null
  onSave: (user: User) => void
}

export default function UserFormDialog({
  open,
  onOpenChange,
  user,
  onSave,
}: UserFormDialogProps) {
  const isEditing = !!user

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<"USER" | "ADMIN">("USER")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(user?.name ?? "")
      setEmail(user?.email ?? "")
      setPassword("")
      setRole(user?.role ?? "USER")
      setError("")
    }
  }, [open, user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSaving(true)

    const endpoint = isEditing ? `/api/users/${user!.id}` : "/api/users"
    const method = isEditing ? "PUT" : "POST"

    const body: Record<string, string> = { name, email, role }
    if (password) body.password = password

    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
          <DialogTitle>{isEditing ? "Edit user" : "Add user"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this user's details. Leave password blank to keep it unchanged."
              : "Create a new user account for the portal."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="u-name">Name</Label>
            <Input
              id="u-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="u-email">Email *</Label>
            <Input
              id="u-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="u-password">
              Password {isEditing && <span className="text-muted-foreground">(leave blank to keep)</span>}
            </Label>
            <Input
              id="u-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required={!isEditing}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Role</Label>
            <div className="flex gap-2">
              {(["USER", "ADMIN"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    role === r
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r === "USER" ? "User" : "Admin"}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Admins can manage apps and users. Users can only access apps.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEditing ? "Save changes" : "Add user"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
