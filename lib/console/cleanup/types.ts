export type CleanupCategory =
  | "docker-build-cache"
  | "docker-images"
  | "docker-containers"
  | "docker-volumes"
  | "docker-networks"
  | "ollama-models"
  | "stray-models"
  | "build-artifacts"
  | "container-logs"
  | "journald"
  | "tmp-files"
  | "listening-ports"

export interface CleanupItem {
  id: string
  category: CleanupCategory
  label: string
  detail?: string
  path?: string
  bytes: number
  ageMs?: number
  inUseBy?: string[]
  protected?: boolean
  meta?: Record<string, string | number | boolean>
}

export interface CategoryScan {
  category: CleanupCategory
  items: CleanupItem[]
  totalBytes: number
  reclaimableBytes: number
  scannedAt: string
  warnings?: string[]
}

export interface PruneRequest {
  confirm?: boolean
  ids?: string[]
}

export interface PruneResult {
  category: CleanupCategory
  dryRun: boolean
  preview: CleanupItem[]
  executed?: { id: string; ok: boolean; error?: string; bytesFreed: number }[]
  totalBytes: number
  bytesFreed: number
}

export interface CleanupSummaryRow {
  category: CleanupCategory
  label: string
  count: number
  totalBytes: number
  reclaimableBytes: number
  error?: string
}

export interface CleanupSummary {
  rows: CleanupSummaryRow[]
  totalReclaimableBytes: number
  scannedAt: string
}
