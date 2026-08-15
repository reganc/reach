import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import { removeEntry, toErrorResponse } from "@/lib/files/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: { root?: string; path?: string; recursive?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  try {
    await removeEntry(body.root ?? "", body.path ?? "", body.recursive === true)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return toErrorResponse(e)
  }
}
