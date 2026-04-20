import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import { getSystemStats } from "@/lib/console/resources"

export const dynamic = "force-dynamic"

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  const stats = await getSystemStats()
  return NextResponse.json(stats)
}
