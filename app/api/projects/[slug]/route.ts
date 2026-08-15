import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import { getRecentCommits } from "@/lib/projects/scan"
import { deleteProject, getPortfolioProject, updateProject } from "@/lib/projects/store"
import { isLifecycleStage } from "@/lib/projects/types"

export const dynamic = "force-dynamic"
export const maxDuration = 45

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { slug } = await ctx.params
  const project = await getPortfolioProject(slug)
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const withCommits = new URL(req.url).searchParams.get("commits") === "1"
  const commits = withCommits && project.path ? await getRecentCommits(project.path, 15) : []
  return NextResponse.json({ project, commits })
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { slug } = await ctx.params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (body.stage !== undefined && !isLifecycleStage(body.stage)) {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 })
  }

  const record = await updateProject(slug, {
    displayName: typeof body.displayName === "string" ? body.displayName : body.displayName === null ? null : undefined,
    stage: isLifecycleStage(body.stage) ? body.stage : undefined,
    owner: typeof body.owner === "string" ? body.owner : body.owner === null ? null : undefined,
    description: typeof body.description === "string" ? body.description : body.description === null ? null : undefined,
    notes: typeof body.notes === "string" ? body.notes : body.notes === null ? null : undefined,
    tags: Array.isArray(body.tags)
      ? body.tags.filter((t): t is string => typeof t === "string")
      : undefined,
    pinned: typeof body.pinned === "boolean" ? body.pinned : undefined,
    checksEnabled: typeof body.checksEnabled === "boolean" ? body.checksEnabled : undefined,
    markReviewed: body.markReviewed === true,
  })
  return NextResponse.json({ record })
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { slug } = await ctx.params
  // Deleting only removes the curated registry row — it never touches the
  // directory on disk. For a discovered app this just resets curated metadata;
  // for a planned app it removes the idea entirely.
  await deleteProject(slug)
  return NextResponse.json({ success: true })
}
