import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import { getContainerStats } from "@/lib/console/resources"

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  const stats = await getContainerStats()
  return NextResponse.json(stats)
}
