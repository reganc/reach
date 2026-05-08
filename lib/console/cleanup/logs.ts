import "server-only"
import fs from "node:fs/promises"
import path from "node:path"
import { runCommand } from "../exec"
import type { CategoryScan, CleanupItem, PruneResult } from "./types"

// ── Container log files ──────────────────────────────────────────────────────
// /var/lib/docker/containers/<id>/*-json.log can grow without bound when
// log rotation isn't configured. We list the files, sizes, and ages.

export async function scanContainerLogs(): Promise<CategoryScan> {
  const items: CleanupItem[] = []
  let totalBytes = 0
  const res = await runCommand(
    "find",
    [
      "/var/lib/docker/containers",
      "-maxdepth", "2",
      "-type", "f",
      "-name", "*-json.log*",
      "-printf", "%s\\t%T@\\t%p\\n",
    ],
    { timeoutMs: 30_000 },
  )
  if (res.code !== 0) {
    return { category: "container-logs", items, totalBytes, reclaimableBytes: 0, scannedAt: new Date().toISOString(), warnings: [res.stderr.trim().slice(0, 200)] }
  }
  // Map container ID to name for friendly labels.
  const idToName = await containerIdToName()
  for (const line of res.stdout.split("\n")) {
    if (!line.trim()) continue
    const [sizeStr, mtimeStr, ...pathParts] = line.split("\t")
    const filePath = pathParts.join("\t")
    const bytes = Number(sizeStr)
    if (!Number.isFinite(bytes) || bytes < 1024 * 1024) continue
    const containerId = path.basename(path.dirname(filePath))
    const friendlyName = idToName.get(containerId) ?? containerId.slice(0, 12)
    const mtimeSec = Number(mtimeStr)
    const ageMs = Number.isFinite(mtimeSec) ? Date.now() - mtimeSec * 1000 : undefined
    totalBytes += bytes
    items.push({
      id: filePath,
      category: "container-logs",
      label: `${friendlyName} · ${path.basename(filePath)}`,
      detail: filePath,
      path: filePath,
      bytes,
      ageMs,
      meta: { containerId },
    })
  }
  items.sort((a, b) => b.bytes - a.bytes)
  return { category: "container-logs", items, totalBytes, reclaimableBytes: totalBytes, scannedAt: new Date().toISOString() }
}

async function containerIdToName(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const res = await runCommand("docker", ["ps", "-a", "--format", "{{.ID}}\t{{.Names}}"], { timeoutMs: 10_000 })
  if (res.code !== 0) return map
  for (const line of res.stdout.split("\n")) {
    const [id, name] = line.split("\t")
    if (id && name) map.set(id.trim(), name.trim())
  }
  return map
}

export async function pruneContainerLogs(dryRun: boolean, ids?: string[]): Promise<PruneResult> {
  const scan = await scanContainerLogs()
  const targets = ids && ids.length > 0
    ? scan.items.filter((it) => ids.includes(it.id))
    : scan.items
  if (dryRun) {
    return { category: "container-logs", dryRun: true, preview: targets, totalBytes: scan.totalBytes, bytesFreed: 0 }
  }
  // We *truncate* rather than unlink; Docker's logging driver holds an open
  // file handle and unlinking would only reclaim space after container restart.
  const executed: PruneResult["executed"] = []
  let freed = 0
  for (const t of targets) {
    if (!t.path || !t.path.startsWith("/var/lib/docker/containers/")) {
      executed.push({ id: t.id, ok: false, error: "outside docker logs path", bytesFreed: 0 })
      continue
    }
    const res = await runCommand("truncate", ["-s", "0", t.path], { timeoutMs: 5000 })
    const ok = res.code === 0
    if (ok) freed += t.bytes
    executed.push({ id: t.id, ok, error: ok ? undefined : res.stderr.trim().slice(0, 300), bytesFreed: ok ? t.bytes : 0 })
  }
  return { category: "container-logs", dryRun: false, preview: targets, executed, totalBytes: scan.totalBytes, bytesFreed: freed }
}

// ── Journald usage ───────────────────────────────────────────────────────────

export async function scanJournald(): Promise<CategoryScan> {
  const res = await runCommand("journalctl", ["--disk-usage"], { timeoutMs: 10_000 })
  const items: CleanupItem[] = []
  if (res.code !== 0) {
    return { category: "journald", items, totalBytes: 0, reclaimableBytes: 0, scannedAt: new Date().toISOString(), warnings: [res.stderr.trim().slice(0, 200)] }
  }
  // "Archived and active journals take up 2.4G in the file system."
  const m = res.stdout.match(/take up\s+([\d.]+\s*[KMGTP]?)/i)
  if (m) {
    const value = m[1].trim()
    const num = Number(value.replace(/[^\d.]/g, ""))
    const unit = value.replace(/[\d.\s]/g, "").toUpperCase()
    const factor: Record<string, number> = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }
    const bytes = Math.round(num * (factor[unit] ?? 1))
    items.push({
      id: "journald",
      category: "journald",
      label: "Systemd journal",
      detail: res.stdout.trim(),
      bytes,
      meta: { suggestion: "vacuum to keep last 7 days" },
    })
    return {
      category: "journald",
      items,
      totalBytes: bytes,
      reclaimableBytes: Math.max(0, bytes - 256 * 1024 * 1024),
      scannedAt: new Date().toISOString(),
    }
  }
  return { category: "journald", items, totalBytes: 0, reclaimableBytes: 0, scannedAt: new Date().toISOString() }
}

export async function pruneJournald(dryRun: boolean): Promise<PruneResult> {
  const scan = await scanJournald()
  if (dryRun) {
    return { category: "journald", dryRun: true, preview: scan.items, totalBytes: scan.totalBytes, bytesFreed: 0 }
  }
  // Vacuum to last 7 days. Requires the reach process to have permission.
  const res = await runCommand("journalctl", ["--vacuum-time=7d"], { timeoutMs: 30_000 })
  const after = await scanJournald()
  const freed = Math.max(0, scan.totalBytes - after.totalBytes)
  return {
    category: "journald",
    dryRun: false,
    preview: scan.items,
    executed: [{ id: "journald", ok: res.code === 0, error: res.code === 0 ? undefined : res.stderr.trim().slice(0, 300), bytesFreed: freed }],
    totalBytes: scan.totalBytes,
    bytesFreed: freed,
  }
}
