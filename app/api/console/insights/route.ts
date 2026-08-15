import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import { assembleInsights } from "@/lib/insights/assemble"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  const force = new URL(req.url).searchParams.get("force") === "1"
  try {
    const payload = await assembleInsights(force)
    return NextResponse.json(payload)
  } catch (err) {
    console.error("[insights] assemble failed:", err)
    return NextResponse.json({ error: "Failed to assemble insights" }, { status: 500 })
  }
}
