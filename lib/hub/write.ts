import "server-only"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { prisma } from "@/lib/db"
import { runCommand } from "@/lib/console/exec"
import { getGpuStats, getSystemStats } from "@/lib/console/resources"
import type { App } from "@/lib/types"
import { buildCard, type CardInputs, type HubCard } from "./card"
import { loadFleet } from "./fleet"
import { mergeLauncher } from "./launcher"
import { probeLinks } from "./probe"

/**
 * Writes reach's card to ~/apps/.hub/reach.json for the grok bot (HUB.md).
 * reach runs on the host, so it writes the file itself: the bot reads the
 * folder read-only and never calls reach (whose admin API needs tailnet
 * ingress anyway). Errors are logged by name only and never thrown.
 */
const HUB_DIR = process.env.HUB_DIR ?? path.join(os.homedir(), "apps", ".hub")

async function containers(): Promise<CardInputs["containers"]> {
  const ps = await runCommand("docker", ["ps", "--format", "{{.Names}}|{{.Status}}"], { timeoutMs: 10_000 })
  if (ps.code !== 0) return null
  return ps.stdout
    .split("\n")
    .map((l) => l.split("|"))
    .filter((p) => p.length === 2 && p[0].trim())
    .map(([name, status]) => ({ name: name.trim(), status: status.trim() }))
}

async function deadLinks(): Promise<string[]> {
  const [tiles, stored] = await Promise.all([
    loadFleet(),
    prisma.app.findMany({ orderBy: { createdAt: "asc" } }) as Promise<App[]>,
  ])
  const { fleet, more } = mergeLauncher(tiles, stored)
  const reports = new Set(tiles.filter((t) => t.reports).map((t) => `fleet:${t.id}`))
  const checked = [...fleet.filter((a) => !reports.has(a.id)), ...more]
  const alive = await probeLinks(checked.map((a) => a.url))
  return checked.filter((a) => alive.get(a.url) === false).map((a) => a.name)
}

export async function gatherCard(): Promise<HubCard> {
  const [system, gpu, list, dead] = await Promise.all([
    getSystemStats().catch(() => null),
    getGpuStats().catch(() => null),
    containers().catch(() => null),
    deadLinks().catch(() => []),
  ])
  return buildCard({
    diskPercent: system && system.diskTotal > 0 ? system.diskPercent : null,
    memoryPercent: system && system.memoryTotal > 0 ? system.memoryPercent : null,
    gpu,
    containers: list,
    deadLinks: dead,
  })
}

export async function writeHubCard(): Promise<void> {
  try {
    const card = await gatherCard()
    await fs.mkdir(HUB_DIR, { recursive: true })
    const target = path.join(HUB_DIR, "reach.json")
    const temp = `${target}.${process.pid}.tmp`
    await fs.writeFile(temp, JSON.stringify(card, null, 2), { mode: 0o644 })
    await fs.rename(temp, target)
  } catch (e) {
    console.warn(`reach: hub card not written (${(e as Error).name})`)
  }
}
