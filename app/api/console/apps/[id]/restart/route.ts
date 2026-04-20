import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import { getAppById, restartApp } from "@/lib/console/apps"

export const dynamic = "force-dynamic"
export const maxDuration = 240

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await ctx.params
  const app = await getAppById(id)
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const result = await restartApp(app)
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
