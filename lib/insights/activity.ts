import "server-only"
import { runCommand } from "@/lib/console/exec"

export const WEEKS_TRACKED = 52

/** Monday 00:00 UTC of the week containing `d`. */
function weekStart(d: Date): Date {
  const day = d.getUTCDay() // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff))
  return monday
}

/** The shared week axis: WEEKS_TRACKED Mondays, oldest first, ending this week. */
export function buildWeekAxis(now = new Date()): string[] {
  const current = weekStart(now)
  const weeks: string[] = []
  for (let i = WEEKS_TRACKED - 1; i >= 0; i--) {
    const w = new Date(current)
    w.setUTCDate(w.getUTCDate() - i * 7)
    weeks.push(w.toISOString().slice(0, 10))
  }
  return weeks
}

/**
 * Commits-per-week for one repo, aligned to `weeks`. Non-repos return zeros
 * (git exits non-zero and we fall through to the empty histogram).
 */
export async function readWeeklyCommits(
  dir: string,
  weeks: string[],
): Promise<number[]> {
  const counts = new Array<number>(weeks.length).fill(0)
  const res = await runCommand(
    "git",
    ["-C", dir, "log", `--since=${weeks[0]}T00:00:00Z`, "--format=%cs"],
    { timeoutMs: 10_000 },
  )
  if (res.code !== 0) return counts

  const index = new Map(weeks.map((w, i) => [w, i]))
  for (const line of res.stdout.split("\n")) {
    const date = line.trim()
    if (!date) continue
    const parsed = new Date(`${date}T00:00:00Z`)
    if (Number.isNaN(parsed.getTime())) continue
    const i = index.get(weekStart(parsed).toISOString().slice(0, 10))
    if (i !== undefined) counts[i]++
  }
  return counts
}
