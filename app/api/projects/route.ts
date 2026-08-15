import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import {
  createPlannedProject,
  isValidSlug,
  listPortfolio,
  projectExistsInRegistry,
} from "@/lib/projects/store"
import { isLifecycleStage } from "@/lib/projects/types"

export const dynamic = "force-dynamic"
export const maxDuration = 45

export async function GET(req: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  const force = new URL(req.url).searchParams.get("force") === "1"
  const projects = await listPortfolio(force)
  return NextResponse.json({ projects, count: projects.length })
}

// Create a planned project (an idea with no directory yet).
export async function POST(req: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const slug = String(body.slug ?? "").trim()
  if (!isValidSlug(slug)) {
    return NextResponse.json(
      { error: "Invalid slug. Use letters, numbers, dots, dashes or underscores." },
      { status: 400 },
    )
  }
  if (await projectExistsInRegistry(slug)) {
    return NextResponse.json({ error: "A project with that slug already exists." }, { status: 409 })
  }

  const stage = body.stage
  const record = await createPlannedProject({
    slug,
    displayName: typeof body.displayName === "string" ? body.displayName : null,
    description: typeof body.description === "string" ? body.description : null,
    owner: typeof body.owner === "string" ? body.owner : null,
    stage: isLifecycleStage(stage) ? stage : "idea",
    tags: Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string") : undefined,
  })
  return NextResponse.json({ project: record }, { status: 201 })
}
