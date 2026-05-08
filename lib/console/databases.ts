import "server-only"
import fs from "node:fs/promises"
import path from "node:path"
import { runCommand } from "./exec"
import type {
  AppInfo,
  DatabaseInfo,
  DatabaseInfoWithSize,
  DatabaseKind,
} from "./types"

const SQLITE_EXTS = new Set([".db", ".sqlite", ".sqlite3"])
const SQLITE_SCAN_MAX_DEPTH = 4
const SQLITE_EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "__pycache__",
  "vendor",
  ".next",
  "dist",
  "build",
  "target",
  ".venv",
  "venv",
])

interface ImageMatch {
  kind: DatabaseKind
  defaultDataPath: string
}

function classifyImage(image: string | null): ImageMatch | null {
  if (!image) return null
  const i = image.toLowerCase()
  if (
    i.includes("postgres") ||
    i.includes("timescale") ||
    i.includes("pgvector") ||
    i.includes("supabase/postgres")
  ) {
    return { kind: "postgres", defaultDataPath: "/var/lib/postgresql/data" }
  }
  if (i.includes("mariadb")) {
    return { kind: "mysql", defaultDataPath: "/var/lib/mysql" }
  }
  if (i.includes("mysql")) {
    return { kind: "mysql", defaultDataPath: "/var/lib/mysql" }
  }
  if (i.includes("mongo")) {
    return { kind: "mongodb", defaultDataPath: "/data/db" }
  }
  if (i.includes("redis")) {
    return { kind: "redis", defaultDataPath: "/data" }
  }
  return null
}

interface ParsedVolume {
  source: string
  target: string
}

function parseVolumeEntry(v: string): ParsedVolume | null {
  if (!v || !v.includes(":")) return null
  // Strip Windows drive letters that look like "C:\..." if any (not expected on Linux)
  const parts = v.split(":")
  if (parts.length < 2) return null
  return { source: parts[0], target: parts[1] }
}

async function findSqliteFiles(rootDir: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth >= SQLITE_SCAN_MAX_DEPTH) return
    let entries: import("node:fs").Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (SQLITE_EXCLUDED_DIRS.has(e.name) || e.name.startsWith(".")) continue
        await walk(full, depth + 1)
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase()
        if (SQLITE_EXTS.has(ext)) out.push(full)
      }
    }
  }
  await walk(rootDir, 0)
  out.sort()
  return out
}

function composeProjectName(composeFile: string): string {
  const folder = path.basename(path.dirname(composeFile))
  return folder.toLowerCase().replace(/[^a-z0-9_-]/g, "")
}

function isHostPath(src: string): boolean {
  return (
    src.startsWith("/") ||
    src.startsWith("./") ||
    src.startsWith("../") ||
    src.startsWith("~") ||
    src === "."
  )
}

function resolveHostPath(src: string, appPath: string): string {
  if (src.startsWith("~")) {
    return path.join(process.env.HOME ?? "", src.slice(1))
  }
  if (src.startsWith("/")) return src
  return path.resolve(appPath, src)
}

export async function detectAppDatabases(app: AppInfo): Promise<DatabaseInfo[]> {
  const databases: DatabaseInfo[] = []
  const seenLocations = new Set<string>()
  const project = composeProjectName(app.composeFile)

  // SQLite files in the app directory tree
  const sqliteFiles = await findSqliteFiles(app.path)
  for (const file of sqliteFiles) {
    const key = `file:${file}`
    if (seenLocations.has(key)) continue
    seenLocations.add(key)
    databases.push({
      kind: "sqlite",
      location: file,
      locationKind: "file",
      service: null,
      volumeName: null,
      hostPath: file,
    })
  }

  // Service-based databases via compose volume mounts
  for (const svc of app.services) {
    const match = classifyImage(svc.image)
    if (!match) continue

    let mappedAny = false
    for (const v of svc.volumes) {
      const parsed = parseVolumeEntry(v)
      if (!parsed) continue
      // We're interested in the data path mount; accept exact match or a
      // mount whose target is a parent of the default data path.
      if (
        parsed.target !== match.defaultDataPath &&
        !match.defaultDataPath.startsWith(parsed.target + "/")
      ) {
        continue
      }
      mappedAny = true
      const src = parsed.source
      if (isHostPath(src)) {
        const resolved = resolveHostPath(src, app.path)
        const key = `dir:${resolved}`
        if (seenLocations.has(key)) continue
        seenLocations.add(key)
        databases.push({
          kind: match.kind,
          location: resolved,
          locationKind: "directory",
          service: svc.name,
          volumeName: null,
          hostPath: resolved,
        })
      } else {
        const key = `vol:${src}:${svc.name}`
        if (seenLocations.has(key)) continue
        seenLocations.add(key)
        databases.push({
          kind: match.kind,
          location: `volume:${src}`,
          locationKind: "volume",
          service: svc.name,
          volumeName: src,
          hostPath: null,
        })
      }
    }

    if (!mappedAny) {
      const key = `eph:${svc.name}`
      if (seenLocations.has(key)) continue
      seenLocations.add(key)
      databases.push({
        kind: match.kind,
        location: "(ephemeral — no persistent volume)",
        locationKind: "unknown",
        service: svc.name,
        volumeName: null,
        hostPath: null,
      })
    }
  }

  // Apps that ship their own database (e.g. ChromaDB, custom SQLite) inside a
  // build-based service. These don't match any image classifier, so the data
  // file lives in a Docker named volume the host can't see directly.
  type VolumeScanTask = { svc: string; source: string }
  const tasks: VolumeScanTask[] = []
  for (const svc of app.services) {
    if (classifyImage(svc.image)) continue
    for (const v of svc.volumes) {
      const parsed = parseVolumeEntry(v)
      if (!parsed) continue
      if (isHostPath(parsed.source)) continue
      tasks.push({ svc: svc.name, source: parsed.source })
    }
  }

  const results = await Promise.all(
    tasks.map(async (t) => {
      const found = await dockerVolumeMountpoint([
        `${project}_${t.source}`,
        t.source,
      ])
      if (!found) return null
      const hits = await findSqliteInVolume(found.name)
      return { task: t, volume: found.name, hits }
    }),
  )

  for (const r of results) {
    if (!r) continue
    for (const inVolumePath of r.hits) {
      const key = `vol-sqlite:${r.volume}:${inVolumePath}`
      if (seenLocations.has(key)) continue
      seenLocations.add(key)
      databases.push({
        kind: "sqlite",
        location: `volume:${r.volume}${inVolumePath}`,
        locationKind: "file",
        service: r.task.svc,
        volumeName: r.volume,
        hostPath: null,
        inVolumePath,
      })
    }
  }

  return databases
}

async function findSqliteInVolume(volumeName: string): Promise<string[]> {
  const r = await runCommand(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${volumeName}:/data:ro`,
      "alpine:3",
      "sh",
      "-c",
      "find /data -maxdepth 5 -type f \\( -name '*.db' -o -name '*.sqlite' -o -name '*.sqlite3' \\) 2>/dev/null | head -20",
    ],
    { timeoutMs: 20_000 },
  )
  if (r.code !== 0) return []
  return r.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\/data/, ""))
    .filter(Boolean)
}

async function statFileInVolume(
  volumeName: string,
  inVolumePath: string,
): Promise<{ size: number; mtime: string | null } | null> {
  const r = await runCommand(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${volumeName}:/data:ro`,
      "alpine:3",
      "stat",
      "-c",
      "%s %Y",
      `/data${inVolumePath}`,
    ],
    { timeoutMs: 10_000 },
  )
  if (r.code !== 0) return null
  const parts = r.stdout.trim().split(/\s+/)
  if (parts.length < 2) return null
  const size = Number(parts[0])
  const t = Number(parts[1])
  if (!Number.isFinite(size)) return null
  const mtime =
    Number.isFinite(t) && t > 0 ? new Date(t * 1000).toISOString() : null
  return { size, mtime }
}

async function dockerVolumeMountpoint(
  candidates: string[],
): Promise<{ name: string; mountpoint: string } | null> {
  for (const name of candidates) {
    if (!name) continue
    const r = await runCommand(
      "docker",
      ["volume", "inspect", "-f", "{{.Mountpoint}}", name],
      { timeoutMs: 8000 },
    )
    if (r.code === 0) {
      const mp = r.stdout.trim()
      if (mp) return { name, mountpoint: mp }
    }
  }
  return null
}

async function sizeDockerVolumeViaContainer(
  volumeName: string,
): Promise<{ size: number; mtime: string | null } | null> {
  const r = await runCommand(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${volumeName}:/data:ro`,
      "alpine:3",
      "sh",
      "-c",
      "du -sb /data | cut -f1; find /data -type f -printf '%T@\\n' 2>/dev/null | sort -n | tail -1",
    ],
    { timeoutMs: 45_000 },
  )
  if (r.code !== 0) return null
  const lines = r.stdout.split("\n").map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null
  const size = Number(lines[0])
  if (!Number.isFinite(size)) return null
  let mtime: string | null = null
  if (lines.length > 1) {
    const t = Number(lines[1])
    if (Number.isFinite(t) && t > 0) {
      mtime = new Date(t * 1000).toISOString()
    }
  }
  return { size, mtime }
}

async function statFile(
  filePath: string,
): Promise<{ size: number; mtime: string } | null> {
  try {
    const s = await fs.stat(filePath)
    return { size: s.size, mtime: s.mtime.toISOString() }
  } catch {
    return null
  }
}

async function statDirectory(
  dirPath: string,
): Promise<{ size: number; mtime: string | null } | null> {
  try {
    const s = await fs.stat(dirPath)
    if (!s.isDirectory()) {
      return { size: s.size, mtime: s.mtime.toISOString() }
    }
  } catch {
    return null
  }
  const sizeRes = await runCommand("du", ["-sb", dirPath], { timeoutMs: 30_000 })
  if (sizeRes.code !== 0) return null
  const m = sizeRes.stdout.match(/^(\d+)/)
  if (!m) return null
  const size = Number(m[1])

  let mtime: string | null = null
  const mtRes = await runCommand(
    "find",
    [dirPath, "-type", "f", "-printf", "%T@\\n"],
    { timeoutMs: 15_000 },
  )
  if (mtRes.code === 0) {
    let max = 0
    for (const line of mtRes.stdout.split("\n")) {
      const t = Number(line.trim())
      if (Number.isFinite(t) && t > max) max = t
    }
    if (max > 0) mtime = new Date(max * 1000).toISOString()
  }
  return { size, mtime }
}

export async function getDatabasesWithSizes(
  app: AppInfo,
): Promise<DatabaseInfoWithSize[]> {
  const dbs = app.databases ?? (await detectAppDatabases(app))
  const project = composeProjectName(app.composeFile)
  const results: DatabaseInfoWithSize[] = []

  for (const db of dbs) {
    let resolved: DatabaseInfo = db
    let sizeBytes: number | null = null
    let lastModified: string | null = null
    let error: string | null = null

    if (db.locationKind === "file" && db.hostPath) {
      const r = await statFile(db.hostPath)
      if (r) {
        sizeBytes = r.size
        lastModified = r.mtime
      } else {
        error = "file not found"
      }
    } else if (
      db.locationKind === "file" &&
      db.volumeName &&
      db.inVolumePath
    ) {
      const r = await statFileInVolume(db.volumeName, db.inVolumePath)
      if (r) {
        sizeBytes = r.size
        lastModified = r.mtime
      } else {
        error = "file in volume not accessible"
      }
    } else if (db.locationKind === "directory" && db.hostPath) {
      const r = await statDirectory(db.hostPath)
      if (r) {
        sizeBytes = r.size
        lastModified = r.mtime
      } else {
        error = "directory not accessible (may require root)"
      }
    } else if (db.locationKind === "volume" && db.volumeName) {
      const candidates = [
        `${project}_${db.volumeName}`,
        db.volumeName,
      ]
      const found = await dockerVolumeMountpoint(candidates)
      if (found) {
        resolved = {
          ...db,
          hostPath: found.mountpoint,
          location: `volume:${found.name} → ${found.mountpoint}`,
        }
        const direct = await statDirectory(found.mountpoint)
        if (direct) {
          sizeBytes = direct.size
          lastModified = direct.mtime
        } else {
          const viaContainer = await sizeDockerVolumeViaContainer(found.name)
          if (viaContainer) {
            sizeBytes = viaContainer.size
            lastModified = viaContainer.mtime
          } else {
            error = "size unavailable"
          }
        }
      } else {
        error = "volume not present (start the app to materialize it)"
      }
    } else {
      error = "no persistent volume mount detected"
    }

    results.push({
      ...resolved,
      sizeBytes,
      lastModified,
      error,
    })
  }

  return results
}
