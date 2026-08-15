import { Readable } from "node:stream"
import { requireAdmin } from "@/lib/console/auth-guard"
import { openDownload, toErrorResponse } from "@/lib/files/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 3600

export async function GET(req: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  const url = new URL(req.url)
  const rootId = url.searchParams.get("root") ?? ""
  const relPath = url.searchParams.get("path") ?? ""

  try {
    const { stream, size, name } = await openDownload(rootId, relPath)
    const webStream = Readable.toWeb(stream) as unknown as ReadableStream
    return new Response(webStream, {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(size),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        "cache-control": "no-store",
      },
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}
