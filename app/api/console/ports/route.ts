import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import { getPortRows } from "@/lib/console/ports"

export const dynamic = "force-dynamic"

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  const rows = await getPortRows()
  return NextResponse.json(rows)
}
