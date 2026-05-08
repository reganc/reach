import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import { readRecentAudit } from "@/lib/console/cleanup/audit"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  const url = new URL(req.url)
  const limit = Number(url.searchParams.get("limit") ?? "50")
  const entries = await readRecentAudit(Number.isFinite(limit) ? limit : 50)
  return NextResponse.json({ entries })
}
