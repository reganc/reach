import "server-only"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import yaml from "js-yaml"
import { detectAppDatabases } from "./databases"
import { runCommand } from "./exec"
import {
  APPS_BASE_PATH,
  AppInfo,
  AppRuntimeStatus,
  AppServiceStatus,
  AppStatus,
  AppWithStatus,
  PortMapping,
  ServiceInfo,
} from "./types"

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "__pycache__",
  "vendor",
  ".next",
  "dist",
  "build",
  "target",
  ".venv",
  "venv",
])
const COMPOSE_FILENAMES = new Set([
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
])
const MAX_DEPTH = 4

const WEB_PORT_PREFERENCE = [
  80, 443, 3000, 8080, 8000, 8010, 8030, 8081, 8082, 8083, 5173, 7860, 7861,
  9000, 9090,
]

function isComposeFile(name: string): boolean {
  if (COMPOSE_FILENAMES.has(name)) return true
  if (name.startsWith("docker-compose.") && (name.endsWith(".yml") || name.endsWith(".yaml"))) {
    return true
  }
  return false
}

function makeAppId(composePath: string): string {
  return createHash("md5").update(composePath).digest("hex").slice(0, 12)
}

function projectName(composeFile: string): string {
  const folder = path.basename(path.dirname(composeFile))
  return folder.toLowerCase().replace(/[^a-z0-9_-]/g, "")
}

function parsePortString(value: unknown, serviceName: string): PortMapping | null {
  try {
    const raw = String(value)
    let s = raw
    let protocol = "tcp"
    if (s.includes("/")) {
      const idx = s.lastIndexOf("/")
      protocol = s.slice(idx + 1)
      s = s.slice(0, idx)
    }
    if (s.includes(":")) {
      const parts = s.split(":")
      let hostPart: string
      let containerPart: string
      if (parts.length === 2) {
        ;[hostPart, containerPart] = parts
      } else if (parts.length === 3) {
        hostPart = parts[1]
        containerPart = parts[2]
      } else {
        return null
      }
      if (hostPart.includes("-") || containerPart.includes("-")) return null
      const hostPort = Number.parseInt(hostPart, 10)
      const containerPort = Number.parseInt(containerPart, 10)
      if (!Number.isFinite(hostPort) || !Number.isFinite(containerPort)) return null
      return { hostPort, containerPort, protocol, serviceName }
    }
    const port = Number.parseInt(s, 10)
    if (!Number.isFinite(port)) return null
    return { hostPort: port, containerPort: port, protocol, serviceName }
  } catch {
    return null
  }
}

interface ParsedCompose {
  services: Record<string, Record<string, unknown> | null>
}

export async function parseComposeFile(composePath: string): Promise<AppInfo | null> {
  let raw: string
  try {
    raw = await fs.readFile(composePath, "utf8")
  } catch {
    return null
  }
  let data: ParsedCompose | null
  try {
    data = yaml.load(raw) as ParsedCompose | null
  } catch {
    return null
  }
  if (!data || typeof data !== "object") return null

  const appDir = path.dirname(composePath)
  let appName = path.basename(appDir)
  const parent = path.dirname(appDir)
  if (parent.endsWith("instances")) appName = `instances/${appName}`
  else if (parent.endsWith("Schwab")) appName = `Schwab/${appName}`

  const services: ServiceInfo[] = []
  const allPorts: PortMapping[] = []

  const servicesData = data.services && typeof data.services === "object" ? data.services : {}
  for (const [svcName, svcRaw] of Object.entries(servicesData)) {
    if (!svcRaw || typeof svcRaw !== "object") continue
    const svc = svcRaw as Record<string, unknown>

    let build: string | null = null
    if (typeof svc.build === "string") build = svc.build
    else if (svc.build && typeof svc.build === "object") {
      const b = svc.build as Record<string, unknown>
      build = typeof b.context === "string" ? b.context : JSON.stringify(b)
    }

    const rawPorts = Array.isArray(svc.ports) ? svc.ports : []
    const svcPortStrings: string[] = []
    for (const p of rawPorts) {
      const mapping = parsePortString(p, svcName)
      if (mapping) {
        svcPortStrings.push(String(p))
        allPorts.push(mapping)
      }
    }

    const rawVols = Array.isArray(svc.volumes) ? svc.volumes : []
    const volumes = rawVols.map((v) => String(v))

    services.push({
      name: svcName,
      image: typeof svc.image === "string" ? svc.image : null,
      build,
      ports: svcPortStrings,
      volumes,
    })
  }

  const base: AppInfo = {
    id: makeAppId(composePath),
    name: appName,
    path: appDir,
    composeFile: composePath,
    services,
    ports: allPorts,
    tags: [],
    databases: [],
  }
  base.databases = await detectAppDatabases(base)
  return base
}

export async function scanAppsDirectory(basePath = APPS_BASE_PATH): Promise<AppInfo[]> {
  const found: AppInfo[] = []
  const reachConsoleSelfDir = path.resolve(basePath, "reach")

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth >= MAX_DEPTH) return
    let entries: import("node:fs").Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    let composeAdded = false
    const subdirs: string[] = []

    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name) || entry.name.startsWith(".")) continue
        subdirs.push(full)
      } else if (entry.isFile() && !composeAdded && isComposeFile(entry.name)) {
        const info = await parseComposeFile(full)
        if (info) found.push(info)
        composeAdded = true
      }
    }

    for (const sub of subdirs) {
      // Skip reach itself when scanning its own apps dir (avoid recursing into our own node_modules tree)
      if (path.resolve(sub) === reachConsoleSelfDir) continue
      await walk(sub, depth + 1)
    }
  }

  await walk(path.resolve(basePath), 0)
  found.sort((a, b) => a.name.localeCompare(b.name))
  return found
}

export async function getStatusCache(): Promise<Record<string, AppRuntimeStatus>> {
  const result = await runCommand(
    "docker",
    [
      "ps",
      "-a",
      "--format",
      '{{.Label "com.docker.compose.project"}}|{{.Label "com.docker.compose.service"}}|{{.State}}|{{.Status}}',
    ],
    { timeoutMs: 10000 },
  )
  if (result.code !== 0) return {}

  const projectMap = new Map<string, AppServiceStatus[]>()
  for (const line of result.stdout.split("\n")) {
    const parts = line.split("|")
    if (parts.length < 4) continue
    const [proj, svc, state, status] = parts.map((p) => p.trim())
    if (!proj) continue
    if (!projectMap.has(proj)) projectMap.set(proj, [])
    projectMap.get(proj)!.push({ service: svc, state, status })
  }

  const out: Record<string, AppRuntimeStatus> = {}
  for (const [proj, services] of projectMap.entries()) {
    const countable = services.filter(
      (s) => !(s.state.toLowerCase() === "exited" && s.status.startsWith("Exited (0)")),
    )
    const running = countable.filter((s) =>
      ["running", "up"].includes(s.state.toLowerCase()),
    ).length
    const total = countable.length
    let overall: AppStatus
    if (total === 0) overall = "stopped"
    else if (running === total) overall = "running"
    else if (running > 0) overall = "partial"
    else overall = "stopped"
    out[proj] = { status: overall, running, total, services }
  }
  return out
}

function pickUiPort(ports: PortMapping[]): number | null {
  if (ports.length === 0) return null
  const hostPorts = ports.map((p) => p.hostPort)
  for (const preferred of WEB_PORT_PREFERENCE) {
    if (hostPorts.includes(preferred)) return preferred
  }
  return Math.min(...hostPorts)
}

let cachedApps: { at: number; apps: AppInfo[] } | null = null
const APPS_TTL_MS = 30_000

export async function getDiscoveredApps(force = false): Promise<AppInfo[]> {
  const now = Date.now()
  if (!force && cachedApps && now - cachedApps.at < APPS_TTL_MS) return cachedApps.apps
  const apps = await scanAppsDirectory()
  cachedApps = { at: now, apps }
  return apps
}

export async function getAppsWithStatus(force = false): Promise<AppWithStatus[]> {
  const [apps, statusCache] = await Promise.all([
    getDiscoveredApps(force),
    getStatusCache(),
  ])
  return apps.map((a) => {
    const proj = projectName(a.composeFile)
    const s = statusCache[proj] ?? {
      status: "stopped" as AppStatus,
      running: 0,
      total: 0,
      services: [],
    }
    const port = pickUiPort(a.ports)
    return {
      ...a,
      status: s.status,
      runningCount: s.running,
      totalCount: s.total,
      servicesStatus: s.services,
      uiUrl: port ? `http://localhost:${port}` : null,
    }
  })
}

export async function getAppById(id: string): Promise<AppWithStatus | null> {
  const apps = await getAppsWithStatus()
  return apps.find((a) => a.id === id) ?? null
}

export async function startApp(app: AppInfo): Promise<{ ok: boolean; output: string }> {
  const result = await runCommand(
    "docker",
    [
      "compose",
      "-f",
      app.composeFile,
      "--project-directory",
      app.path,
      "up",
      "-d",
    ],
    { timeoutMs: 180_000, cwd: app.path },
  )
  cachedApps = null
  return {
    ok: result.code === 0,
    output: (result.stdout + "\n" + result.stderr).slice(-4000),
  }
}

export async function stopApp(app: AppInfo): Promise<{ ok: boolean; output: string }> {
  const result = await runCommand(
    "docker",
    [
      "compose",
      "-f",
      app.composeFile,
      "--project-directory",
      app.path,
      "down",
    ],
    { timeoutMs: 90_000, cwd: app.path },
  )
  cachedApps = null
  return {
    ok: result.code === 0,
    output: (result.stdout + "\n" + result.stderr).slice(-4000),
  }
}

export async function restartApp(app: AppInfo): Promise<{ ok: boolean; output: string }> {
  await runCommand(
    "docker",
    [
      "compose",
      "-f",
      app.composeFile,
      "--project-directory",
      app.path,
      "down",
    ],
    { timeoutMs: 90_000, cwd: app.path },
  )
  const up = await runCommand(
    "docker",
    [
      "compose",
      "-f",
      app.composeFile,
      "--project-directory",
      app.path,
      "up",
      "-d",
    ],
    { timeoutMs: 180_000, cwd: app.path },
  )
  cachedApps = null
  return {
    ok: up.code === 0,
    output: (up.stdout + "\n" + up.stderr).slice(-4000),
  }
}

export async function getAppLogs(
  app: AppInfo,
  lines = 200,
  service?: string,
): Promise<string> {
  const args = [
    "compose",
    "-f",
    app.composeFile,
    "--project-directory",
    app.path,
    "logs",
    `--tail=${lines}`,
    "--no-color",
  ]
  if (service) args.push(service)
  const result = await runCommand("docker", args, {
    timeoutMs: 30_000,
    cwd: app.path,
  })
  return result.stdout + result.stderr
}
