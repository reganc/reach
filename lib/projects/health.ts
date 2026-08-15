import type {
  GitInfo,
  HealthFlag,
  LifecycleStage,
  ProjectHealth,
  StackInfo,
} from "./types"

// Days of inactivity before an in-development project is flagged stale.
const STALE_DAYS = 45
// Stages where ongoing commits are expected — a quiet prod app is not "stale".
const ACTIVE_DEV_STAGES = new Set<LifecycleStage>(["scaffold", "active", "beta"])

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return (Date.now() - t) / 86_400_000
}

export interface HealthInput {
  exists: boolean
  missingDir: boolean
  planned: boolean
  stage: LifecycleStage
  git: GitInfo | null
  stack: StackInfo | null
  lastActivityAt: string | null
}

export function deriveHealth(input: HealthInput): ProjectHealth {
  const { git, stack, stage, lastActivityAt } = input
  const flags: HealthFlag[] = []

  // A curated row whose directory has disappeared is the loudest signal.
  if (input.missingDir) {
    return { level: "attention", flags: ["missing-dir"] }
  }
  // A planned idea with no directory yet — nothing to assess.
  if (input.planned || !input.exists) {
    return { level: "unknown", flags: [] }
  }

  if (!git || !git.isRepo) {
    flags.push("no-vcs")
    if (stack && !stack.hasReadme) flags.push("no-readme")
    return { level: "unknown", flags }
  }

  if (git.dirtyCount > 0) flags.push("dirty")
  if (git.detached) flags.push("detached")
  if (git.behind > 0) flags.push("behind")
  if (git.ahead > 0) flags.push("ahead")
  if (!git.hasRemote) flags.push("no-remote")
  if (stack && !stack.hasReadme) flags.push("no-readme")
  if (stack && !stack.hasTests) flags.push("no-tests")

  const idleDays = daysSince(lastActivityAt)
  const stale =
    ACTIVE_DEV_STAGES.has(stage) && idleDays !== null && idleDays > STALE_DAYS
  if (stale && !flags.includes("stale")) flags.push("stale")

  let level: ProjectHealth["level"]
  if (git.detached || git.behind > 0) level = "attention"
  else if (stale) level = "stale"
  else if (git.dirtyCount > 0) level = "dirty"
  else level = "healthy"

  return { level, flags }
}
