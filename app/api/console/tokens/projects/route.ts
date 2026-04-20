import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import { getTokenUsageProjects } from "@/lib/console/tokens"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  const data = await getTokenUsageProjects()
  return NextResponse.json(data)
}
