import "server-only"
import fs from "node:fs/promises"
import os from "node:os"
import { runCommand } from "./exec"
import { ContainerStats, GpuStats, SystemStats } from "./types"

interface CpuTimes {
  user: number
  nice: number
  system: number
  idle: number
  iowait: number
  irq: number
  softirq: number
  steal: number
}

async function readCpuTimes(): Promise<CpuTimes | null> {
  try {
    const stat = await fs.readFile("/proc/stat", "utf8")
    const line = stat.split("\n").find((l) => l.startsWith("cpu "))
    if (!line) return null
    const fields = line.split(/\s+/).slice(1).map((n) => Number(n))
    const [user, nice, system, idle, iowait, irq, softirq, steal] = fields
    return {
      user: user || 0,
      nice: nice || 0,
      system: system || 0,
      idle: idle || 0,
      iowait: iowait || 0,
      irq: irq || 0,
      softirq: softirq || 0,
      steal: steal || 0,
    }
  } catch {
    return null
  }
}

let lastCpuSample: { at: number; times: CpuTimes } | null = null

async function getCpuPercent(): Promise<number> {
  const current = await readCpuTimes()
  if (!current) return 0
  const now = Date.now()
  if (!lastCpuSample || now - lastCpuSample.at < 200) {
    if (!lastCpuSample) lastCpuSample = { at: now, times: current }
    // Take a fresh sample over a short interval
    await new Promise((r) => setTimeout(r, 250))
    const second = await readCpuTimes()
    if (!second) return 0
    const pct = computeCpuPercent(current, second)
    lastCpuSample = { at: Date.now(), times: second }
    return pct
  }
  const pct = computeCpuPercent(lastCpuSample.times, current)
  lastCpuSample = { at: now, times: current }
  return pct
}

function computeCpuPercent(prev: CpuTimes, curr: CpuTimes): number {
  const prevIdle = prev.idle + prev.iowait
  const currIdle = curr.idle + curr.iowait
  const prevTotal =
    prev.user + prev.nice + prev.system + prev.idle + prev.iowait + prev.irq + prev.softirq + prev.steal
  const currTotal =
    curr.user + curr.nice + curr.system + curr.idle + curr.iowait + curr.irq + curr.softirq + curr.steal
  const totalDiff = currTotal - prevTotal
  const idleDiff = currIdle - prevIdle
  if (totalDiff <= 0) return 0
  return Math.max(0, Math.min(100, ((totalDiff - idleDiff) / totalDiff) * 100))
}

async function readMemInfo(): Promise<{ total: number; available: number } | null> {
  try {
    const txt = await fs.readFile("/proc/meminfo", "utf8")
    const map: Record<string, number> = {}
    for (const line of txt.split("\n")) {
      const m = line.match(/^(\w+):\s+(\d+)\s*kB/)
      if (m) map[m[1]] = Number(m[2]) * 1024
    }
    if (!map.MemTotal) return null
    const available = map.MemAvailable ?? map.MemFree ?? 0
    return { total: map.MemTotal, available }
  } catch {
    return null
  }
}

async function getDiskUsage(): Promise<{ total: number; used: number; percent: number }> {
  const result = await runCommand("df", ["-PkB1", "/"], { timeoutMs: 5000 })
  if (result.code !== 0) return { total: 0, used: 0, percent: 0 }
  const lines = result.stdout.trim().split("\n")
  if (lines.length < 2) return { total: 0, used: 0, percent: 0 }
  // Filesystem 1B-blocks Used Available Capacity Mounted
  const cols = lines[1].trim().split(/\s+/)
  if (cols.length < 5) return { total: 0, used: 0, percent: 0 }
  const total = Number(cols[1]) || 0
  const used = Number(cols[2]) || 0
  const percent = total > 0 ? (used / total) * 100 : 0
  return { total, used, percent }
}

export async function getSystemStats(): Promise<SystemStats> {
  const [cpu, mem, disk] = await Promise.all([
    getCpuPercent(),
    readMemInfo(),
    getDiskUsage(),
  ])
  const load = os.loadavg() as [number, number, number]
  const total = mem?.total ?? 0
  const available = mem?.available ?? 0
  const used = total - available
  return {
    cpuPercent: round(cpu, 1),
    cpuCount: os.cpus().length || 1,
    memoryTotal: total,
    memoryUsed: used,
    memoryPercent: total > 0 ? round((used / total) * 100, 1) : 0,
    diskTotal: disk.total,
    diskUsed: disk.used,
    diskPercent: round(disk.percent, 1),
    loadAvg: load,
  }
}

function round(n: number, places = 2): number {
  const m = Math.pow(10, places)
  return Math.round(n * m) / m
}

export async function getGpuStats(): Promise<GpuStats> {
  const result = await runCommand(
    "nvidia-smi",
    [
      "--query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu,power.draw",
      "--format=csv,noheader,nounits",
    ],
    { timeoutMs: 5000 },
  )
  if (result.code !== 0) return { available: false }
  const line = result.stdout.split("\n").find((l) => l.trim())
  if (!line) return { available: false }
  const parts = line.split(",").map((p) => p.trim())
  if (parts.length < 6) return { available: false }
  const num = (s: string): number => {
    const v = Number(s.replace(/[^\d.]/g, ""))
    return Number.isFinite(v) ? v : 0
  }
  let power: number | null = null
  if (parts[6] && !parts[6].includes("N/A")) {
    const p = Number(parts[6].replace(/[^\d.]/g, ""))
    if (Number.isFinite(p)) power = p
  }
  return {
    available: true,
    name: parts[0],
    totalVramMb: Math.round(num(parts[1])),
    usedVramMb: Math.round(num(parts[2])),
    freeVramMb: Math.round(num(parts[3])),
    utilizationPercent: num(parts[4]),
    temperatureC: num(parts[5]),
    powerDrawW: power,
  }
}

interface DockerStatsRow {
  ID: string
  Name: string
  CPUPerc: string
  MemUsage: string
  MemPerc: string
  NetIO: string
  PIDs: string
}

function parseSize(text: string): number {
  // "12.3MiB" / "1.2GiB" / "512KiB" / "1024B"
  const m = text.trim().match(/^([\d.]+)\s*([a-zA-Z]+)?$/)
  if (!m) return 0
  const value = Number(m[1])
  if (!Number.isFinite(value)) return 0
  const unit = (m[2] ?? "B").toLowerCase()
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    kib: 1024,
    mb: 1024 ** 2,
    mib: 1024 ** 2,
    gb: 1024 ** 3,
    gib: 1024 ** 3,
    tb: 1024 ** 4,
    tib: 1024 ** 4,
  }
  return value * (multipliers[unit] ?? 1)
}

export async function getContainerStats(): Promise<ContainerStats[]> {
  const fmt =
    "{{.ID}}|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.PIDs}}"
  const stats = await runCommand(
    "docker",
    ["stats", "--no-stream", "--format", fmt],
    { timeoutMs: 15000 },
  )
  if (stats.code !== 0) return []

  // Get image + status in a separate fast call
  const ps = await runCommand(
    "docker",
    ["ps", "--format", "{{.ID}}|{{.Image}}|{{.Status}}"],
    { timeoutMs: 10000 },
  )
  const meta = new Map<string, { image: string; status: string }>()
  for (const line of ps.stdout.split("\n")) {
    const parts = line.split("|")
    if (parts.length < 3) continue
    meta.set(parts[0].trim(), { image: parts[1].trim(), status: parts[2].trim() })
  }

  const results: ContainerStats[] = []
  for (const line of stats.stdout.split("\n")) {
    const parts = line.split("|")
    if (parts.length < 7) continue
    const [id, name, cpuPerc, memUsage, memPerc, netIO, pids] = parts.map((p) => p.trim())
    const memMatch = memUsage.split("/")
    const memUsed = parseSize(memMatch[0] ?? "0")
    const memLimit = parseSize(memMatch[1] ?? "0")
    const netParts = netIO.split("/")
    const rx = parseSize(netParts[0] ?? "0")
    const tx = parseSize(netParts[1] ?? "0")
    const m = meta.get(id) ?? { image: "", status: "" }
    results.push({
      containerId: id,
      name,
      image: m.image,
      status: m.status,
      cpuPercent: Number(cpuPerc.replace("%", "")) || 0,
      memoryUsage: memUsed,
      memoryLimit: memLimit,
      memoryPercent: Number(memPerc.replace("%", "")) || 0,
      networkRx: rx,
      networkTx: tx,
      pids: Number(pids) || 0,
    })
  }
  results.sort((a, b) => b.cpuPercent - a.cpuPercent)
  return results
}

interface ResourceSummary {
  system: { cpuPercent: number; memoryPercent: number; diskPercent: number }
  containerCount: number
  gpu: GpuStats
}

let summaryCache: { at: number; data: ResourceSummary } | null = null
const SUMMARY_TTL_MS = 5_000

export async function getResourceSummary(): Promise<ResourceSummary> {
  const now = Date.now()
  if (summaryCache && now - summaryCache.at < SUMMARY_TTL_MS) return summaryCache.data
  const [system, gpu, ps] = await Promise.all([
    getSystemStats(),
    getGpuStats(),
    runCommand("docker", ["ps", "-q"], { timeoutMs: 5000 }),
  ])
  const containerCount = ps.code === 0
    ? ps.stdout.split("\n").filter((l) => l.trim()).length
    : 0
  const data: ResourceSummary = {
    system: {
      cpuPercent: system.cpuPercent,
      memoryPercent: system.memoryPercent,
      diskPercent: system.diskPercent,
    },
    containerCount,
    gpu,
  }
  summaryCache = { at: now, data }
  return data
}
