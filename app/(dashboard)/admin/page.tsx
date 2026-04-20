"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import AppFormDialog from "@/components/app-form-dialog"
import UserFormDialog from "@/components/user-form-dialog"
import type { App, User } from "@/lib/types"

export default function AdminPage() {
  const [apps, setApps] = useState<App[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loadingApps, setLoadingApps] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(true)

  const [appDialogOpen, setAppDialogOpen] = useState(false)
  const [editingApp, setEditingApp] = useState<App | null>(null)
  const [userDialogOpen, setUserDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  const fetchApps = useCallback(async () => {
    setLoadingApps(true)
    const res = await fetch("/api/apps")
    if (res.ok) setApps(await res.json())
    setLoadingApps(false)
  }, [])

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true)
    const res = await fetch("/api/users")
    if (res.ok) setUsers(await res.json())
    setLoadingUsers(false)
  }, [])

  useEffect(() => {
    fetchApps()
    fetchUsers()
  }, [fetchApps, fetchUsers])

  function handleAppSaved(saved: App) {
    setApps((prev) => {
      const idx = prev.findIndex((a) => a.id === saved.id)
      return idx >= 0
        ? prev.map((a) => (a.id === saved.id ? saved : a))
        : [...prev, saved]
    })
  }

  function handleUserSaved(saved: User) {
    setUsers((prev) => {
      const idx = prev.findIndex((u) => u.id === saved.id)
      return idx >= 0
        ? prev.map((u) => (u.id === saved.id ? saved : u))
        : [...prev, saved]
    })
  }

  async function deleteApp(id: string) {
    const res = await fetch(`/api/apps/${id}`, { method: "DELETE" })
    if (res.ok) setApps((prev) => prev.filter((a) => a.id !== id))
  }

  async function deleteUser(id: string) {
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" })
    if (res.ok) setUsers((prev) => prev.filter((u) => u.id !== id))
  }

  return (
    <>
      <div className="flex items-center justify-between px-6 h-14 border-b border-border">
        <h1 className="text-sm font-medium">Manage</h1>
      </div>

      <div className="p-6">
        <Tabs defaultValue="apps">
          <TabsList>
            <TabsTrigger value="apps">Apps</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
          </TabsList>

          {/* Apps tab */}
          <TabsContent value="apps">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                {apps.length} app{apps.length !== 1 ? "s" : ""}
              </p>
              <Button
                size="sm"
                onClick={() => {
                  setEditingApp(null)
                  setAppDialogOpen(true)
                }}
              >
                <Plus className="w-4 h-4" />
                Add app
              </Button>
            </div>

            {loadingApps ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : apps.length === 0 ? (
              <EmptyState
                message="No apps yet"
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingApp(null)
                      setAppDialogOpen(true)
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    Add your first app
                  </Button>
                }
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">App</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">URL</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Description</th>
                      <th className="px-4 py-2.5 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {apps.map((app, i) => (
                      <tr
                        key={app.id}
                        className={`${i < apps.length - 1 ? "border-b border-border" : ""} hover:bg-muted/20 transition-colors`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                              style={{ backgroundColor: `${app.color}20` }}
                            >
                              {app.icon}
                            </div>
                            <span className="font-medium">{app.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                          <span className="truncate max-w-[200px] block">{app.url}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                          <span className="truncate max-w-[240px] block">
                            {app.description ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingApp(app)
                                setAppDialogOpen(true)
                              }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <DeleteButton onConfirm={() => deleteApp(app.id)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Users tab */}
          <TabsContent value="users">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                {users.length} user{users.length !== 1 ? "s" : ""}
              </p>
              <Button
                size="sm"
                onClick={() => {
                  setEditingUser(null)
                  setUserDialogOpen(true)
                }}
              >
                <Plus className="w-4 h-4" />
                Add user
              </Button>
            </div>

            {loadingUsers ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
              <EmptyState message="No users yet" />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">User</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Email</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Role</th>
                      <th className="px-4 py-2.5 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user, i) => (
                      <tr
                        key={user.id}
                        className={`${i < users.length - 1 ? "border-b border-border" : ""} hover:bg-muted/20 transition-colors`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary shrink-0">
                              {(user.name ?? user.email)[0].toUpperCase()}
                            </div>
                            <span className="font-medium">{user.name ?? user.email}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                          {user.email}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                            {user.role}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingUser(user)
                                setUserDialogOpen(true)
                              }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <DeleteButton onConfirm={() => deleteUser(user.id)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AppFormDialog
        open={appDialogOpen}
        onOpenChange={setAppDialogOpen}
        app={editingApp}
        onSave={handleAppSaved}
      />

      <UserFormDialog
        open={userDialogOpen}
        onOpenChange={setUserDialogOpen}
        user={editingUser}
        onSave={handleUserSaved}
      />
    </>
  )
}

function EmptyState({
  message,
  action,
}: {
  message: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <p className="text-sm font-medium">{message}</p>
      {action}
    </div>
  )
}

function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
