import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { requireAdmin } from "@/lib/console/auth-guard"
import { CATEGORIES, isCleanupCategory } from "@/lib/console/cleanup/registry"
import { appendAudit } from "@/lib/console/cleanup/audit"
import type { PruneRequest } from "@/lib/console/cleanup/types"

export const dynamic = "force-dynamic"
export const maxDuration = 300

interface RouteContext {
  params: Promise<{ category: string }>
}

export async function GET(_req: Request, ctx: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { category } = await ctx.params
  if (!isCleanupCategory(category)) {
    return NextResponse.json({ error: "Unknown category" }, { status: 404 })
  }
  const scan = await CATEGORIES[category].scan()
  return NextResponse.json(scan)
}

export async function POST(req: Request, ctx: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied
  const session = await auth()
  const user = (session?.user as { email?: string } | undefined)?.email ?? "unknown"
  const { category } = await ctx.params
  if (!isCleanupCategory(category)) {
    return NextResponse.json({ error: "Unknown category" }, { status: 404 })
  }
  const def = CATEGORIES[category]
  if (!def.prune) {
    return NextResponse.json({ error: "Read-only category" }, { status: 405 })
  }
  let body: PruneRequest = {}
  try {
    body = (await req.json()) as PruneRequest
  } catch {
    // empty body == dry run
  }
  const dryRun = body.confirm !== true
  const result = await def.prune(dryRun, body.ids)
  if (!dryRun) {
    await appendAudit({
      ts: new Date().toISOString(),
      user,
      category,
      itemCount: result.executed?.length ?? 0,
      bytesFreed: result.bytesFreed,
      ids: (result.executed ?? []).filter((e) => e.ok).map((e) => e.id),
      errors: (result.executed ?? []).filter((e) => !e.ok).map((e) => `${e.id}: ${e.error ?? "?"}`),
    })
  }
  return NextResponse.json(result)
}
