import "server-only"
import fs from "node:fs/promises"
import path from "node:path"
import { runCommand } from "../exec"
import { APPS_BASE_PATH } from "../types"
import { isProtectedPath } from "./safety"
import type { CategoryScan, CleanupItem, PruneResult } from "./types"

const HOME = process.env.HOME ?? "/home/regan"

// ── Stray model files ────────────────────────────────────────────────────────
// Looks for large model artifacts (>1 GB) that are NOT inside known model
// directories (Ollama volume, HuggingFace cache, ~/models, ~/.lmstudio).

const MODEL_EXTENSIONS = [".gguf", ".safetensors", ".bin", ".pt", ".ggml"]
const KNOWN_MODEL_DIRS = [
  `${HOME}/.cache/huggingface`,
  `${HOME}/.lmstudio`,
  `${HOME}/.cache/lm-studio`,
  `${HOME}/models`,
  `${HOME}/.ollama`,
  "/var/lib/docker/volumes",
  `${HOME}/.config/google-chrome`, // Chrome's on-device Gemini Nano
]

const SCAN_ROOTS_FOR_MODELS = [
  APPS_BASE_PATH,
  `${HOME}/Downloads`,
]

const STRAY_MODEL_MIN_BYTES = 1024 * 1024 * 1024 // 1 GB

export async function scanStrayModels(): Promise<CategoryScan> {
  const items: CleanupItem[] = []
  let totalBytes = 0
  for (const root of SCAN_ROOTS_FOR_MODELS) {
    try {
      await fs.access(root)
    } catch {
      continue
    }
    const args = [
      root,
      "-type", "f",
      "-size", "+1024M",
      "(",
      ...MODEL_EXTENSIONS.flatMap((ext, i) => (i === 0 ? ["-iname", `*${ext}`] : ["-o", "-iname", `*${ext}`])),
      ")",
      "-printf", "%s\\t%T@\\t%p\\n",
    ]
    const res = await runCommand("find", args, { timeoutMs: 60_000 })
    if (res.code !== 0) continue
    for (const line of res.stdout.split("\n")) {
      if (!line.trim()) continue
      const [sizeStr, mtimeStr, ...pathParts] = line.split("\t")
      const filePath = pathParts.join("\t")
      const bytes = Number(sizeStr)
      if (!Number.isFinite(bytes) || bytes < STRAY_MODEL_MIN_BYTES) continue
      if (isInKnownModelDir(filePath)) continue
      if (isProtectedPath(filePath)) continue
      const mtimeSec = Number(mtimeStr)
      const ageMs = Number.isFinite(mtimeSec) ? Date.now() - mtimeSec * 1000 : undefined
      totalBytes += bytes
      items.push({
        id: filePath,
        category: "stray-models",
        label: path.basename(filePath),
        detail: filePath,
        path: filePath,
        bytes,
        ageMs,
        meta: { extension: path.extname(filePath) },
      })
    }
  }
  items.sort((a, b) => b.bytes - a.bytes)
  return {
    category: "stray-models",
    items,
    totalBytes,
    reclaimableBytes: totalBytes,
    scannedAt: new Date().toISOString(),
  }
}

function isInKnownModelDir(p: string): boolean {
  return KNOWN_MODEL_DIRS.some((d) => p.startsWith(d + path.sep))
}

export async function pruneStrayModels(dryRun: boolean, ids?: string[]): Promise<PruneResult> {
  const scan = await scanStrayModels()
  const targets = ids && ids.length > 0
    ? scan.items.filter((it) => ids.includes(it.id))
    : scan.items
  if (dryRun) {
    return { category: "stray-models", dryRun: true, preview: targets, totalBytes: scan.totalBytes, bytesFreed: 0 }
  }
  const executed: PruneResult["executed"] = []
  let freed = 0
  for (const t of targets) {
    if (!t.path || isProtectedPath(t.path)) {
      executed.push({ id: t.id, ok: false, error: "protected path", bytesFreed: 0 })
      continue
    }
    try {
      await fs.unlink(t.path)
      freed += t.bytes
      executed.push({ id: t.id, ok: true, bytesFreed: t.bytes })
    } catch (e) {
      executed.push({ id: t.id, ok: false, error: String(e).slice(0, 300), bytesFreed: 0 })
    }
  }
  return { category: "stray-models", dryRun: false, preview: targets, executed, totalBytes: scan.totalBytes, bytesFreed: freed }
}

// ── Build artifacts (node_modules, .next, dist, target, __pycache__, .venv) ──

const BUILD_ARTIFACT_DIRS = [
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "target",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
]

const BUILD_ARTIFACT_MIN_BYTES = 50 * 1024 * 1024 // 50 MB
const BUILD_ARTIFACT_MIN_AGE_DAYS = 14

export async function scanBuildArtifacts(): Promise<CategoryScan> {
  const items: CleanupItem[] = []
  let totalBytes = 0
  let reclaimable = 0
  // Use a single `find` call with -prune to skip nested matches (e.g., a
  // node_modules inside another node_modules), then `du -sb` per match.
  const namePredicates = BUILD_ARTIFACT_DIRS.flatMap((d, i) =>
    i === 0 ? ["-name", d] : ["-o", "-name", d],
  )
  const args = [
    APPS_BASE_PATH,
    "-type", "d",
    "(",
    ...namePredicates,
    ")",
    "-prune",
    "-print",
  ]
  const findRes = await runCommand("find", args, { timeoutMs: 60_000 })
  if (findRes.code !== 0) {
    return { category: "build-artifacts", items, totalBytes, reclaimableBytes: 0, scannedAt: new Date().toISOString(), warnings: [findRes.stderr.trim().slice(0, 200)] }
  }
  const dirs = findRes.stdout.split("\n").map((s) => s.trim()).filter(Boolean)
  // Get sizes + mtime in one du + stat pass.
  for (const d of dirs) {
    if (isProtectedPath(d)) continue
    const sizeRes = await runCommand("du", ["-sb", d], { timeoutMs: 20_000 })
    if (sizeRes.code !== 0) continue
    const bytes = Number((sizeRes.stdout.trim().split(/\s+/)[0] ?? "0").replace(/\D/g, ""))
    if (!Number.isFinite(bytes) || bytes < BUILD_ARTIFACT_MIN_BYTES) continue
    let ageMs: number | undefined
    try {
      const st = await fs.stat(d)
      ageMs = Date.now() - st.mtimeMs
    } catch {
      // ignore
    }
    const ageDays = ageMs ? ageMs / (1000 * 60 * 60 * 24) : 0
    const stale = ageDays >= BUILD_ARTIFACT_MIN_AGE_DAYS
    totalBytes += bytes
    if (stale) reclaimable += bytes
    items.push({
      id: d,
      category: "build-artifacts",
      label: `${path.basename(d)} · ${path.basename(path.dirname(d))}`,
      detail: d,
      path: d,
      bytes,
      ageMs,
      // Untag stale items as in-use so the default prune is safe.
      inUseBy: stale ? [] : ["recent (<14d)"],
      meta: { kind: path.basename(d) },
    })
  }
  items.sort((a, b) => b.bytes - a.bytes)
  return { category: "build-artifacts", items, totalBytes, reclaimableBytes: reclaimable, scannedAt: new Date().toISOString() }
}

export async function pruneBuildArtifacts(dryRun: boolean, ids?: string[]): Promise<PruneResult> {
  const scan = await scanBuildArtifacts()
  const targets = ids && ids.length > 0
    ? scan.items.filter((it) => ids.includes(it.id))
    : scan.items.filter((it) => (it.inUseBy ?? []).length === 0)
  if (dryRun) {
    return { category: "build-artifacts", dryRun: true, preview: targets, totalBytes: scan.totalBytes, bytesFreed: 0 }
  }
  const executed: PruneResult["executed"] = []
  let freed = 0
  for (const t of targets) {
    if (!t.path || isProtectedPath(t.path)) {
      executed.push({ id: t.id, ok: false, error: "protected path", bytesFreed: 0 })
      continue
    }
    try {
      await fs.rm(t.path, { recursive: true, force: true })
      freed += t.bytes
      executed.push({ id: t.id, ok: true, bytesFreed: t.bytes })
    } catch (e) {
      executed.push({ id: t.id, ok: false, error: String(e).slice(0, 300), bytesFreed: 0 })
    }
  }
  return { category: "build-artifacts", dryRun: false, preview: targets, executed, totalBytes: scan.totalBytes, bytesFreed: freed }
}

// ── /tmp files older than N days ─────────────────────────────────────────────

const TMP_AGE_DAYS = 7
const TMP_MIN_BYTES = 1024 * 1024 // 1 MB to avoid noise

export async function scanTmp(): Promise<CategoryScan> {
  const items: CleanupItem[] = []
  let totalBytes = 0
  const args = [
    "/tmp",
    "-mindepth", "1",
    "-maxdepth", "2",
    "-type", "f",
    "-size", "+1024k",
    "-mtime", `+${TMP_AGE_DAYS}`,
    "-printf", "%s\\t%T@\\t%p\\n",
  ]
  const res = await runCommand("find", args, { timeoutMs: 30_000 })
  if (res.code !== 0) {
    return { category: "tmp-files", items, totalBytes, reclaimableBytes: 0, scannedAt: new Date().toISOString(), warnings: [res.stderr.trim().slice(0, 200)] }
  }
  for (const line of res.stdout.split("\n")) {
    if (!line.trim()) continue
    const [sizeStr, mtimeStr, ...pathParts] = line.split("\t")
    const filePath = pathParts.join("\t")
    const bytes = Number(sizeStr)
    if (!Number.isFinite(bytes) || bytes < TMP_MIN_BYTES) continue
    const mtimeSec = Number(mtimeStr)
    const ageMs = Number.isFinite(mtimeSec) ? Date.now() - mtimeSec * 1000 : undefined
    totalBytes += bytes
    items.push({
      id: filePath,
      category: "tmp-files",
      label: path.basename(filePath),
      detail: filePath,
      path: filePath,
      bytes,
      ageMs,
    })
  }
  items.sort((a, b) => b.bytes - a.bytes)
  return { category: "tmp-files", items, totalBytes, reclaimableBytes: totalBytes, scannedAt: new Date().toISOString() }
}

export async function pruneTmp(dryRun: boolean, ids?: string[]): Promise<PruneResult> {
  const scan = await scanTmp()
  const targets = ids && ids.length > 0
    ? scan.items.filter((it) => ids.includes(it.id))
    : scan.items
  if (dryRun) {
    return { category: "tmp-files", dryRun: true, preview: targets, totalBytes: scan.totalBytes, bytesFreed: 0 }
  }
  const executed: PruneResult["executed"] = []
  let freed = 0
  for (const t of targets) {
    if (!t.path || !t.path.startsWith("/tmp/") || isProtectedPath(t.path)) {
      executed.push({ id: t.id, ok: false, error: "outside /tmp or protected", bytesFreed: 0 })
      continue
    }
    try {
      await fs.unlink(t.path)
      freed += t.bytes
      executed.push({ id: t.id, ok: true, bytesFreed: t.bytes })
    } catch (e) {
      executed.push({ id: t.id, ok: false, error: String(e).slice(0, 300), bytesFreed: 0 })
    }
  }
  return { category: "tmp-files", dryRun: false, preview: targets, executed, totalBytes: scan.totalBytes, bytesFreed: freed }
}
