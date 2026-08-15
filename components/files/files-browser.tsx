"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  ChevronRight,
  Download,
  File as FileIcon,
  Folder,
  FolderPlus,
  FolderUp,
  HardDrive,
  Home,
  Loader2,
  Lock,
  RefreshCw,
  Trash2,
  Upload,
  UploadCloud,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
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
import { cn } from "@/lib/utils"
import { formatBytes, formatRelative } from "@/lib/console/format"
import { gatherDroppedFiles, gatherInputFiles } from "@/lib/files/upload-client"
import type { DirEntry, FileRootInfo, ListResponse } from "@/lib/files/types"
import { useUploads } from "./use-uploads"
import { UploadQueue } from "./upload-queue"

function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

export function FilesBrowser() {
  const [roots, setRoots] = useState<FileRootInfo[]>([])
  const [rootId, setRootId] = useState<string>("")
  const [cwd, setCwd] = useState<string>("")
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DirEntry | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const dragDepth = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const root = roots.find((r) => r.id === rootId)
  const writable = root?.writable ?? false

  const ctxRef = useRef({ rootId, cwd, overwrite })
  useEffect(() => {
    ctxRef.current = { rootId, cwd, overwrite }
  }, [rootId, cwd, overwrite])

  const loadDir = useCallback(async (rid: string, dir: string) => {
    if (!rid) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ root: rid, path: dir })
      const r = await fetch(`/api/files/list?${params.toString()}`, { cache: "no-store" })
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? `Failed to load (HTTP ${r.status})`)
        setEntries([])
        return
      }
      const data = (await r.json()) as ListResponse
      setEntries(data.entries)
    } catch {
      setError("Failed to reach the server")
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  const { items, enqueue, cancel, clearFinished } = useUploads(
    () => ({ rootId: ctxRef.current.rootId, dir: ctxRef.current.cwd, overwrite: ctxRef.current.overwrite }),
    () => loadDir(ctxRef.current.rootId, ctxRef.current.cwd),
  )

  // Load roots once.
  useEffect(() => {
    let cancelled = false
    fetch("/api/files/roots", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { roots: [] }))
      .then((data: { roots?: FileRootInfo[] }) => {
        if (cancelled) return
        const list = data.roots ?? []
        setRoots(list)
        if (list.length > 0) setRootId((prev) => prev || list[0].id)
      })
      .catch(() => setError("Failed to load file locations"))
    return () => {
      cancelled = true
    }
  }, [])

  // Reload listing whenever the root or directory changes.
  useEffect(() => {
    if (rootId) loadDir(rootId, cwd)
  }, [rootId, cwd, loadDir])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const switchRoot = useCallback((id: string) => {
    setRootId(id)
    setCwd("")
  }, [])

  const openFolder = useCallback((name: string) => {
    setCwd((prev) => joinPath(prev, name))
  }, [])

  const goToCrumb = useCallback((index: number) => {
    setCwd((prev) => {
      if (index < 0) return ""
      return prev.split("/").slice(0, index + 1).join("/")
    })
  }, [])

  // ---- Drag & drop ----------------------------------------------------------
  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!ctxRef.current.rootId) return
    dragDepth.current += 1
    setDragging(true)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }, [])

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      if (!writable) {
        setToast("This location is read-only")
        return
      }
      const files = await gatherDroppedFiles(e.dataTransfer)
      if (files.length === 0) {
        setToast("No files found in the drop")
        return
      }
      enqueue(files)
    },
    [enqueue, writable],
  )

  // ---- File picker inputs ---------------------------------------------------
  const onPickFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = gatherInputFiles(e.target.files)
      if (files.length > 0) enqueue(files)
      e.target.value = ""
    },
    [enqueue],
  )

  // ---- New folder -----------------------------------------------------------
  const createFolder = useCallback(async () => {
    const name = newFolderName.trim()
    if (!name) return
    setCreating(true)
    try {
      const r = await fetch("/api/files/mkdir", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ root: rootId, path: cwd, name }),
      })
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string }
        setToast(data.error ?? "Could not create folder")
        return
      }
      setNewFolderOpen(false)
      setNewFolderName("")
      loadDir(rootId, cwd)
    } finally {
      setCreating(false)
    }
  }, [newFolderName, rootId, cwd, loadDir])

  // ---- Delete ---------------------------------------------------------------
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const r = await fetch("/api/files/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          root: rootId,
          path: joinPath(cwd, deleteTarget.name),
          recursive: deleteTarget.type === "dir",
        }),
      })
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string }
        setToast(data.error ?? "Could not delete")
        return
      }
      setToast(`Deleted ${deleteTarget.name}`)
      setDeleteTarget(null)
      loadDir(rootId, cwd)
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, rootId, cwd, loadDir])

  // ---- Download -------------------------------------------------------------
  const download = useCallback(
    (entry: DirEntry) => {
      const params = new URLSearchParams({ root: rootId, path: joinPath(cwd, entry.name) })
      const a = document.createElement("a")
      a.href = `/api/files/download?${params.toString()}`
      a.download = entry.name
      document.body.appendChild(a)
      a.click()
      a.remove()
    },
    [rootId, cwd],
  )

  const crumbs = cwd ? cwd.split("/") : []

  return (
    <>
      <div className="flex items-center justify-between px-6 h-14 border-b border-border">
        <h1 className="text-sm font-medium">Files</h1>
        <p className="text-xs text-muted-foreground hidden sm:block">
          Drop files from this computer onto the server
        </p>
      </div>

      <div className="p-6 space-y-4">
        {/* Root selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {roots.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => switchRoot(r.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors",
                r.id === rootId
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
              title={r.path}
            >
              <HardDrive className="w-3.5 h-3.5" />
              {r.label}
              {!r.writable && <Lock className="w-3 h-3 opacity-70" />}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm min-w-0 flex-1">
            <button
              onClick={() => goToCrumb(-1)}
              className="flex items-center gap-1 px-1.5 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
              title={root?.label ?? "Root"}
            >
              <Home className="w-3.5 h-3.5" />
            </button>
            {crumbs.map((seg, i) => (
              <div key={i} className="flex items-center gap-1 min-w-0">
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                <button
                  onClick={() => goToCrumb(i)}
                  className={cn(
                    "px-1.5 py-1 rounded truncate transition-colors hover:bg-accent",
                    i === crumbs.length - 1 ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {seg}
                </button>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none mr-1">
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
              Replace existing
            </label>
            <Button variant="ghost" size="sm" onClick={() => loadDir(rootId, cwd)} disabled={loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
            {writable && (
              <>
                <Button variant="outline" size="sm" onClick={() => setNewFolderOpen(true)}>
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span className="ml-1.5 hidden sm:inline">New folder</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => folderInputRef.current?.click()}>
                  <FolderUp className="w-3.5 h-3.5" />
                  <span className="ml-1.5 hidden sm:inline">Folder</span>
                </Button>
                <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5" />
                  <span className="ml-1.5">Upload</span>
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Drop zone / listing */}
        <div
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={cn(
            "relative rounded-xl border border-border min-h-[420px] transition-colors",
            dragging && writable && "border-primary/60 bg-primary/5",
          )}
        >
          {/* Drag overlay */}
          {dragging && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/80 backdrop-blur-sm pointer-events-none">
              <div className="flex flex-col items-center gap-2 text-primary">
                <UploadCloud className="w-10 h-10" />
                <p className="text-sm font-medium">
                  {writable ? `Drop to upload to ${root?.label}${cwd ? `/${cwd}` : ""}` : "This location is read-only"}
                </p>
              </div>
            </div>
          )}

          {error ? (
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
              <AlertTriangle className="w-8 h-8 text-amber-400" />
              <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
            </div>
          ) : loading && entries.length === 0 ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <EmptyState writable={writable} onPick={() => fileInputRef.current?.click()} />
          ) : (
            <div className="divide-y divide-border">
              <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground">
                <span className="flex-1">Name</span>
                <span className="w-24 text-right hidden sm:block">Size</span>
                <span className="w-28 text-right hidden md:block">Modified</span>
                <span className="w-20" />
              </div>
              {entries.map((entry) => (
                <Row
                  key={entry.name}
                  entry={entry}
                  writable={writable}
                  onOpen={() => openFolder(entry.name)}
                  onDownload={() => download(entry)}
                  onDelete={() => setDeleteTarget(entry)}
                />
              ))}
            </div>
          )}
        </div>

        {root && (
          <p className="text-xs text-muted-foreground font-mono truncate">
            {root.path}
            {cwd ? `/${cwd}` : ""}
          </p>
        )}
      </div>

      {/* Hidden inputs */}
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onPickFiles} />
      <input
        ref={(el) => {
          folderInputRef.current = el
          if (el) el.setAttribute("webkitdirectory", "")
        }}
        type="file"
        multiple
        className="hidden"
        onChange={onPickFiles}
      />

      {/* New folder dialog */}
      <Dialog open={newFolderOpen} onOpenChange={(o) => !o && setNewFolderOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>
              Create a folder in {root?.label}
              {cwd ? `/${cwd}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createFolder()
            }}
          />
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createFolder} disabled={creating || !newFolderName.trim()}>
              {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span className={creating ? "ml-1.5" : ""}>Create</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type === "dir" ? "folder" : "file"}?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono text-foreground">{deleteTarget?.name}</span>
              {deleteTarget?.type === "dir"
                ? " and everything inside it will be permanently deleted."
                : " will be permanently deleted."}{" "}
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UploadQueue items={items} onCancel={cancel} onClear={clearFinished} />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background text-sm px-4 py-2 rounded-md shadow-lg">
          {toast}
        </div>
      )}
    </>
  )
}

function Row({
  entry,
  writable,
  onOpen,
  onDownload,
  onDelete,
}: {
  entry: DirEntry
  writable: boolean
  onOpen: () => void
  onDownload: () => void
  onDelete: () => void
}) {
  const isDir = entry.type === "dir"
  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
      <button
        onClick={isDir ? onOpen : onDownload}
        className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
      >
        {isDir ? (
          <Folder className="w-4 h-4 text-primary shrink-0" />
        ) : (
          <FileIcon className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
        <span className="text-sm truncate">{entry.name}</span>
        {entry.symlink && <span className="text-[10px] text-muted-foreground shrink-0">link</span>}
      </button>
      <span className="w-24 text-right text-xs text-muted-foreground tabular-nums hidden sm:block">
        {isDir ? "—" : formatBytes(entry.size)}
      </span>
      <span className="w-28 text-right text-xs text-muted-foreground hidden md:block">
        {entry.mtimeMs ? formatRelative(new Date(entry.mtimeMs).toISOString()) : "—"}
      </span>
      <div className="w-20 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isDir && (
          <button
            onClick={onDownload}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Download"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        )}
        {writable && (
          <button
            onClick={onDelete}
            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function EmptyState({ writable, onPick }: { writable: boolean; onPick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
        <UploadCloud className="w-6 h-6 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium">This folder is empty</p>
        <p className="text-xs text-muted-foreground mt-1">
          {writable ? "Drag files anywhere here, or use the Upload button." : "This location is read-only."}
        </p>
      </div>
      {writable && (
        <Button variant="outline" size="sm" onClick={onPick}>
          <Upload className="w-3.5 h-3.5" />
          <span className="ml-1.5">Upload files</span>
        </Button>
      )}
    </div>
  )
}
