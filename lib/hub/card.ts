/**
 * reach's status card for the grok bot (~/apps/HUB.md): host resources,
 * containers in trouble, and launcher links that no longer open. Pure, so it
 * can be tested without the machine; `write.ts` gathers the inputs.
 *
 * reach is a `home` app: percentages and names are fine in Telegram, money is
 * not (and nothing here is money — token cost stays on the console).
 */
export type Severity = "info" | "warn" | "alert"
export type HubItem = { title: string; severity: Severity; link?: string }
export type HubCard = { app: "reach"; generated_at: string; status: "ok" | "warn" | "alert"; items: HubItem[] }

export type CardInputs = {
  diskPercent: number | null
  memoryPercent: number | null
  gpu: { available: boolean; usedVramMb?: number; totalVramMb?: number; temperatureC?: number } | null
  containers: { name: string; status: string }[] | null // null: docker couldn't be asked
  deadLinks: string[] // launcher entries (names) that don't open
}

export const LIMITS = {
  diskWarn: 85,
  diskAlert: 95,
  memoryWarn: 90,
  gpuMemoryWarn: 97,
  gpuTempWarn: 85,
} as const

const CONSOLE = "http://localhost:3000/console"
const LAUNCHER = "http://localhost:3000/"
const MAX_ITEMS = 6

const list = (names: string[], max = 4) =>
  names.slice(0, max).join(", ") + (names.length > max ? ` and ${names.length - max} more` : "")
const pct = (n: number) => `${Math.round(n)}%`

export function buildCard(input: CardInputs, now = new Date()): HubCard {
  const items: HubItem[] = []
  const { diskPercent: disk, memoryPercent: mem, gpu, containers } = input

  if (disk !== null && disk >= LIMITS.diskWarn)
    items.push({
      title: `Disk ${pct(disk)} full${disk >= LIMITS.diskAlert ? ": apps will start failing to write" : ""}`,
      severity: disk >= LIMITS.diskAlert ? "alert" : "warn",
      link: `${CONSOLE}#cleanup`,
    })
  if (mem !== null && mem >= LIMITS.memoryWarn)
    items.push({ title: `Memory ${pct(mem)} used`, severity: "warn", link: `${CONSOLE}#resources` })

  if (gpu?.available && gpu.totalVramMb) {
    const used = ((gpu.usedVramMb ?? 0) / gpu.totalVramMb) * 100
    if (used >= LIMITS.gpuMemoryWarn)
      items.push({ title: `GPU memory ${pct(used)} used: models may be pushed to the CPU`, severity: "warn", link: `${CONSOLE}#resources` })
    if ((gpu.temperatureC ?? 0) >= LIMITS.gpuTempWarn)
      items.push({ title: `GPU at ${Math.round(gpu.temperatureC ?? 0)}°C`, severity: "warn", link: `${CONSOLE}#resources` })
  }

  if (containers === null) {
    items.push({ title: "Docker couldn't be asked about containers", severity: "warn", link: `${CONSOLE}#apps` })
  } else {
    const restarting = containers.filter((c) => /^restarting/i.test(c.status)).map((c) => c.name).sort()
    const unhealthy = containers.filter((c) => /\(unhealthy\)/i.test(c.status)).map((c) => c.name).sort()
    if (restarting.length)
      items.push({ title: `Restarting over and over: ${list(restarting)}`, severity: "alert", link: `${CONSOLE}#apps` })
    if (unhealthy.length)
      items.push({ title: `Unhealthy: ${list(unhealthy)}`, severity: "warn", link: `${CONSOLE}#apps` })
  }

  if (input.deadLinks.length) {
    const n = input.deadLinks.length
    items.push({
      title: `${n} launcher link${n === 1 ? " doesn't" : "s don't"} open: ${list([...input.deadLinks].sort())}`,
      severity: "info",
      link: `${LAUNCHER}admin`,
    })
  }

  if (!items.length) {
    const parts = [
      disk !== null ? `disk ${pct(disk)}` : null,
      mem !== null ? `memory ${pct(mem)}` : null,
      gpu?.available && gpu.totalVramMb ? `GPU memory ${pct(((gpu.usedVramMb ?? 0) / gpu.totalVramMb) * 100)}` : null,
    ].filter(Boolean)
    items.push({ title: `Host fine${parts.length ? `: ${parts.join(", ")}` : ""}`, severity: "info" })
  }

  const status = items.some((i) => i.severity === "alert") ? "alert" : items.some((i) => i.severity === "warn") ? "warn" : "ok"
  const worstFirst = [...items].sort((a, b) => RANK[b.severity] - RANK[a.severity])
  return { app: "reach", generated_at: now.toISOString(), status, items: worstFirst.slice(0, MAX_ITEMS).map(clip) }
}

const RANK: Record<Severity, number> = { info: 0, warn: 1, alert: 2 }

const clip = (i: HubItem): HubItem => ({ ...i, title: i.title.length > 160 ? `${i.title.slice(0, 159)}…` : i.title })
