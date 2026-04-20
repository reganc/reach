import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import { getTokenUsageSummary } from "@/lib/console/tokens"

export const dynamic = "force-dynamic"

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  const summary = await getTokenUsageSummary()
  if (!summary) {
    return NextResponse.json(
      { error: "~/.claude_usage.jsonl not found" },
      { status: 404 },
    )
  }
  return NextResponse.json(summary)
}
