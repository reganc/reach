import "server-only"
import { runCommand } from "../exec"
import {
  getComposeReferencedVolumeNames,
  isProtectedVolumeName,
} from "./safety"
import type { CategoryScan, CleanupItem, PruneResult } from "./types"

function nowIso(): string {
  return new Date().toISOString()
}

function parseJsonLines<T>(stdout: string): T[] {
  const out: T[] = []
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      out.push(JSON.parse(trimmed) as T)
    } catch {
      // skip malformed
    }
  }
  return out
}

function ageMsFromCreatedAt(createdAt: string | undefined): number | undefined {
  if (!createdAt) return undefined
  const t = Date.parse(createdAt)
  if (!Number.isFinite(t)) return undefined
  return Date.now() - t
}

// ── Build cache ──────────────────────────────────────────────────────────────

export async function scanBuildCache(): Promise<CategoryScan> {
  const res = await runCommand(
    "docker",
    ["system", "df", "--format", "{{json .}}", "--verbose"],
    { timeoutMs: 15000 },
  )
  const items: CleanupItem[] = []
  let totalBytes = 0
  let reclaimable = 0
  if (res.code === 0) {
    // `--verbose` returns multiple JSON blobs; the BuildCache rows are typed.
    // Older Docker versions emit a single object — handle both.
    const blocks = parseJsonLines<Record<string, unknown>>(res.stdout)
    for (const block of blocks) {
      const cache = (block as { BuildCache?: Array<Record<string, unknown>> }).BuildCache
      if (Array.isArray(cache)) {
        for (const c of cache) {
          const id = String(c.ID ?? c.Id ?? "")
          const size = Number(c.Size ?? 0)
          const reclaim = Number(c.Reclaimable ?? size)
          totalBytes += size
          reclaimable += reclaim
          items.push({
            id,
            category: "docker-build-cache",
            label: String(c.Description ?? c.CacheType ?? id.slice(0, 12)),
            bytes: size,
            ageMs: ageMsFromCreatedAt(c.CreatedAt as string),
            meta: {
              shared: Boolean(c.Shared),
              inUse: Boolean(c.InUse),
              type: String(c.CacheType ?? ""),
            },
          })
        }
      }
    }
  }
  // Fallback: if parsing returned nothing, ask `docker system df` for an aggregate.
  if (items.length === 0) {
    const agg = await runCommand("docker", ["system", "df", "--format", "{{json .}}"], { timeoutMs: 8000 })
    if (agg.code === 0) {
      const blocks = parseJsonLines<Record<string, unknown>>(agg.stdout)
      for (const b of blocks) {
        const type = String(b.Type ?? "")
        if (type === "Build Cache") {
          const sizeStr = String(b.Size ?? "")
          const reclaimStr = String(b.Reclaimable ?? "")
          const sizeBytes = parseHumanSize(sizeStr)
          const reclaimBytes = parseReclaimable(reclaimStr)
          totalBytes = sizeBytes
          reclaimable = reclaimBytes
          if (sizeBytes > 0) {
            items.push({
              id: "build-cache-aggregate",
              category: "docker-build-cache",
              label: "Build cache (aggregate)",
              detail: `${b.TotalCount ?? "?"} entries`,
              bytes: sizeBytes,
              meta: { reclaimable: reclaimBytes },
            })
          }
        }
      }
    }
  }
  return {
    category: "docker-build-cache",
    items,
    totalBytes,
    reclaimableBytes: reclaimable,
    scannedAt: nowIso(),
  }
}

export async function pruneBuildCache(dryRun: boolean): Promise<PruneResult> {
  const scan = await scanBuildCache()
  if (dryRun) {
    return {
      category: "docker-build-cache",
      dryRun: true,
      preview: scan.items,
      totalBytes: scan.totalBytes,
      bytesFreed: 0,
    }
  }
  const res = await runCommand("docker", ["builder", "prune", "-a", "-f"], { timeoutMs: 120_000 })
  const freed = parseReclaimedFromPrune(res.stdout)
  return {
    category: "docker-build-cache",
    dryRun: false,
    preview: scan.items,
    executed: [{ id: "all", ok: res.code === 0, error: res.code === 0 ? undefined : res.stderr.trim().slice(0, 500), bytesFreed: freed }],
    totalBytes: scan.totalBytes,
    bytesFreed: freed,
  }
}

// ── Images ───────────────────────────────────────────────────────────────────

interface DockerImageRow {
  ID: string
  Repository: string
  Tag: string
  Size: string
  CreatedAt: string
  Containers: string
}

export async function scanImages(): Promise<CategoryScan> {
  const res = await runCommand(
    "docker",
    ["image", "ls", "--all", "--format", "{{json .}}"],
    { timeoutMs: 15000 },
  )
  const items: CleanupItem[] = []
  let totalBytes = 0
  let reclaimable = 0
  if (res.code !== 0) {
    return { category: "docker-images", items, totalBytes, reclaimableBytes: 0, scannedAt: nowIso(), warnings: [res.stderr.trim().slice(0, 200)] }
  }
  // Build a set of image IDs in use by any container (running or stopped).
  const usage = await imageIdsInUseByContainers()
  const rows = parseJsonLines<DockerImageRow>(res.stdout)
  for (const r of rows) {
    const bytes = parseHumanSize(r.Size)
    totalBytes += bytes
    const dangling = r.Repository === "<none>" && r.Tag === "<none>"
    const inUse = usage.has(r.ID)
    const inUseBy = inUse ? ["container"] : []
    if (!inUse) reclaimable += bytes
    items.push({
      id: r.ID,
      category: "docker-images",
      label: dangling ? `<none>:<none> (${r.ID.slice(0, 12)})` : `${r.Repository}:${r.Tag}`,
      detail: r.ID.slice(0, 12),
      bytes,
      ageMs: ageMsFromCreatedAt(r.CreatedAt),
      inUseBy,
      meta: { dangling, repository: r.Repository, tag: r.Tag },
    })
  }
  items.sort((a, b) => b.bytes - a.bytes)
  return { category: "docker-images", items, totalBytes, reclaimableBytes: reclaimable, scannedAt: nowIso() }
}

async function imageIdsInUseByContainers(): Promise<Set<string>> {
  const out = new Set<string>()
  const res = await runCommand("docker", ["ps", "-a", "--format", "{{.Image}}|{{.ImageID}}"], { timeoutMs: 10_000 })
  if (res.code !== 0) return out
  for (const line of res.stdout.split("\n")) {
    const [, id] = line.trim().split("|")
    if (id) out.add(id)
  }
  // Also resolve image names via inspect for containers without ImageID column
  const namesRes = await runCommand("docker", ["ps", "-a", "--format", "{{.Image}}"], { timeoutMs: 10_000 })
  if (namesRes.code === 0) {
    const names = Array.from(new Set(namesRes.stdout.split("\n").map((s) => s.trim()).filter(Boolean)))
    if (names.length > 0) {
      const inspect = await runCommand("docker", ["image", "inspect", "--format", "{{.Id}}", ...names], { timeoutMs: 15_000 })
      if (inspect.code === 0) {
        for (const id of inspect.stdout.split("\n").map((s) => s.trim()).filter(Boolean)) {
          out.add(id)
          // Some Docker versions return sha256:abc...; normalise to short form for matching
          if (id.startsWith("sha256:")) out.add(id.slice(7))
        }
      }
    }
  }
  return out
}

export async function pruneImages(dryRun: boolean, ids?: string[]): Promise<PruneResult> {
  const scan = await scanImages()
  const targets = ids && ids.length > 0
    ? scan.items.filter((it) => ids.includes(it.id))
    : scan.items.filter((it) => (it.inUseBy ?? []).length === 0)
  if (dryRun) {
    return {
      category: "docker-images",
      dryRun: true,
      preview: targets,
      totalBytes: scan.totalBytes,
      bytesFreed: 0,
    }
  }
  const executed: PruneResult["executed"] = []
  let freed = 0
  for (const t of targets) {
    const res = await runCommand("docker", ["image", "rm", "-f", t.id], { timeoutMs: 30_000 })
    const ok = res.code === 0
    if (ok) freed += t.bytes
    executed.push({ id: t.id, ok, error: ok ? undefined : res.stderr.trim().slice(0, 300), bytesFreed: ok ? t.bytes : 0 })
  }
  return { category: "docker-images", dryRun: false, preview: targets, executed, totalBytes: scan.totalBytes, bytesFreed: freed }
}

// ── Containers ───────────────────────────────────────────────────────────────

interface DockerContainerRow {
  ID: string
  Names: string
  Image: string
  Status: string
  State: string
  CreatedAt: string
  Size: string
}

export async function scanContainers(): Promise<CategoryScan> {
  const res = await runCommand(
    "docker",
    ["ps", "-a", "--size", "--format", "{{json .}}"],
    { timeoutMs: 15_000 },
  )
  const items: CleanupItem[] = []
  let totalBytes = 0
  let reclaimable = 0
  if (res.code !== 0) {
    return { category: "docker-containers", items, totalBytes, reclaimableBytes: 0, scannedAt: nowIso(), warnings: [res.stderr.trim().slice(0, 200)] }
  }
  const rows = parseJsonLines<DockerContainerRow>(res.stdout)
  for (const r of rows) {
    const bytes = parseContainerSize(r.Size)
    const stopped = r.State === "exited" || r.State === "created" || r.State === "dead"
    totalBytes += bytes
    if (stopped) reclaimable += bytes
    items.push({
      id: r.ID,
      category: "docker-containers",
      label: r.Names || r.ID.slice(0, 12),
      detail: `${r.Image} · ${r.Status}`,
      bytes,
      ageMs: ageMsFromCreatedAt(r.CreatedAt),
      inUseBy: stopped ? [] : ["running"],
      meta: { state: r.State, image: r.Image },
    })
  }
  return { category: "docker-containers", items, totalBytes, reclaimableBytes: reclaimable, scannedAt: nowIso() }
}

export async function pruneContainers(dryRun: boolean, ids?: string[]): Promise<PruneResult> {
  const scan = await scanContainers()
  const targets = ids && ids.length > 0
    ? scan.items.filter((it) => ids.includes(it.id))
    : scan.items.filter((it) => (it.inUseBy ?? []).length === 0)
  if (dryRun) {
    return { category: "docker-containers", dryRun: true, preview: targets, totalBytes: scan.totalBytes, bytesFreed: 0 }
  }
  const executed: PruneResult["executed"] = []
  let freed = 0
  for (const t of targets) {
    const res = await runCommand("docker", ["rm", "-f", t.id], { timeoutMs: 20_000 })
    const ok = res.code === 0
    if (ok) freed += t.bytes
    executed.push({ id: t.id, ok, error: ok ? undefined : res.stderr.trim().slice(0, 300), bytesFreed: ok ? t.bytes : 0 })
  }
  return { category: "docker-containers", dryRun: false, preview: targets, executed, totalBytes: scan.totalBytes, bytesFreed: freed }
}

// ── Volumes ──────────────────────────────────────────────────────────────────

export async function scanVolumes(): Promise<CategoryScan> {
  const composeNames = await getComposeReferencedVolumeNames()
  const list = await runCommand("docker", ["volume", "ls", "--format", "{{.Name}}"], { timeoutMs: 10_000 })
  const items: CleanupItem[] = []
  let totalBytes = 0
  let reclaimable = 0
  if (list.code !== 0) {
    return { category: "docker-volumes", items, totalBytes, reclaimableBytes: 0, scannedAt: nowIso(), warnings: [list.stderr.trim().slice(0, 200)] }
  }
  const names = list.stdout.split("\n").map((s) => s.trim()).filter(Boolean)
  // Bulk-inspect for size + container usage. Fall back to per-volume if too many for argv.
  const chunkSize = 50
  for (let i = 0; i < names.length; i += chunkSize) {
    const chunk = names.slice(i, i + chunkSize)
    const insp = await runCommand(
      "docker",
      ["volume", "inspect", ...chunk],
      { timeoutMs: 15_000 },
    )
    if (insp.code !== 0) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(insp.stdout)
    } catch {
      continue
    }
    if (!Array.isArray(parsed)) continue
    for (const v of parsed as Array<Record<string, unknown>>) {
      const name = String(v.Name ?? "")
      const mountpoint = String(v.Mountpoint ?? "")
      const usersRes = await runCommand(
        "docker",
        ["ps", "-a", "--filter", `volume=${name}`, "--format", "{{.Names}}"],
        { timeoutMs: 5000 },
      )
      const users = usersRes.code === 0
        ? usersRes.stdout.split("\n").map((s) => s.trim()).filter(Boolean)
        : []
      const composeRef = composeNames.has(name)
      const protectedHit = isProtectedVolumeName(name)
      const inUseBy: string[] = []
      if (users.length > 0) inUseBy.push(...users.map((u) => `container:${u}`))
      if (composeRef) inUseBy.push("compose-reference")
      const bytes = await sizeOfDirSafe(mountpoint)
      totalBytes += bytes
      if (inUseBy.length === 0 && !protectedHit) reclaimable += bytes
      items.push({
        id: name,
        category: "docker-volumes",
        label: name.length > 40 ? `${name.slice(0, 12)}… (anonymous)` : name,
        detail: mountpoint,
        bytes,
        inUseBy,
        protected: protectedHit,
        meta: {
          driver: String(v.Driver ?? ""),
          anonymous: name.length === 64 && /^[a-f0-9]+$/.test(name),
        },
      })
    }
  }
  items.sort((a, b) => b.bytes - a.bytes)
  return { category: "docker-volumes", items, totalBytes, reclaimableBytes: reclaimable, scannedAt: nowIso() }
}

async function sizeOfDirSafe(dirPath: string): Promise<number> {
  if (!dirPath) return 0
  // Use `du` with sudo if available — fall back to 0 (Docker's volume dirs are root-owned).
  const res = await runCommand("du", ["-sb", dirPath], { timeoutMs: 10_000 })
  if (res.code === 0) {
    const num = Number((res.stdout.trim().split(/\s+/)[0] ?? "0").replace(/\D/g, ""))
    return Number.isFinite(num) ? num : 0
  }
  return 0
}

export async function pruneVolumes(dryRun: boolean, ids?: string[]): Promise<PruneResult> {
  const scan = await scanVolumes()
  const targets = ids && ids.length > 0
    ? scan.items.filter((it) => ids.includes(it.id) && !it.protected)
    : scan.items.filter((it) => (it.inUseBy ?? []).length === 0 && !it.protected)
  if (dryRun) {
    return { category: "docker-volumes", dryRun: true, preview: targets, totalBytes: scan.totalBytes, bytesFreed: 0 }
  }
  const executed: PruneResult["executed"] = []
  let freed = 0
  for (const t of targets) {
    const res = await runCommand("docker", ["volume", "rm", t.id], { timeoutMs: 20_000 })
    const ok = res.code === 0
    if (ok) freed += t.bytes
    executed.push({ id: t.id, ok, error: ok ? undefined : res.stderr.trim().slice(0, 300), bytesFreed: ok ? t.bytes : 0 })
  }
  return { category: "docker-volumes", dryRun: false, preview: targets, executed, totalBytes: scan.totalBytes, bytesFreed: freed }
}

// ── Networks ─────────────────────────────────────────────────────────────────

interface DockerNetworkRow {
  ID: string
  Name: string
  Driver: string
  Scope: string
  CreatedAt: string
}

const SYSTEM_NETWORKS = new Set(["bridge", "host", "none"])

export async function scanNetworks(): Promise<CategoryScan> {
  const res = await runCommand("docker", ["network", "ls", "--format", "{{json .}}"], { timeoutMs: 10_000 })
  const items: CleanupItem[] = []
  if (res.code !== 0) {
    return { category: "docker-networks", items, totalBytes: 0, reclaimableBytes: 0, scannedAt: nowIso(), warnings: [res.stderr.trim().slice(0, 200)] }
  }
  const rows = parseJsonLines<DockerNetworkRow>(res.stdout)
  let reclaimable = 0
  for (const r of rows) {
    const isSystem = SYSTEM_NETWORKS.has(r.Name)
    const usersRes = await runCommand(
      "docker",
      ["network", "inspect", r.ID, "--format", "{{range $k,$v := .Containers}}{{$v.Name}} {{end}}"],
      { timeoutMs: 5000 },
    )
    const users = usersRes.code === 0
      ? usersRes.stdout.trim().split(/\s+/).filter(Boolean)
      : []
    const inUseBy = users.length > 0 ? users.map((u) => `container:${u}`) : []
    if (!isSystem && inUseBy.length === 0) reclaimable += 1
    items.push({
      id: r.ID,
      category: "docker-networks",
      label: r.Name,
      detail: `${r.Driver} (${r.Scope})`,
      bytes: 0,
      ageMs: ageMsFromCreatedAt(r.CreatedAt),
      inUseBy,
      protected: isSystem,
      meta: { driver: r.Driver, scope: r.Scope, containers: users.length },
    })
  }
  return { category: "docker-networks", items, totalBytes: 0, reclaimableBytes: reclaimable, scannedAt: nowIso() }
}

export async function pruneNetworks(dryRun: boolean, ids?: string[]): Promise<PruneResult> {
  const scan = await scanNetworks()
  const targets = ids && ids.length > 0
    ? scan.items.filter((it) => ids.includes(it.id) && !it.protected)
    : scan.items.filter((it) => (it.inUseBy ?? []).length === 0 && !it.protected)
  if (dryRun) {
    return { category: "docker-networks", dryRun: true, preview: targets, totalBytes: 0, bytesFreed: 0 }
  }
  const executed: PruneResult["executed"] = []
  for (const t of targets) {
    const res = await runCommand("docker", ["network", "rm", t.id], { timeoutMs: 10_000 })
    executed.push({ id: t.id, ok: res.code === 0, error: res.code === 0 ? undefined : res.stderr.trim().slice(0, 300), bytesFreed: 0 })
  }
  return { category: "docker-networks", dryRun: false, preview: targets, executed, totalBytes: 0, bytesFreed: 0 }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseHumanSize(s: string): number {
  if (!s) return 0
  const m = s.trim().match(/^([\d.]+)\s*([KMGTP]?B)?/i)
  if (!m) return 0
  const value = Number(m[1])
  const unit = (m[2] ?? "B").toUpperCase()
  const factor: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
    PB: 1024 ** 5,
  }
  return Math.round(value * (factor[unit] ?? 1))
}

function parseContainerSize(s: string): number {
  // e.g. "4.5MB (virtual 1.2GB)" — use the writable layer size (first number)
  if (!s) return 0
  const first = s.split("(")[0]
  return parseHumanSize(first)
}

function parseReclaimable(s: string): number {
  // e.g. "12.3GB (45%)"
  if (!s) return 0
  const first = s.split("(")[0]
  return parseHumanSize(first)
}

function parseReclaimedFromPrune(stdout: string): number {
  // `Total reclaimed space: 4.5GB`
  const m = stdout.match(/Total reclaimed space:\s*([\d.]+\s*[KMGTP]?B)/i)
  return m ? parseHumanSize(m[1]) : 0
}
