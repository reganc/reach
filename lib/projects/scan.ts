import "server-only"
import fs from "node:fs/promises"
import path from "node:path"
import { runCommand } from "@/lib/console/exec"
import { APPS_BASE_PATH } from "@/lib/console/types"
import type {
  DiscoveredProject,
  GitInfo,
  StackInfo,
  StackLanguage,
} from "./types"

// Top-level directories under ~/apps that are not projects.
const SKIP_DIRS = new Set(["node_modules", "models"])

const README_RE = /^readme(\.[a-z]+)?$/i
const COMPOSE_RE = /^(docker-)?compose\..*\.(ya?ml)$|^(docker-)?compose\.(ya?ml)$/i
const TEST_DIR_NAMES = new Set(["tests", "test", "__tests__", "spec", "e2e"])
const TEST_MARKER_FILES = new Set([
  "pytest.ini",
  "tox.ini",
  "jest.config.js",
  "jest.config.ts",
  "vitest.config.ts",
  "vitest.config.js",
])

interface DirListing {
  files: Set<string>
  dirs: Set<string>
}

async function listDir(dir: string): Promise<DirListing> {
  const files = new Set<string>()
  const dirs = new Set<string>()
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      if (e.isDirectory()) dirs.add(e.name)
      else if (e.isFile()) files.add(e.name)
    }
  } catch {
    /* unreadable — return empty */
  }
  return { files, dirs }
}

function detectLanguage(l: DirListing): StackLanguage {
  if (l.files.has("package.json")) return "node"
  if (
    l.files.has("pyproject.toml") ||
    l.files.has("requirements.txt") ||
    l.files.has("setup.py") ||
    l.files.has("Pipfile")
  )
    return "python"
  if (l.files.has("Cargo.toml")) return "rust"
  if (l.files.has("go.mod")) return "go"
  if (l.files.has("composer.json")) return "php"
  if (l.files.has("Package.swift")) return "swift"
  if (l.files.has("pom.xml") || l.files.has("build.gradle") || l.files.has("build.gradle.kts"))
    return "java"
  return "unknown"
}

function detectStack(l: DirListing): StackInfo {
  const hasReadme = [...l.files].some((f) => README_RE.test(f))
  const hasCompose = [...l.files].some((f) => COMPOSE_RE.test(f))
  const hasTests =
    [...l.dirs].some((d) => TEST_DIR_NAMES.has(d)) ||
    [...l.files].some((f) => TEST_MARKER_FILES.has(f))
  return {
    language: detectLanguage(l),
    hasReadme,
    hasClaudeMd: l.files.has("CLAUDE.md"),
    hasTests,
    hasCompose,
    hasDockerfile: l.files.has("Dockerfile"),
  }
}

const EMPTY_GIT: GitInfo = {
  isRepo: false,
  branch: null,
  detached: false,
  dirtyCount: 0,
  ahead: 0,
  behind: 0,
  hasRemote: false,
  lastCommitAt: null,
  lastCommitSubject: null,
  lastCommitHash: null,
}

function parseBranchHeader(line: string): {
  branch: string | null
  detached: boolean
  hasRemote: boolean
  ahead: number
  behind: number
} {
  // line starts with "## "
  const body = line.slice(3)
  if (body.startsWith("HEAD (no branch)")) {
    return { branch: "HEAD", detached: true, hasRemote: false, ahead: 0, behind: 0 }
  }
  const noCommits = body.match(/^No commits yet on (.+)$/)
  if (noCommits) {
    return { branch: noCommits[1].trim(), detached: false, hasRemote: false, ahead: 0, behind: 0 }
  }
  // "branch...upstream [ahead N, behind M]" | "branch...upstream" | "branch"
  let ahead = 0
  let behind = 0
  let rest = body
  const bracket = rest.match(/\s\[(.+)\]\s*$/)
  if (bracket) {
    const aheadM = bracket[1].match(/ahead (\d+)/)
    const behindM = bracket[1].match(/behind (\d+)/)
    if (aheadM) ahead = Number(aheadM[1])
    if (behindM) behind = Number(behindM[1])
    rest = rest.slice(0, bracket.index)
  }
  const sep = rest.indexOf("...")
  const branch = sep >= 0 ? rest.slice(0, sep).trim() : rest.trim()
  const hasRemote = sep >= 0
  return { branch, detached: false, hasRemote, ahead, behind }
}

async function readGit(dir: string): Promise<GitInfo> {
  const status = await runCommand(
    "git",
    ["-C", dir, "status", "--porcelain=v1", "--branch"],
    { timeoutMs: 8000 },
  )
  if (status.code !== 0) return EMPTY_GIT

  const lines = status.stdout.split("\n")
  const header = lines.find((l) => l.startsWith("## ")) ?? "## "
  const { branch, detached, hasRemote, ahead, behind } = parseBranchHeader(header)
  const dirtyCount = lines.filter(
    (l) => l.length > 0 && !l.startsWith("## "),
  ).length

  const git: GitInfo = {
    ...EMPTY_GIT,
    isRepo: true,
    branch,
    detached,
    dirtyCount,
    ahead,
    behind,
    hasRemote,
  }

  const log = await runCommand(
    "git",
    ["-C", dir, "log", "-1", "--format=%H%x1f%cI%x1f%s"],
    { timeoutMs: 8000 },
  )
  if (log.code === 0 && log.stdout.trim()) {
    const [hash, iso, subject] = log.stdout.trim().split("\x1f")
    git.lastCommitHash = hash ?? null
    git.lastCommitAt = iso ?? null
    git.lastCommitSubject = subject ?? null
  }
  return git
}

async function detectDescription(
  dir: string,
  listing: DirListing,
  language: StackLanguage,
): Promise<string | null> {
  if (language === "node" && listing.files.has("package.json")) {
    try {
      const raw = await fs.readFile(path.join(dir, "package.json"), "utf8")
      const parsed = JSON.parse(raw) as { description?: string }
      if (parsed.description?.trim()) return parsed.description.trim()
    } catch {
      /* ignore */
    }
  }
  const readme = [...listing.files].find((f) => README_RE.test(f))
  if (readme) {
    try {
      const raw = await fs.readFile(path.join(dir, readme), "utf8")
      for (const line of raw.split("\n")) {
        const t = line.replace(/^#+\s*/, "").trim()
        if (t.length >= 3 && !t.startsWith("![") && !t.startsWith("<")) {
          return t.slice(0, 200)
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

async function scanOne(basePath: string, slug: string): Promise<DiscoveredProject> {
  const dir = path.join(basePath, slug)
  const listing = await listDir(dir)
  const stack = detectStack(listing)
  const [git, detectedDescription, stat] = await Promise.all([
    readGit(dir),
    detectDescription(dir, listing, stack.language),
    fs.stat(dir).catch(() => null),
  ])
  return {
    slug,
    path: dir,
    git,
    stack,
    lastTouchedAt: stat ? stat.mtime.toISOString() : null,
    detectedDescription,
  }
}

// Bounded-concurrency map so we never spawn 200+ git processes at once.
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  )
  return results
}

let cache: { at: number; projects: DiscoveredProject[] } | null = null
const TTL_MS = 20_000

export async function scanProjects(
  force = false,
  basePath = APPS_BASE_PATH,
): Promise<DiscoveredProject[]> {
  const now = Date.now()
  if (!force && cache && now - cache.at < TTL_MS) return cache.projects

  let entries: import("node:fs").Dirent[]
  try {
    entries = await fs.readdir(basePath, { withFileTypes: true })
  } catch {
    return []
  }
  const slugs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !name.startsWith(".") && !SKIP_DIRS.has(name))

  const projects = await mapPool(slugs, 8, (slug) => scanOne(basePath, slug))
  projects.sort((a, b) => a.slug.localeCompare(b.slug))
  cache = { at: now, projects }
  return projects
}

export function invalidateScanCache(): void {
  cache = null
}

export interface CommitEntry {
  hash: string
  at: string // ISO
  subject: string
  author: string
}

export async function getRecentCommits(
  dir: string,
  limit = 15,
): Promise<CommitEntry[]> {
  const n = Math.min(50, Math.max(1, limit))
  const res = await runCommand(
    "git",
    ["-C", dir, "log", `-${n}`, "--format=%H%x1f%cI%x1f%an%x1f%s"],
    { timeoutMs: 8000 },
  )
  if (res.code !== 0) return []
  const commits: CommitEntry[] = []
  for (const line of res.stdout.split("\n")) {
    if (!line.trim()) continue
    const [hash, at, author, subject] = line.split("\x1f")
    if (!hash) continue
    commits.push({ hash, at: at ?? "", author: author ?? "", subject: subject ?? "" })
  }
  return commits
}
