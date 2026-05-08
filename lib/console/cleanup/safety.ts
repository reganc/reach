import "server-only"
import path from "node:path"
import { getDiscoveredApps } from "../apps"
import { APPS_BASE_PATH } from "../types"

const HOME = process.env.HOME ?? "/home/regan"

const ALWAYS_PROTECTED_PATHS = [
  `${HOME}/.ssh`,
  `${HOME}/.gnupg`,
  `${HOME}/.aws`,
  `${HOME}/.config/gcloud`,
  `${HOME}/.kube`,
  `${HOME}/.docker/config.json`,
  `${HOME}/.claude`,
  `${HOME}/.npmrc`,
  `${HOME}/.gitconfig`,
  "/etc",
  "/boot",
  "/var/lib/docker",
  "/var/lib/postgresql",
]

const PROTECTED_VOLUME_NAME_FRAGMENTS = [
  "ollama_models",
  "app_data",
  "searxng_data",
  "postgres",
  "pgdata",
  "mysql",
  "redis",
  "_db_",
  "_database_",
  "prometheus",
  "grafana",
]

export function isProtectedPath(absPath: string): boolean {
  const normalized = path.resolve(absPath)
  return ALWAYS_PROTECTED_PATHS.some(
    (p) => normalized === p || normalized.startsWith(p + path.sep),
  )
}

export function isProtectedVolumeName(name: string): boolean {
  const lower = name.toLowerCase()
  return PROTECTED_VOLUME_NAME_FRAGMENTS.some((frag) => lower.includes(frag))
}

let composeVolumeCache: { at: number; names: Set<string> } | null = null

export async function getComposeReferencedVolumeNames(): Promise<Set<string>> {
  const now = Date.now()
  if (composeVolumeCache && now - composeVolumeCache.at < 30_000) {
    return composeVolumeCache.names
  }
  const names = new Set<string>()
  try {
    const apps = await getDiscoveredApps()
    for (const app of apps) {
      const projectName = path.basename(path.dirname(app.composeFile))
      for (const svc of app.services) {
        for (const vol of svc.volumes) {
          const head = String(vol).split(":")[0]
          if (!head) continue
          if (head.startsWith("/") || head.startsWith(".") || head.startsWith("~")) continue
          names.add(head)
          names.add(`${projectName}_${head}`)
        }
      }
    }
  } catch {
    // best-effort: if discovery fails, return whatever we have
  }
  composeVolumeCache = { at: now, names }
  return names
}

export function isUnderAppsBasePath(absPath: string): boolean {
  return path.resolve(absPath).startsWith(APPS_BASE_PATH + path.sep)
}
