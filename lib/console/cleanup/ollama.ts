import "server-only"
import { runCommand } from "../exec"
import type { CategoryScan, CleanupItem, PruneResult } from "./types"

const OLLAMA_HOST = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"

interface OllamaTag {
  name: string
  size: number
  modified_at: string
  details?: { parameter_size?: string; family?: string; quantization_level?: string }
}

const PROTECTED_OLLAMA_MODELS = new Set([
  // The llm-app uses these as its EMBED_MODEL — deleting breaks RAG.
  "nomic-embed-text:latest",
  "nomic-embed-text",
])

export async function scanOllama(): Promise<CategoryScan> {
  let tags: OllamaTag[] = []
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`, { cache: "no-store" })
    if (r.ok) {
      const j = (await r.json()) as { models?: OllamaTag[] }
      tags = j.models ?? []
    }
  } catch {
    return {
      category: "ollama-models",
      items: [],
      totalBytes: 0,
      reclaimableBytes: 0,
      scannedAt: new Date().toISOString(),
      warnings: [`Ollama not reachable at ${OLLAMA_HOST}`],
    }
  }
  const items: CleanupItem[] = []
  let totalBytes = 0
  let reclaimable = 0
  for (const t of tags) {
    const isProtected = PROTECTED_OLLAMA_MODELS.has(t.name)
    const ageMs = t.modified_at ? Date.now() - Date.parse(t.modified_at) : undefined
    totalBytes += t.size
    if (!isProtected) reclaimable += t.size
    items.push({
      id: t.name,
      category: "ollama-models",
      label: t.name,
      detail: t.details?.parameter_size
        ? `${t.details.parameter_size} · ${t.details.quantization_level ?? ""}`.trim()
        : undefined,
      bytes: t.size,
      ageMs,
      inUseBy: [],
      protected: isProtected,
      meta: {
        family: t.details?.family ?? "",
        parameter_size: t.details?.parameter_size ?? "",
        quantization: t.details?.quantization_level ?? "",
      },
    })
  }
  items.sort((a, b) => (b.ageMs ?? 0) - (a.ageMs ?? 0))
  return {
    category: "ollama-models",
    items,
    totalBytes,
    reclaimableBytes: reclaimable,
    scannedAt: new Date().toISOString(),
  }
}

export async function pruneOllama(dryRun: boolean, ids?: string[]): Promise<PruneResult> {
  const scan = await scanOllama()
  const targets = (ids && ids.length > 0
    ? scan.items.filter((it) => ids.includes(it.id))
    : []
  ).filter((it) => !it.protected)
  if (dryRun) {
    return { category: "ollama-models", dryRun: true, preview: targets, totalBytes: scan.totalBytes, bytesFreed: 0 }
  }
  const executed: PruneResult["executed"] = []
  let freed = 0
  for (const t of targets) {
    let ok = false
    let error: string | undefined
    try {
      const r = await fetch(`${OLLAMA_HOST}/api/delete`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: t.id }),
      })
      ok = r.ok
      if (!ok) error = `HTTP ${r.status}`
    } catch (e) {
      error = String(e)
    }
    if (!ok) {
      // Fall back to docker exec ollama ollama rm
      const fallback = await runCommand(
        "docker",
        ["exec", "ollama", "ollama", "rm", t.id],
        { timeoutMs: 30_000 },
      )
      ok = fallback.code === 0
      if (!ok) error = fallback.stderr.trim().slice(0, 300) || error
    }
    if (ok) freed += t.bytes
    executed.push({ id: t.id, ok, error, bytesFreed: ok ? t.bytes : 0 })
  }
  return { category: "ollama-models", dryRun: false, preview: targets, executed, totalBytes: scan.totalBytes, bytesFreed: freed }
}
