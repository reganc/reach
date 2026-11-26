import "server-only"

/**
 * Each app's status level from the grok bot's hub (`GET /v1/hub` on llm-app),
 * for the dots on the launcher. Only the level is kept, never the items: the
 * launcher is reachable from the internet and its accounts aren't all admins.
 *
 * Needs LLM_API_KEY (the gateway key). Without it, or when the bot doesn't
 * answer, the launcher simply shows no dots.
 */
export type HubLevel = "info" | "warn" | "alert" | "down"

const BASE = process.env.LLM_GATEWAY_URL ?? "http://localhost:8030"
const TIMEOUT_MS = 4000
const TTL_MS = 60_000
let cached: { at: number; levels: Map<string, HubLevel> } | null = null

function parse(body: unknown): Map<string, HubLevel> {
  const levels = new Map<string, HubLevel>()
  const apps = (body as { apps?: unknown })?.apps
  if (!Array.isArray(apps)) return levels
  for (const a of apps) {
    if (!a || typeof a !== "object") continue
    const { id, level, up } = a as Record<string, unknown>
    if (typeof id !== "string") continue
    if (up === false) levels.set(id, "down")
    else if (level === "info" || level === "warn" || level === "alert") levels.set(id, level)
  }
  return levels
}

export async function hubLevels(): Promise<Map<string, HubLevel>> {
  const key = process.env.LLM_API_KEY
  if (!key) return new Map()
  if (cached && Date.now() - cached.at < TTL_MS) return cached.levels
  try {
    const res = await fetch(`${BASE}/v1/hub`, {
      headers: { Authorization: `Bearer ${key}` },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`hub ${res.status}`)
    cached = { at: Date.now(), levels: parse(await res.json()) }
    return cached.levels
  } catch {
    // Keep showing the last answer for a while rather than flickering to none.
    return cached && Date.now() - cached.at < TTL_MS * 10 ? cached.levels : new Map()
  }
}
