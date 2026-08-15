"use client"

import type { UploadResult } from "./types"

export class UploadError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = "UploadError"
  }
}

export interface UploadHandle {
  promise: Promise<UploadResult>
  /** Abort the in-flight request. */
  cancel: () => void
}

export interface UploadFileOptions {
  rootId: string
  /** Destination directory relative to the root. */
  dir: string
  /** File name, optionally "/"-nested for folder uploads. */
  relPath: string
  file: Blob
  overwrite: boolean
  onProgress?: (loaded: number, total: number) => void
}

function parseError(responseText: string, status: number): string {
  try {
    const parsed = JSON.parse(responseText) as { error?: string }
    if (parsed.error) return parsed.error
  } catch {
    /* non-JSON error body */
  }
  return `Upload failed (HTTP ${status})`
}

/**
 * Stream a single file to the server with progress reporting. Uses
 * XMLHttpRequest because `fetch` cannot report upload progress.
 */
export function uploadFile(opts: UploadFileOptions): UploadHandle {
  const xhr = new XMLHttpRequest()
  const params = new URLSearchParams({
    root: opts.rootId,
    path: opts.dir,
    name: opts.relPath,
    overwrite: opts.overwrite ? "1" : "0",
  })

  const promise = new Promise<UploadResult>((resolve, reject) => {
    xhr.open("POST", `/api/files/upload?${params.toString()}`)
    xhr.responseType = "text"

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded, e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResult)
        } catch {
          resolve({ name: opts.relPath, size: 0, path: opts.relPath })
        }
      } else {
        reject(new UploadError(xhr.status, parseError(xhr.responseText, xhr.status)))
      }
    }
    xhr.onerror = () => reject(new UploadError(0, "Network error"))
    xhr.onabort = () => reject(new UploadError(0, "Canceled"))
    xhr.send(opts.file)
  })

  return { promise, cancel: () => xhr.abort() }
}

export interface GatheredFile {
  file: File
  /** Path relative to the drop, "/"-separated (includes folder structure). */
  relPath: string
}

interface FsEntry {
  isFile: boolean
  isDirectory: boolean
  name: string
  file: (cb: (f: File) => void, err: (e: unknown) => void) => void
  createReader: () => { readEntries: (cb: (e: FsEntry[]) => void, err: (e: unknown) => void) => void }
}

function entryToFile(entry: FsEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

function readAllEntries(reader: ReturnType<FsEntry["createReader"]>): Promise<FsEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FsEntry[] = []
    const next = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all)
        } else {
          all.push(...batch)
          next()
        }
      }, reject)
    }
    next()
  })
}

async function walkEntry(entry: FsEntry, prefix: string, out: GatheredFile[]): Promise<void> {
  if (entry.isFile) {
    try {
      const file = await entryToFile(entry)
      out.push({ file, relPath: prefix ? `${prefix}/${entry.name}` : entry.name })
    } catch {
      /* unreadable file — skip */
    }
  } else if (entry.isDirectory) {
    const childPrefix = prefix ? `${prefix}/${entry.name}` : entry.name
    const children = await readAllEntries(entry.createReader())
    for (const child of children) await walkEntry(child, childPrefix, out)
  }
}

/**
 * Extract files (recursively, preserving folder structure) from a drop event's
 * DataTransfer. Falls back to the flat file list when the entries API is
 * unavailable.
 */
export async function gatherDroppedFiles(dt: DataTransfer): Promise<GatheredFile[]> {
  const items = dt.items
  const supportsEntries =
    items && items.length > 0 && typeof (items[0] as unknown as { webkitGetAsEntry?: unknown }).webkitGetAsEntry === "function"

  if (supportsEntries) {
    const entries: FsEntry[] = []
    for (let i = 0; i < items.length; i++) {
      const entry = (items[i] as unknown as { webkitGetAsEntry: () => FsEntry | null }).webkitGetAsEntry()
      if (entry) entries.push(entry)
    }
    const out: GatheredFile[] = []
    for (const entry of entries) await walkEntry(entry, "", out)
    if (out.length > 0) return out
  }

  return Array.from(dt.files).map((file) => ({
    file,
    relPath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }))
}

/** Map a FileList (from <input>) into gathered files, honoring webkitRelativePath. */
export function gatherInputFiles(list: FileList | null): GatheredFile[] {
  if (!list) return []
  return Array.from(list).map((file) => ({
    file,
    relPath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }))
}
