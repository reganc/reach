import "server-only"
import path from "node:path"
import { runCommand } from "@/lib/console/exec"
import { APPS_BASE_PATH } from "@/lib/console/types"
import type { RuntimeInfo } from "./types"

const EMPTY: RuntimeInfo = {
  lastStartedAt: null,
  runningContainers: 0,
  totalContainers: 0,
}

/** "0001-01-01T00:00:00Z" — docker's zero value for never-started containers. */
function isRealTimestamp(iso: string): boolean {
  return iso.length > 0 && !iso.startsWith("0001-")
}

/**
 * Maps every compose-managed container to the top-level ~/apps directory its
 * project lives in (via the compose working_dir label) and aggregates the most
 * recent start time + running counts per slug.
 */
export async function readRuntimeBySlug(
  basePath = APPS_BASE_PATH,
): Promise<Map<string, RuntimeInfo>> {
  const out = new Map<string, RuntimeInfo>()
  const ids = await runCommand("docker", ["ps", "-aq"], { timeoutMs: 10_000 })
  if (ids.code !== 0) return out
  const idList = ids.stdout.split("\n").map((s) => s.trim()).filter(Boolean)
  if (idList.length === 0) return out

  const inspect = await runCommand(
    "docker",
    [
      "inspect",
      "--format",
      '{{index .Config.Labels "com.docker.compose.project.working_dir"}}\x1f{{.State.StartedAt}}\x1f{{.State.Running}}',
      ...idList,
    ],
    { timeoutMs: 15_000 },
  )
  // Don't gate on exit code: if any container vanished between `ps` and
  // `inspect`, docker exits 1 but still prints full lines for the survivors.
  // Discarding stdout here would wipe runtime data for every app.

  const base = path.resolve(basePath)
  for (const line of inspect.stdout.split("\n")) {
    if (!line.trim()) continue
    const [workingDir, startedAt, running] = line.split("\x1f")
    if (!workingDir) continue // not compose-managed
    const resolved = path.resolve(workingDir)
    if (!resolved.startsWith(base + path.sep)) continue
    const slug = resolved.slice(base.length + 1).split(path.sep)[0]
    if (!slug) continue

    const prev = out.get(slug) ?? EMPTY
    const started = isRealTimestamp(startedAt ?? "") ? startedAt : null
    out.set(slug, {
      lastStartedAt:
        started && (!prev.lastStartedAt || started > prev.lastStartedAt)
          ? started
          : prev.lastStartedAt,
      runningContainers: prev.runningContainers + (running?.trim() === "true" ? 1 : 0),
      totalContainers: prev.totalContainers + 1,
    })
  }
  return out
}
