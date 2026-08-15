import "server-only"
import os from "node:os"
import path from "node:path"

const HOME = process.env.HOME ?? os.homedir() ?? "/home/regan"

export interface FileRoot {
  id: string
  label: string
  path: string
  /** Uploads / mkdir / delete allowed when true; otherwise read-only. */
  writable: boolean
  /** Create the directory on demand (only the dedicated uploads root). */
  ensure: boolean
}

const UPLOADS_DIR = process.env.REACH_UPLOADS_DIR ?? path.join(HOME, "uploads")
const APPS_DIR = process.env.APPS_BASE_PATH ?? path.join(HOME, "apps")

/**
 * Optional extra roots via REACH_FILE_ROOTS, comma-separated entries of the
 * form `id:Label:/abs/path[:ro]`. Trailing `:ro` marks the root read-only.
 * Example: `media:Media:/srv/media,backups:Backups:/srv/backups:ro`
 */
function parseExtraRoots(): FileRoot[] {
  const raw = process.env.REACH_FILE_ROOTS
  if (!raw) return []
  const out: FileRoot[] = []
  for (const part of raw.split(",")) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const segs = trimmed.split(":")
    if (segs.length < 3) continue
    const id = segs[0].trim()
    const label = segs[1].trim()
    const readonly = segs[segs.length - 1].trim().toLowerCase() === "ro"
    const pathSegs = readonly ? segs.slice(2, -1) : segs.slice(2)
    const abs = pathSegs.join(":").trim()
    if (!id || !abs || !path.isAbsolute(abs)) continue
    out.push({ id, label: label || id, path: path.resolve(abs), writable: !readonly, ensure: false })
  }
  return out
}

/** Allowed destination roots, in display order. The first is the default. */
export function getRoots(): FileRoot[] {
  const base: FileRoot[] = [
    { id: "uploads", label: "Uploads", path: path.resolve(UPLOADS_DIR), writable: true, ensure: true },
    { id: "apps", label: "Apps", path: path.resolve(APPS_DIR), writable: true, ensure: false },
  ]
  const extra = parseExtraRoots()
  // De-dupe by id; base roots win.
  const seen = new Set(base.map((r) => r.id))
  return [...base, ...extra.filter((r) => !seen.has(r.id))]
}

export function getRoot(id: string): FileRoot | undefined {
  return getRoots().find((r) => r.id === id)
}
