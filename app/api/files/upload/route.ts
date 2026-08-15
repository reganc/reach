import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import { writeUpload, toErrorResponse } from "@/lib/files/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// Long-running on purpose: large files stream straight to disk.
export const maxDuration = 3600

export async function POST(req: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  const url = new URL(req.url)
  const rootId = url.searchParams.get("root") ?? ""
  const relDir = url.searchParams.get("path") ?? ""
  const name = url.searchParams.get("name") ?? ""
  const overwrite = url.searchParams.get("overwrite") === "1"

  if (!req.body) {
    return NextResponse.json({ error: "Empty request body" }, { status: 400 })
  }

  try {
    const result = await writeUpload({ rootId, relDir, name, overwrite, body: req.body })
    return NextResponse.json(result)
  } catch (e) {
    return toErrorResponse(e)
  }
}
