import "server-only"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { prisma } from "@/lib/db"

// Lane B (raw Ollama) per ~/apps/CLAUDE.md: structured output needs JSON mode
// and clean prompts, which the gateway does not provide. Model stays "default".
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"
const LLM_MODEL = process.env.LLM_MODEL ?? "default"
const GENERATE_TIMEOUT_MS = 120_000

const SOURCE_FILES = [
  { name: "README.md", maxChars: 2400 },
  { name: "CLAUDE.md", maxChars: 2000 },
  { name: "package.json", maxChars: 600 },
  { name: "pyproject.toml", maxChars: 600 },
] as const

export interface SummarySource {
  hash: string
  text: string
}

/** Concatenated doc excerpts for one app dir + a fingerprint of them. */
export async function readSummarySource(dir: string): Promise<SummarySource | null> {
  const parts: string[] = []
  for (const f of SOURCE_FILES) {
    try {
      const raw = await fs.readFile(path.join(dir, f.name), "utf8")
      parts.push(`--- ${f.name} ---\n${raw.slice(0, f.maxChars)}`)
    } catch {
      /* file absent — fine */
    }
  }
  if (parts.length === 0) return null
  const text = parts.join("\n\n")
  return { hash: createHash("sha256").update(text).digest("hex"), text }
}

export interface CachedSummary {
  summary: string
  sourceHash: string
}

export async function getCachedSummaries(): Promise<Map<string, CachedSummary>> {
  const rows = await prisma.projectInsight.findMany()
  return new Map(
    rows.map((r) => [r.slug, { summary: r.summary, sourceHash: r.sourceHash }]),
  )
}

/**
 * Generates (or refreshes) the purpose summary for one app and caches it.
 * Returns the summary, or an error message when the app has no source docs
 * or the LLM is unreachable.
 */
export async function summarizeApp(
  slug: string,
  dir: string,
): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const source = await readSummarySource(dir)
  if (!source) {
    return { ok: false, error: "No README/CLAUDE.md/manifest to summarize." }
  }

  const existing = await prisma.projectInsight.findUnique({ where: { slug } })
  if (existing && existing.sourceHash === source.hash) {
    return { ok: true, summary: existing.summary }
  }

  const prompt = [
    `You are cataloging a developer's local projects. Based ONLY on the`,
    `documentation excerpts below, describe what the app "${slug}" is and what`,
    `it is for, in 1-2 plain sentences (max 45 words). No marketing language.`,
    `Respond as JSON: {"summary": "..."}`,
    ``,
    source.text,
  ].join("\n")

  let summary: string
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS)
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt,
        stream: false,
        format: "json",
        think: false,
        options: { temperature: 0.2, num_predict: 200 },
      }),
    })
    clearTimeout(timer)
    if (!res.ok) {
      return { ok: false, error: `Ollama returned ${res.status}` }
    }
    const data = (await res.json()) as { response?: string }
    try {
      const parsed = JSON.parse(data.response ?? "{}") as { summary?: unknown }
      summary = typeof parsed.summary === "string" ? parsed.summary.trim() : ""
    } catch {
      return { ok: false, error: "LLM returned invalid JSON." }
    }
  } catch (err) {
    const msg = err instanceof Error && err.name === "AbortError"
      ? "LLM request timed out"
      : "LLM unreachable — is Ollama running on :11434?"
    return { ok: false, error: msg }
  }
  if (!summary) return { ok: false, error: "LLM returned an empty summary." }

  await prisma.projectInsight.upsert({
    where: { slug },
    create: { slug, summary, sourceHash: source.hash, model: LLM_MODEL },
    update: { summary, sourceHash: source.hash, model: LLM_MODEL },
  })
  return { ok: true, summary }
}
