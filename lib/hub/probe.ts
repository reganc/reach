import "server-only"

/**
 * Whether launcher links still open. A link is dead when nothing answers, or
 * the app answers "not found" for that page. Only the yes/no is kept: no body
 * is read, and redirects are not followed.
 *
 * The URLs come from fleet.yaml and from launcher entries an admin added.
 */
const TIMEOUT_MS = 2500
const TTL_MS = 120_000
const cache = new Map<string, { at: number; alive: boolean }>()

async function alive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" })
    await res.body?.cancel()
    return res.status !== 404 && res.status !== 410
  } catch {
    return false
  }
}

/** url → alive, for each URL given. Results are kept for two minutes. */
export async function probeLinks(urls: string[]): Promise<Map<string, boolean>> {
  const now = Date.now()
  const unique = [...new Set(urls)]
  await Promise.all(
    unique
      .filter((u) => (cache.get(u)?.at ?? 0) < now - TTL_MS)
      .map(async (u) => cache.set(u, { at: Date.now(), alive: await alive(u) })),
  )
  return new Map(unique.map((u) => [u, cache.get(u)?.alive ?? false]))
}
