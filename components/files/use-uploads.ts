"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { uploadFile, UploadError, type GatheredFile, type UploadHandle } from "@/lib/files/upload-client"

export type UploadStatus = "queued" | "uploading" | "done" | "error" | "canceled"

export interface UploadItem {
  id: string
  /** Display path ("/"-separated, includes any folder structure). */
  relPath: string
  size: number
  loaded: number
  status: UploadStatus
  error?: string
  finalName?: string
}

interface PendingUpload {
  file: Blob
  relPath: string
  rootId: string
  dir: string
  overwrite: boolean
}

const MAX_CONCURRENT = 3

let counter = 0
function nextId(): string {
  counter += 1
  return `up-${Date.now().toString(36)}-${counter}`
}

export interface UploadContext {
  rootId: string
  dir: string
  overwrite: boolean
}

/**
 * Manages a concurrency-limited queue of file uploads with live progress.
 * `getContext` is read at enqueue time so each file remembers where it was
 * dropped even if the user navigates afterwards. `onComplete` fires (debounced)
 * after successful uploads so the caller can refresh the directory listing.
 */
export function useUploads(getContext: () => UploadContext, onComplete: () => void) {
  const [items, setItems] = useState<UploadItem[]>([])

  const pending = useRef(new Map<string, PendingUpload>())
  const handles = useRef(new Map<string, UploadHandle>())
  const queue = useRef<string[]>([])
  const active = useRef(0)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const getContextRef = useRef(getContext)
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    getContextRef.current = getContext
    onCompleteRef.current = onComplete
  })

  const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...changes } : it)))
  }, [])

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => onCompleteRef.current(), 400)
  }, [])

  const pump = useCallback(() => {
    while (active.current < MAX_CONCURRENT && queue.current.length > 0) {
      const id = queue.current.shift()!
      const job = pending.current.get(id)
      if (!job) continue
      active.current += 1
      patch(id, { status: "uploading" })

      const handle = uploadFile({
        rootId: job.rootId,
        dir: job.dir,
        relPath: job.relPath,
        file: job.file,
        overwrite: job.overwrite,
        onProgress: (loaded) => patch(id, { loaded }),
      })
      handles.current.set(id, handle)

      handle.promise
        .then((res) => {
          patch(id, { status: "done", loaded: job.file.size, finalName: res.name })
          scheduleRefresh()
        })
        .catch((err: unknown) => {
          const canceled = err instanceof UploadError && err.status === 0 && err.message === "Canceled"
          patch(id, {
            status: canceled ? "canceled" : "error",
            error: err instanceof Error ? err.message : "Upload failed",
          })
        })
        .finally(() => {
          active.current -= 1
          handles.current.delete(id)
          pending.current.delete(id)
          pump()
        })
    }
  }, [patch, scheduleRefresh])

  const enqueue = useCallback(
    (files: GatheredFile[]) => {
      if (files.length === 0) return
      const ctx = getContextRef.current()
      const newItems: UploadItem[] = []
      for (const f of files) {
        const id = nextId()
        pending.current.set(id, {
          file: f.file,
          relPath: f.relPath,
          rootId: ctx.rootId,
          dir: ctx.dir,
          overwrite: ctx.overwrite,
        })
        queue.current.push(id)
        newItems.push({
          id,
          relPath: f.relPath,
          size: f.file.size,
          loaded: 0,
          status: "queued",
        })
      }
      setItems((prev) => [...prev, ...newItems])
      pump()
    },
    [pump],
  )

  const cancel = useCallback(
    (id: string) => {
      const handle = handles.current.get(id)
      if (handle) {
        handle.cancel()
      } else {
        // Not started yet — drop it from the queue.
        queue.current = queue.current.filter((q) => q !== id)
        pending.current.delete(id)
        patch(id, { status: "canceled" })
      }
    },
    [patch],
  )

  const clearFinished = useCallback(() => {
    setItems((prev) => prev.filter((it) => it.status === "queued" || it.status === "uploading"))
  }, [])

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      handles.current.forEach((h) => h.cancel())
    }
  }, [])

  return { items, enqueue, cancel, clearFinished }
}
