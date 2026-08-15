import "server-only"
import path from "node:path"
import fs from "node:fs"
import fsp from "node:fs/promises"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { NextResponse } from "next/server"
import { getRoot, getRoots, type FileRoot } from "./roots"
import type { DirEntry, FileRootInfo, UploadResult } from "./types"

/** Carries an HTTP status so route handlers can translate failures cleanly. */
export class FileError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = "FileError"
  }
}

export function toErrorResponse(e: unknown): NextResponse {
  if (e instanceof FileError) {
    return NextResponse.json({ error: e.message }, { status: e.status })
  }
  const message = e instanceof Error ? e.message : "Unexpected error"
  return NextResponse.json({ error: message }, { status: 500 })
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.lstat(p)
    return true
  } catch {
    return false
  }
}

async function ensureRoot(root: FileRoot): Promise<void> {
  if (root.ensure) await fsp.mkdir(root.path, { recursive: true })
}

function requireRoot(rootId: string): FileRoot {
  const root = getRoot(rootId)
  if (!root) throw new FileError(404, "Unknown root")
  return root
}

/**
 * Resolve a path relative to a root and guarantee it cannot escape — both
 * lexically (no `..`, no absolute paths) and via realpath of the nearest
 * existing ancestor (blocks symlink escapes). Returns the absolute path.
 */
async function resolveSafe(root: FileRoot, relPath: string): Promise<string> {
  const cleaned = String(relPath ?? "").replace(/^[/\\]+/, "")
  const abs = path.resolve(root.path, cleaned)
  const rel = path.relative(root.path, abs)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new FileError(400, "Path escapes root")
  }

  // Walk up to the deepest component that actually exists, then realpath it.
  let probe = abs
  while (probe !== root.path && !(await pathExists(probe))) {
    const parent = path.dirname(probe)
    if (parent === probe) break
    probe = parent
  }
  try {
    const realRoot = await fsp.realpath(root.path)
    const real = await fsp.realpath(probe)
    const relReal = path.relative(realRoot, real)
    if (relReal !== "" && (relReal.startsWith("..") || path.isAbsolute(relReal))) {
      throw new FileError(400, "Path escapes root via symlink")
    }
  } catch (e) {
    if (e instanceof FileError) throw e
    // realpath failed (e.g. root itself missing) — lexical check already passed.
  }
  return abs
}

/** Reject a single path segment that could traverse or be malformed. */
function assertSegment(seg: string): void {
  if (!seg || seg === "." || seg === ".." || seg.includes("\0")) {
    throw new FileError(400, "Invalid name")
  }
}

function sanitizeName(name: string): string {
  const n = String(name ?? "").trim()
  if (n.includes("/") || n.includes("\\")) throw new FileError(400, "Invalid name")
  assertSegment(n)
  return n
}

/** Normalize a (possibly nested, "/"-separated) upload name into safe segments. */
function sanitizeRelName(name: string): string {
  const segs = String(name ?? "")
    .split(/[/\\]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (segs.length === 0) throw new FileError(400, "Invalid name")
  for (const seg of segs) assertSegment(seg)
  return segs.join(path.sep)
}

export async function listRoots(): Promise<FileRootInfo[]> {
  const out: FileRootInfo[] = []
  for (const r of getRoots()) {
    await ensureRoot(r).catch(() => {})
    out.push({
      id: r.id,
      label: r.label,
      path: r.path,
      writable: r.writable,
      exists: await pathExists(r.path),
    })
  }
  return out
}

export async function listDir(rootId: string, relPath: string): Promise<DirEntry[]> {
  const root = requireRoot(rootId)
  await ensureRoot(root).catch(() => {})
  const abs = await resolveSafe(root, relPath)

  let dirents: fs.Dirent[]
  try {
    dirents = await fsp.readdir(abs, { withFileTypes: true })
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === "ENOENT") throw new FileError(404, "Directory not found")
    if (code === "ENOTDIR") throw new FileError(400, "Not a directory")
    throw new FileError(500, "Cannot read directory")
  }

  const entries: DirEntry[] = []
  for (const d of dirents) {
    const full = path.join(abs, d.name)
    const symlink = d.isSymbolicLink()
    let type: "file" | "dir" = "file"
    let size = 0
    let mtimeMs = 0
    try {
      const st = await fsp.stat(full) // follows symlinks
      type = st.isDirectory() ? "dir" : "file"
      size = st.isDirectory() ? 0 : st.size
      mtimeMs = st.mtimeMs
    } catch {
      try {
        const ls = await fsp.lstat(full) // broken symlink — best effort
        type = ls.isDirectory() ? "dir" : "file"
        mtimeMs = ls.mtimeMs
      } catch {
        /* unreadable entry — skip stats */
      }
    }
    entries.push({ name: d.name, type, size, mtimeMs, symlink })
  }

  entries.sort((a, b) =>
    a.type === b.type
      ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
      : a.type === "dir"
        ? -1
        : 1,
  )
  return entries
}

export async function makeDir(rootId: string, relPath: string, name: string): Promise<void> {
  const root = requireRoot(rootId)
  if (!root.writable) throw new FileError(403, "This location is read-only")
  const safe = sanitizeName(name)
  const parentAbs = await resolveSafe(root, relPath)
  const abs = await resolveSafe(root, path.join(relPath, safe))
  const parentStat = await fsp.stat(parentAbs).catch(() => null)
  if (!parentStat || !parentStat.isDirectory()) throw new FileError(404, "Folder not found")
  try {
    await fsp.mkdir(abs, { recursive: false })
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") {
      throw new FileError(409, "A file or folder with that name already exists")
    }
    throw new FileError(500, "Cannot create folder")
  }
}

export async function removeEntry(
  rootId: string,
  relPath: string,
  recursive: boolean,
): Promise<void> {
  const root = requireRoot(rootId)
  if (!root.writable) throw new FileError(403, "This location is read-only")
  const cleaned = String(relPath ?? "").replace(/^[/\\]+/, "")
  if (!cleaned) throw new FileError(400, "Cannot delete the root folder")
  const abs = await resolveSafe(root, cleaned)
  const st = await fsp.lstat(abs).catch(() => null)
  if (!st) throw new FileError(404, "Not found")

  if (st.isDirectory() && !st.isSymbolicLink()) {
    const children = await fsp.readdir(abs)
    if (children.length > 0 && !recursive) {
      throw new FileError(409, "Folder is not empty")
    }
    await fsp.rm(abs, { recursive: true, force: true })
  } else {
    await fsp.unlink(abs)
  }
}

export interface DownloadHandle {
  stream: fs.ReadStream
  size: number
  name: string
}

export async function openDownload(rootId: string, relPath: string): Promise<DownloadHandle> {
  const root = requireRoot(rootId)
  const abs = await resolveSafe(root, relPath)
  const st = await fsp.stat(abs).catch(() => null)
  if (!st) throw new FileError(404, "File not found")
  if (st.isDirectory()) throw new FileError(400, "Cannot download a folder")
  return { stream: fs.createReadStream(abs), size: st.size, name: path.basename(abs) }
}

async function dedupeName(dirAbs: string, name: string): Promise<string> {
  if (!(await pathExists(path.join(dirAbs, name)))) return name
  const ext = path.extname(name)
  const stem = name.slice(0, name.length - ext.length)
  for (let i = 1; i < 1000; i++) {
    const candidate = `${stem} (${i})${ext}`
    if (!(await pathExists(path.join(dirAbs, candidate)))) return candidate
  }
  return `${stem} (${Date.now()})${ext}`
}

export interface WriteUploadOptions {
  rootId: string
  /** Directory the user is browsing, relative to the root. */
  relDir: string
  /** File name, optionally "/"-nested for folder uploads. */
  name: string
  overwrite: boolean
  body: ReadableStream<Uint8Array>
}

export async function writeUpload(opts: WriteUploadOptions): Promise<UploadResult> {
  const root = requireRoot(opts.rootId)
  if (!root.writable) throw new FileError(403, "This location is read-only")
  await ensureRoot(root).catch(() => {})

  const safeRel = sanitizeRelName(opts.name)
  const targetAbs = await resolveSafe(root, path.join(opts.relDir, safeRel))
  const parentAbs = path.dirname(targetAbs)

  // Create intermediate folders (for nested folder uploads) — confined to root.
  await resolveSafe(root, path.relative(root.path, parentAbs))
  await fsp.mkdir(parentAbs, { recursive: true })

  const baseName = path.basename(targetAbs)
  const finalName = opts.overwrite ? baseName : await dedupeName(parentAbs, baseName)
  const finalAbs = path.join(parentAbs, finalName)

  // Stream to a temp file in the same dir, then atomically rename into place.
  const tmpAbs = path.join(
    parentAbs,
    `.reach-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.part`,
  )
  try {
    const nodeStream = Readable.fromWeb(opts.body as Parameters<typeof Readable.fromWeb>[0])
    await pipeline(nodeStream, fs.createWriteStream(tmpAbs))
    await fsp.rename(tmpAbs, finalAbs)
  } catch {
    await fsp.rm(tmpAbs, { force: true }).catch(() => {})
    throw new FileError(500, "Upload failed")
  }

  const st = await fsp.stat(finalAbs)
  return {
    name: finalName,
    size: st.size,
    path: path.relative(root.path, finalAbs),
  }
}
