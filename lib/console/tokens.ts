import "server-only"
import fs from "node:fs/promises"
import path from "node:path"
import {
  ActivityAggregate,
  CLAUDE_CONFIG_PATH,
  CLAUDE_USAGE_FILE,
  DayAggregate,
  ModelAggregate,
  ProjectAggregate,
  TokenProjects,
  TokenUsageEntry,
  TokenUsageSummary,
} from "./types"

interface RawUsageEntry {
  timestamp?: string
  model?: string
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  cost_estimate?: number
}

export async function getTokenUsageSummary(): Promise<TokenUsageSummary | null> {
  let raw: string
  try {
    raw = await fs.readFile(CLAUDE_USAGE_FILE, "utf8")
  } catch {
    return null
  }
  const entries: RawUsageEntry[] = []
  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (!t) continue
    try {
      entries.push(JSON.parse(t))
    } catch {
      continue
    }
  }

  const totalTokens = entries.reduce((s, e) => s + (e.total_tokens ?? 0), 0)
  const totalCost = entries.reduce((s, e) => s + (e.cost_estimate ?? 0), 0)

  const modelMap = new Map<string, ModelAggregate>()
  const dayMap = new Map<string, DayAggregate>()

  for (const e of entries) {
    const model = e.model ?? "unknown"
    const m =
      modelMap.get(model) ?? {
        model,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cost: 0,
        count: 0,
      }
    m.inputTokens += e.input_tokens ?? 0
    m.outputTokens += e.output_tokens ?? 0
    m.totalTokens += e.total_tokens ?? 0
    m.cost += e.cost_estimate ?? 0
    m.count += 1
    modelMap.set(model, m)

    const day = (e.timestamp ?? "").slice(0, 10) || "unknown"
    const d =
      dayMap.get(day) ?? {
        date: day,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cost: 0,
        count: 0,
      }
    d.inputTokens += e.input_tokens ?? 0
    d.outputTokens += e.output_tokens ?? 0
    d.totalTokens += e.total_tokens ?? 0
    d.cost += e.cost_estimate ?? 0
    d.count += 1
    dayMap.set(day, d)
  }

  const byModel = [...modelMap.values()].sort((a, b) => b.totalTokens - a.totalTokens)
  const byDay = [...dayMap.values()].sort((a, b) => (a.date > b.date ? -1 : 1))
  const recent: TokenUsageEntry[] = entries.slice(-50).reverse().map((e) => ({
    timestamp: e.timestamp ?? "",
    model: e.model ?? "unknown",
    inputTokens: e.input_tokens ?? 0,
    outputTokens: e.output_tokens ?? 0,
    totalTokens: e.total_tokens ?? 0,
    costEstimate: e.cost_estimate ?? 0,
  }))

  let lastModified: string | null = null
  try {
    const stat = await fs.stat(CLAUDE_USAGE_FILE)
    lastModified = stat.mtime.toISOString()
  } catch {}

  return {
    totalTokens,
    totalCost: round(totalCost, 6),
    entryCount: entries.length,
    byModel,
    byDay,
    recentEntries: recent,
    lastModified,
  }
}

function round(n: number, places = 2): number {
  const m = Math.pow(10, places)
  return Math.round(n * m) / m
}

const MODEL_COSTS: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-opus-4": { input: 15e-6, output: 75e-6, cacheWrite: 18.75e-6, cacheRead: 1.5e-6 },
  "claude-opus-4-5": { input: 15e-6, output: 75e-6, cacheWrite: 18.75e-6, cacheRead: 1.5e-6 },
  "claude-opus-4-7": { input: 15e-6, output: 75e-6, cacheWrite: 18.75e-6, cacheRead: 1.5e-6 },
  "claude-sonnet-4-6": { input: 3e-6, output: 15e-6, cacheWrite: 3.75e-6, cacheRead: 0.3e-6 },
  "claude-sonnet-4-5": { input: 3e-6, output: 15e-6, cacheWrite: 3.75e-6, cacheRead: 0.3e-6 },
  "claude-haiku-4-5": { input: 0.8e-6, output: 4e-6, cacheWrite: 1e-6, cacheRead: 0.08e-6 },
  "claude-haiku-3-5": { input: 0.8e-6, output: 4e-6, cacheWrite: 1e-6, cacheRead: 0.08e-6 },
}
const DEFAULT_RATES = { input: 3e-6, output: 15e-6, cacheWrite: 3.75e-6, cacheRead: 0.3e-6 }

function tokenCost(
  model: string,
  input: number,
  output: number,
  cacheWrite: number,
  cacheRead: number,
): number {
  let rates = DEFAULT_RATES
  for (const key of Object.keys(MODEL_COSTS)) {
    if (model.startsWith(key) || model.includes(key)) {
      rates = MODEL_COSTS[key]
      break
    }
  }
  return (
    input * rates.input +
    output * rates.output +
    cacheWrite * rates.cacheWrite +
    cacheRead * rates.cacheRead
  )
}

function classifyActivity(userText: string, tools: string[]): string {
  const lower = userText.toLowerCase()
  const tset = new Set(tools.map((t) => t.toLowerCase()))
  const editTools = ["edit", "write", "notebookedit", "multiedit"]
  const readTools = ["read", "glob", "grep"]
  const hasEdit = editTools.some((t) => tset.has(t))
  const hasBash = tset.has("bash")
  const hasRead = readTools.some((t) => tset.has(t))

  if (hasBash) {
    if (/\bgit\b|\bcommit|\bpush|\bpull|\bbranch|\bmerge|\brebase/.test(lower)) return "git"
    if (/\bdeploy|\bbuild|\bdocker|\bcompose|\bci\b|\bcd\b|\bpipeline/.test(lower)) return "build_deploy"
    if (/\btest|\bpytest|\bjest|\bspec|\bunittest/.test(lower)) return "testing"
  }

  if (hasEdit) {
    if (/\bfix|\bbug|\berror|\bbroken|\bfailing|\bcrash|\bdebug|\bissue|\bexception|not working/.test(lower)) {
      return "debugging"
    }
    if (/\brefactor|\bclean|\brename|\breorganize|\bimprove|\boptimize/.test(lower)) return "refactoring"
    if (/\badd|\bcreate|\bimplement|\bnew |\bbuild|\bfeature|\bwrite|\bdevelop/.test(lower)) return "feature"
    return "coding"
  }

  if (hasRead) {
    if (/\bresearch|\bfind|\bsearch|\blook|\bhow|\bwhat|\bexplain/.test(lower)) return "research"
    return "exploration"
  }

  if (/\bfix|\bbug|\berror|\bdebug|\bbroken|\bfailing|\bexception/.test(lower)) return "debugging"
  if (/\bplan|\bdesign|\barchitecture|\bstructure|\bapproach|\bstrategy/.test(lower)) return "planning"
  if (/\bresearch|find out|look up|investigate/.test(lower)) return "research"
  if (/\bbrainstorm|\bidea|\bsuggest|what if|\boption/.test(lower)) return "planning"
  return "conversation"
}

function projectLabel(folder: string, cwd: string | null): string {
  if (cwd) {
    const parts = cwd.split("/").filter(Boolean)
    return parts.length >= 2 ? parts.slice(-2).join("/") : parts[parts.length - 1] ?? folder
  }
  const name = folder.replace(/^-/, "").replace(/-/g, "/")
  const parts = name.split("/").filter(Boolean)
  return parts.length >= 2 ? parts.slice(-2).join("/") : name
}

interface ClaudeEntry {
  type?: string
  cwd?: string
  timestamp?: string
  message?: {
    content?: unknown
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
    }
    model?: string
  }
}

interface Turn {
  text: string
  tools: string[]
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  model: string
  timestamp: string
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (b && typeof b === "object" && (b as { type?: string }).type === "text") {
          return (b as { text?: string }).text ?? ""
        }
        return ""
      })
      .join(" ")
  }
  return ""
}

function extractToolNames(content: unknown): string[] {
  if (!Array.isArray(content)) return []
  const names: string[] = []
  for (const b of content) {
    if (b && typeof b === "object" && (b as { type?: string }).type === "tool_use") {
      const name = (b as { name?: string }).name
      if (name) names.push(name)
    }
  }
  return names
}

export async function getTokenUsageProjects(): Promise<TokenProjects> {
  const projectsDir = path.join(CLAUDE_CONFIG_PATH, "projects")
  let folders: string[]
  try {
    folders = await fs.readdir(projectsDir)
  } catch {
    return { byProject: [], byActivity: [] }
  }

  interface ProjStats {
    sessions: number
    turns: number
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    cost: number
    lastActive: string
    activities: Map<string, ActivityAggregate>
  }
  const projStats = new Map<string, ProjStats>()

  for (const folder of folders.sort()) {
    const folderPath = path.join(projectsDir, folder)
    let stat: import("node:fs").Stats
    try {
      stat = await fs.stat(folderPath)
    } catch {
      continue
    }
    if (!stat.isDirectory()) continue
    let files: string[]
    try {
      files = (await fs.readdir(folderPath)).filter((f) => f.endsWith(".jsonl")).sort()
    } catch {
      continue
    }
    if (files.length === 0) continue

    let cwd: string | null = null
    for (const jf of files) {
      if (cwd) break
      let raw: string
      try {
        raw = await fs.readFile(path.join(folderPath, jf), "utf8")
      } catch {
        continue
      }
      for (const line of raw.split("\n")) {
        const t = line.trim()
        if (!t) continue
        try {
          const e = JSON.parse(t) as ClaudeEntry
          if (e.cwd) {
            cwd = e.cwd
            break
          }
        } catch {
          continue
        }
      }
    }

    const label = projectLabel(folder, cwd)
    const stats: ProjStats =
      projStats.get(label) ?? {
        sessions: 0,
        turns: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cost: 0,
        lastActive: "",
        activities: new Map(),
      }

    for (const jf of files) {
      let raw: string
      try {
        raw = await fs.readFile(path.join(folderPath, jf), "utf8")
      } catch {
        continue
      }
      const entries: ClaudeEntry[] = []
      for (const line of raw.split("\n")) {
        const t = line.trim()
        if (!t) continue
        try {
          entries.push(JSON.parse(t))
        } catch {
          continue
        }
      }
      if (entries.length === 0) continue
      stats.sessions += 1

      const turns: Turn[] = []
      let current: Turn | null = null
      for (const e of entries) {
        if (e.type === "user") {
          const text = extractText(e.message?.content).trim()
          if (text) {
            if (current) turns.push(current)
            current = {
              text,
              tools: [],
              inputTokens: 0,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              model: "claude-sonnet-4-6",
              timestamp: e.timestamp ?? "",
            }
          }
        } else if (e.type === "assistant" && current) {
          const usage = e.message?.usage ?? {}
          current.inputTokens += usage.input_tokens ?? 0
          current.outputTokens += usage.output_tokens ?? 0
          current.cacheReadTokens += usage.cache_read_input_tokens ?? 0
          current.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0
          if (e.message?.model) current.model = e.message.model
          for (const t of extractToolNames(e.message?.content)) current.tools.push(t)
        }
      }
      if (current) turns.push(current)

      for (const turn of turns) {
        const activity = classifyActivity(turn.text, turn.tools)
        const cost = tokenCost(
          turn.model,
          turn.inputTokens,
          turn.outputTokens,
          turn.cacheWriteTokens,
          turn.cacheReadTokens,
        )
        stats.turns += 1
        stats.inputTokens += turn.inputTokens
        stats.outputTokens += turn.outputTokens
        stats.cacheReadTokens += turn.cacheReadTokens
        stats.cacheWriteTokens += turn.cacheWriteTokens
        stats.cost += cost
        if (turn.timestamp > stats.lastActive) stats.lastActive = turn.timestamp

        const act =
          stats.activities.get(activity) ?? {
            activity,
            turns: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            cost: 0,
          }
        act.turns += 1
        act.inputTokens += turn.inputTokens
        act.outputTokens += turn.outputTokens
        act.cacheReadTokens += turn.cacheReadTokens
        act.cacheWriteTokens += turn.cacheWriteTokens
        act.cost += cost
        stats.activities.set(activity, act)
      }
    }
    projStats.set(label, stats)
  }

  const byProject: ProjectAggregate[] = []
  const activityTotals = new Map<string, ActivityAggregate>()

  for (const [project, s] of projStats.entries()) {
    byProject.push({
      project,
      sessions: s.sessions,
      turns: s.turns,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      cacheReadTokens: s.cacheReadTokens,
      cacheWriteTokens: s.cacheWriteTokens,
      cost: round(s.cost, 6),
      lastActive: s.lastActive,
    })
    for (const [name, av] of s.activities.entries()) {
      const t =
        activityTotals.get(name) ?? {
          activity: name,
          turns: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          cost: 0,
        }
      t.turns += av.turns
      t.inputTokens += av.inputTokens
      t.outputTokens += av.outputTokens
      t.cacheReadTokens += av.cacheReadTokens
      t.cacheWriteTokens += av.cacheWriteTokens
      t.cost += av.cost
      activityTotals.set(name, t)
    }
  }

  byProject.sort((a, b) => b.cost - a.cost)
  const byActivity = [...activityTotals.values()]
    .map((a) => ({ ...a, cost: round(a.cost, 6) }))
    .sort((a, b) => b.cost - a.cost)

  return { byProject, byActivity }
}
