import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import { getAppsWithStatus } from "@/lib/console/apps"

export const dynamic = "force-dynamic"

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  const apps = await getAppsWithStatus()
  return NextResponse.json(apps)
}
