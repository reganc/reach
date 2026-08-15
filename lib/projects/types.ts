// Development-lifecycle portfolio types. The "portfolio" view tracks every
// project directory under ~/apps across its development cycle — distinct from
// the console, which only tracks the runtime (docker-compose) layer.

export type LifecycleStage =
  | "unsorted"
  | "idea"
  | "scaffold"
  | "active"
  | "beta"
  | "prod"
  | "maintenance"
  | "deprecated"
  | "archived"

export interface StageMeta {
  id: LifecycleStage
  label: string
  /** Tailwind text/bg accent classes for badges and board column headers. */
  accent: string
  dot: string
  /** Hidden from the board by default (still reachable via "show archived"). */
  archivedByDefault: boolean
}

// Ordered — drives board column order and select ordering.
export const STAGES: StageMeta[] = [
  { id: "unsorted", label: "Inbox", accent: "text-zinc-400 bg-zinc-500/10", dot: "bg-zinc-400", archivedByDefault: false },
  { id: "idea", label: "Idea", accent: "text-violet-300 bg-violet-500/10", dot: "bg-violet-400", archivedByDefault: false },
  { id: "scaffold", label: "Scaffold", accent: "text-blue-300 bg-blue-500/10", dot: "bg-blue-400", archivedByDefault: false },
  { id: "active", label: "Active", accent: "text-amber-300 bg-amber-500/10", dot: "bg-amber-400", archivedByDefault: false },
  { id: "beta", label: "Beta", accent: "text-cyan-300 bg-cyan-500/10", dot: "bg-cyan-400", archivedByDefault: false },
  { id: "prod", label: "Production", accent: "text-emerald-300 bg-emerald-500/10", dot: "bg-emerald-400", archivedByDefault: false },
  { id: "maintenance", label: "Maintenance", accent: "text-teal-300 bg-teal-500/10", dot: "bg-teal-400", archivedByDefault: false },
  { id: "deprecated", label: "Deprecated", accent: "text-orange-300 bg-orange-500/10", dot: "bg-orange-400", archivedByDefault: true },
  { id: "archived", label: "Archived", accent: "text-zinc-500 bg-zinc-500/10", dot: "bg-zinc-600", archivedByDefault: true },
]

export const STAGE_IDS = STAGES.map((s) => s.id)
export const DEFAULT_STAGE: LifecycleStage = "unsorted"

export function stageMeta(stage: string): StageMeta {
  return STAGES.find((s) => s.id === stage) ?? STAGES[0]
}

export function isLifecycleStage(value: unknown): value is LifecycleStage {
  return typeof value === "string" && STAGE_IDS.includes(value as LifecycleStage)
}

export type HealthLevel =
  | "healthy"
  | "dirty"
  | "stale"
  | "attention"
  | "unknown"

// Small flags surfaced as chips in the UI; richer than the single HealthLevel.
export type HealthFlag =
  | "dirty"
  | "stale"
  | "behind"
  | "ahead"
  | "no-remote"
  | "detached"
  | "no-vcs"
  | "missing-dir"
  | "no-readme"
  | "no-tests"

export interface ProjectHealth {
  level: HealthLevel
  flags: HealthFlag[]
}

export interface GitInfo {
  isRepo: boolean
  branch: string | null
  detached: boolean
  dirtyCount: number
  ahead: number
  behind: number
  hasRemote: boolean
  lastCommitAt: string | null // ISO
  lastCommitSubject: string | null
  lastCommitHash: string | null
}

export type StackLanguage =
  | "node"
  | "python"
  | "rust"
  | "go"
  | "php"
  | "swift"
  | "java"
  | "unknown"

export interface StackInfo {
  language: StackLanguage
  hasReadme: boolean
  hasClaudeMd: boolean
  hasTests: boolean
  hasCompose: boolean
  hasDockerfile: boolean
}

// What scan.ts produces per directory (discovered, never persisted).
export interface DiscoveredProject {
  slug: string
  path: string
  git: GitInfo
  stack: StackInfo
  /** Newest mtime fallback when not a git repo; ISO. */
  lastTouchedAt: string | null
  /** Best-effort one-liner from package.json/README. */
  detectedDescription: string | null
}

// Persisted curated fields (Project Prisma row), serialized for the client.
export interface ProjectRecord {
  slug: string
  displayName: string | null
  stage: LifecycleStage
  owner: string | null
  description: string | null
  notes: string | null
  tags: string[]
  pinned: boolean
  exists: boolean
  checksEnabled: boolean
  lastReviewedAt: string | null
}

// The merged shape the API returns and the UI consumes.
export interface PortfolioProject {
  slug: string
  displayName: string
  path: string | null // null for planned apps with no directory
  stage: LifecycleStage
  exists: boolean // true if a directory is on disk
  planned: boolean // curated row with no directory (idea / not built yet)
  missingDir: boolean // curated row expected on disk but directory is gone
  curated: boolean // a Project DB row exists for this slug
  owner: string | null
  description: string | null
  notes: string | null
  tags: string[]
  pinned: boolean
  checksEnabled: boolean
  lastReviewedAt: string | null
  git: GitInfo | null
  stack: StackInfo | null
  lastActivityAt: string | null // best signal: last commit, else mtime
  health: ProjectHealth
}
