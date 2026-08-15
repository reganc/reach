import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import { listRoots, toErrorResponse } from "@/lib/files/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    return NextResponse.json({ roots: await listRoots() })
  } catch (e) {
    return toErrorResponse(e)
  }
}
