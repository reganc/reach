import "server-only"
import { prisma } from "@/lib/db"
import { deriveHealth } from "./health"
import { scanProjects, invalidateScanCache } from "./scan"
import {
  DEFAULT_STAGE,
  isLifecycleStage,
  LifecycleStage,
  PortfolioProject,
  ProjectRecord,
} from "./types"

interface ProjectRow {
  slug: string
  displayName: string | null
  stage: string
  owner: string | null
  description: string | null
  notes: string | null
  tags: string | null
  pinned: boolean
  exists: boolean
  checksEnabled: boolean
  lastReviewedAt: Date | null
}

function parseTags(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((t): t is string => typeof t === "string")
  } catch {
    /* fall through */
  }
  return []
}

function toRecord(row: ProjectRow): ProjectRecord {
  return {
    slug: row.slug,
    displayName: row.displayName,
    stage: isLifecycleStage(row.stage) ? row.stage : DEFAULT_STAGE,
    owner: row.owner,
    description: row.description,
    notes: row.notes,
    tags: parseTags(row.tags),
    pinned: row.pinned,
    exists: row.exists,
    checksEnabled: row.checksEnabled,
    lastReviewedAt: row.lastReviewedAt ? row.lastReviewedAt.toISOString() : null,
  }
}

function newestIso(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return Date.parse(a) >= Date.parse(b) ? a : b
}

async function getRecordMap(): Promise<Map<string, ProjectRecord>> {
  const rows = (await prisma.project.findMany()) as ProjectRow[]
  return new Map(rows.map((r) => [r.slug, toRecord(r)]))
}

export async function listPortfolio(force = false): Promise<PortfolioProject[]> {
  const [discovered, records] = await Promise.all([
    scanProjects(force),
    getRecordMap(),
  ])

  const out: PortfolioProject[] = []
  const seen = new Set<string>()

  for (const d of discovered) {
    seen.add(d.slug)
    const rec = records.get(d.slug)
    const stage: LifecycleStage = rec?.stage ?? DEFAULT_STAGE
    const lastActivityAt = newestIso(d.git.lastCommitAt, d.lastTouchedAt)
    const health = deriveHealth({
      exists: true,
      missingDir: false,
      planned: false,
      stage,
      git: d.git,
      stack: d.stack,
      lastActivityAt,
    })
    out.push({
      slug: d.slug,
      displayName: rec?.displayName ?? d.slug,
      path: d.path,
      stage,
      exists: true,
      planned: false,
      missingDir: false,
      curated: !!rec,
      owner: rec?.owner ?? null,
      description: rec?.description ?? d.detectedDescription,
      notes: rec?.notes ?? null,
      tags: rec?.tags ?? [],
      pinned: rec?.pinned ?? false,
      checksEnabled: rec?.checksEnabled ?? false,
      lastReviewedAt: rec?.lastReviewedAt ?? null,
      git: d.git,
      stack: d.stack,
      lastActivityAt,
      health,
    })
  }

  // Curated rows with no directory on disk: planned ideas, or projects whose
  // directory has since been removed/renamed.
  for (const rec of records.values()) {
    if (seen.has(rec.slug)) continue
    const missingDir = rec.exists // row claimed a dir existed, but the scan didn't find it
    const health = deriveHealth({
      exists: false,
      missingDir,
      planned: !missingDir,
      stage: rec.stage,
      git: null,
      stack: null,
      lastActivityAt: rec.lastReviewedAt,
    })
    out.push({
      slug: rec.slug,
      displayName: rec.displayName ?? rec.slug,
      path: null,
      stage: rec.stage,
      exists: false,
      planned: !missingDir,
      missingDir,
      curated: true,
      owner: rec.owner,
      description: rec.description,
      notes: rec.notes,
      tags: rec.tags,
      pinned: rec.pinned,
      checksEnabled: rec.checksEnabled,
      lastReviewedAt: rec.lastReviewedAt,
      git: null,
      stack: null,
      lastActivityAt: rec.lastReviewedAt,
      health,
    })
  }

  out.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    const ta = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0
    const tb = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0
    if (tb !== ta) return tb - ta
    return a.slug.localeCompare(b.slug)
  })
  return out
}

export async function getPortfolioProject(
  slug: string,
  force = false,
): Promise<PortfolioProject | null> {
  const all = await listPortfolio(force)
  return all.find((p) => p.slug === slug) ?? null
}

const SLUG_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && slug.length <= 80
}

export interface ProjectPatch {
  displayName?: string | null
  stage?: LifecycleStage
  owner?: string | null
  description?: string | null
  notes?: string | null
  tags?: string[]
  pinned?: boolean
  checksEnabled?: boolean
  markReviewed?: boolean
}

function buildData(patch: ProjectPatch): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  if (patch.displayName !== undefined) data.displayName = patch.displayName || null
  if (patch.stage !== undefined && isLifecycleStage(patch.stage)) data.stage = patch.stage
  if (patch.owner !== undefined) data.owner = patch.owner || null
  if (patch.description !== undefined) data.description = patch.description || null
  if (patch.notes !== undefined) data.notes = patch.notes || null
  if (patch.tags !== undefined) data.tags = JSON.stringify(patch.tags)
  if (patch.pinned !== undefined) data.pinned = patch.pinned
  if (patch.checksEnabled !== undefined) data.checksEnabled = patch.checksEnabled
  if (patch.markReviewed) data.lastReviewedAt = new Date()
  return data
}

// Upsert curated fields for a discovered project (creates the row on first edit).
export async function updateProject(
  slug: string,
  patch: ProjectPatch,
): Promise<ProjectRecord> {
  const data = buildData(patch)
  const row = (await prisma.project.upsert({
    where: { slug },
    create: { slug, exists: true, ...data },
    update: data,
  })) as ProjectRow
  invalidateScanCache()
  return toRecord(row)
}

export interface PlannedInput {
  slug: string
  displayName?: string | null
  stage?: LifecycleStage
  description?: string | null
  owner?: string | null
  tags?: string[]
}

// Create a planned project (an idea with no directory on disk yet).
export async function createPlannedProject(input: PlannedInput): Promise<ProjectRecord> {
  const row = (await prisma.project.create({
    data: {
      slug: input.slug,
      displayName: input.displayName || null,
      stage: input.stage && isLifecycleStage(input.stage) ? input.stage : "idea",
      description: input.description || null,
      owner: input.owner || null,
      tags: input.tags ? JSON.stringify(input.tags) : null,
      exists: false,
    },
  })) as ProjectRow
  return toRecord(row)
}

export async function deleteProject(slug: string): Promise<void> {
  await prisma.project.delete({ where: { slug } }).catch(() => {
    /* already gone — treat as success */
  })
  invalidateScanCache()
}

export async function projectExistsInRegistry(slug: string): Promise<boolean> {
  const row = await prisma.project.findUnique({ where: { slug } })
  return !!row
}
