import "server-only"
import {
  scanBuildCache,
  scanContainers,
  scanImages,
  scanNetworks,
  scanVolumes,
  pruneBuildCache,
  pruneContainers,
  pruneImages,
  pruneNetworks,
  pruneVolumes,
} from "./docker"
import { scanOllama, pruneOllama } from "./ollama"
import {
  scanBuildArtifacts,
  scanStrayModels,
  scanTmp,
  pruneBuildArtifacts,
  pruneStrayModels,
  pruneTmp,
} from "./filesystem"
import { scanContainerLogs, scanJournald, pruneContainerLogs, pruneJournald } from "./logs"
import { scanListeningPorts } from "./listening-ports"
import type { CategoryScan, CleanupCategory, PruneResult } from "./types"

interface CategoryDef {
  label: string
  scan: () => Promise<CategoryScan>
  prune?: (dryRun: boolean, ids?: string[]) => Promise<PruneResult>
}

export const CATEGORIES: Record<CleanupCategory, CategoryDef> = {
  "docker-build-cache": {
    label: "Docker build cache",
    scan: scanBuildCache,
    prune: (dryRun) => pruneBuildCache(dryRun),
  },
  "docker-images": {
    label: "Docker images",
    scan: scanImages,
    prune: pruneImages,
  },
  "docker-containers": {
    label: "Docker containers",
    scan: scanContainers,
    prune: pruneContainers,
  },
  "docker-volumes": {
    label: "Docker volumes",
    scan: scanVolumes,
    prune: pruneVolumes,
  },
  "docker-networks": {
    label: "Docker networks",
    scan: scanNetworks,
    prune: pruneNetworks,
  },
  "ollama-models": {
    label: "Ollama models",
    scan: scanOllama,
    prune: pruneOllama,
  },
  "stray-models": {
    label: "Stray model files",
    scan: scanStrayModels,
    prune: pruneStrayModels,
  },
  "build-artifacts": {
    label: "Build artifacts",
    scan: scanBuildArtifacts,
    prune: pruneBuildArtifacts,
  },
  "container-logs": {
    label: "Container logs",
    scan: scanContainerLogs,
    prune: pruneContainerLogs,
  },
  journald: {
    label: "Systemd journal",
    scan: scanJournald,
    prune: (dryRun) => pruneJournald(dryRun),
  },
  "tmp-files": {
    label: "/tmp files (>7d)",
    scan: scanTmp,
    prune: pruneTmp,
  },
  "listening-ports": {
    label: "Listening ports",
    scan: scanListeningPorts,
    // Read-only: stopping a process is the existing apps-tab's job.
  },
}

export const ALL_CATEGORIES = Object.keys(CATEGORIES) as CleanupCategory[]

export function isCleanupCategory(s: string): s is CleanupCategory {
  return s in CATEGORIES
}
