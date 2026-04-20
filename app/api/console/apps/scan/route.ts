import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import { getAppsWithStatus } from "@/lib/console/apps"

export const dynamic = "force-dynamic"

export async function POST() {
  const denied = await requireAdmin()
  if (denied) return denied
  const apps = await getAppsWithStatus(true)
  return NextResponse.json({ count: apps.length, apps })
}
