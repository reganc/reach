import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import { getAppById } from "@/lib/console/apps"
import { getDatabasesWithSizes } from "@/lib/console/databases"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await ctx.params
  const app = await getAppById(id)
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const databases = await getDatabasesWithSizes(app)
  return NextResponse.json({ databases })
}
