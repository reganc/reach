import path from "node:path"
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import { APPS_BASE_PATH } from "@/lib/console/types"
import { invalidateInsightsCache } from "@/lib/insights/assemble"
import { summarizeApp } from "@/lib/insights/summaries"
import { scanProjects } from "@/lib/projects/scan"

export const dynamic = "force-dynamic"
export const maxDuration = 180

// Generates the LLM purpose summary for one app. The client iterates over
// stale slugs so progress is visible and one slow repo can't stall the batch.
export async function POST(req: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: { slug?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const slug = typeof body.slug === "string" ? body.slug.trim() : ""
  // Only slugs the scanner discovered are summarizable — this also prevents
  // path traversal since the dir is rebuilt from the validated slug.
  const projects = await scanProjects()
  if (!projects.some((p) => p.slug === slug)) {
    return NextResponse.json({ error: "Unknown project" }, { status: 404 })
  }

  const result = await summarizeApp(slug, path.join(APPS_BASE_PATH, slug))
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  invalidateInsightsCache()
  return NextResponse.json({ slug, summary: result.summary })
}
