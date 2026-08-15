import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import { listDir, toErrorResponse } from "@/lib/files/store"
import type { ListResponse } from "@/lib/files/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  const url = new URL(req.url)
  const rootId = url.searchParams.get("root") ?? ""
  const relPath = url.searchParams.get("path") ?? ""
  try {
    const entries = await listDir(rootId, relPath)
    const body: ListResponse = { rootId, path: relPath, entries }
    return NextResponse.json(body)
  } catch (e) {
    return toErrorResponse(e)
  }
}
