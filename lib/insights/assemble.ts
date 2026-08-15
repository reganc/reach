import "server-only"
import { prisma } from "@/lib/db"
import { scanProjects } from "@/lib/projects/scan"
import { buildWeekAxis, readWeeklyCommits } from "./activity"
import { readRuntimeBySlug } from "./runtime"
import { getCachedSummaries, readSummarySource } from "./summaries"
import type { AppInsight, InsightsPayload } from "./types"

// Same bounded-pool shape as lib/projects/scan.ts — never 60 git processes at once.
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  )
  return results
}

let cache: { at: number; payload: InsightsPayload } | null = null
let inFlight: Promise<InsightsPayload> | null = null
const TTL_MS = 60_000

export function invalidateInsightsCache(): void {
  cache = null
}

// Concurrent callers share one scan instead of each spawning their own
// git/docker subprocess pools.
export async function assembleInsights(force = false): Promise<InsightsPayload> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.payload
  if (inFlight) return inFlight
  inFlight = doAssemble(force).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function doAssemble(force: boolean): Promise<InsightsPayload> {
  const now = Date.now()

  const weeks = buildWeekAxis()
  const [projects, runtime, summaries, records] = await Promise.all([
    scanProjects(force),
    readRuntimeBySlug(),
    getCachedSummaries(),
    prisma.project.findMany({ select: { slug: true, displayName: true } }),
  ])
  const nameBySlug = new Map(
    records.filter((r) => r.displayName).map((r) => [r.slug, r.displayName as string]),
  )

  const apps = await mapPool(projects, 8, async (p): Promise<AppInsight> => {
    const [weeklyCommits, source] = await Promise.all([
      readWeeklyCommits(p.path, weeks),
      readSummarySource(p.path),
    ])
    const cached = summaries.get(p.slug)
    return {
      slug: p.slug,
      displayName: nameBySlug.get(p.slug) ?? p.slug,
      language: p.stack.language,
      detectedDescription: p.detectedDescription,
      summary: cached?.summary ?? null,
      summaryStale: !cached || (source !== null && source.hash !== cached.sourceHash),
      lastCommitAt: p.git.lastCommitAt,
      lastTouchedAt: p.lastTouchedAt,
      runtime:
        runtime.get(p.slug) ?? {
          lastStartedAt: null,
          runningContainers: 0,
          totalContainers: 0,
        },
      weeklyCommits,
      totalCommits: weeklyCommits.reduce((a, b) => a + b, 0),
    }
  })

  const payload: InsightsPayload = {
    weeks,
    apps,
    generatedAt: new Date().toISOString(),
  }
  cache = { at: now, payload }
  return payload
}
