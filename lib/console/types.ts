export interface PortMapping {
  hostPort: number
  containerPort: number
  protocol: string
  serviceName: string
}

export interface ServiceInfo {
  name: string
  image: string | null
  build: string | null
  ports: string[]
  volumes: string[]
}

export type DatabaseKind =
  | "sqlite"
  | "postgres"
  | "mysql"
  | "mongodb"
  | "redis"
  | "other"

export type DatabaseLocationKind = "file" | "directory" | "volume" | "unknown"

export interface DatabaseInfo {
  kind: DatabaseKind
  location: string
  locationKind: DatabaseLocationKind
  service: string | null
  volumeName: string | null
  hostPath: string | null
  // Path inside a Docker named volume (when the file lives in a volume the
  // host can't read directly). Joined with the volume mount to size the file.
  inVolumePath?: string | null
}

export interface DatabaseInfoWithSize extends DatabaseInfo {
  sizeBytes: number | null
  lastModified: string | null
  error: string | null
}

export interface AppInfo {
  id: string
  name: string
  path: string
  composeFile: string
  services: ServiceInfo[]
  ports: PortMapping[]
  tags: string[]
  databases: DatabaseInfo[]
}

export type AppStatus = "running" | "stopped" | "partial" | "unknown"

export interface AppServiceStatus {
  service: string
  state: string
  status: string
}

export interface AppRuntimeStatus {
  status: AppStatus
  running: number
  total: number
  services: AppServiceStatus[]
}

export interface AppWithStatus extends AppInfo {
  status: AppStatus
  runningCount: number
  totalCount: number
  servicesStatus: AppServiceStatus[]
  uiUrl: string | null
}

export interface SystemStats {
  cpuPercent: number
  cpuCount: number
  memoryTotal: number
  memoryUsed: number
  memoryPercent: number
  diskTotal: number
  diskUsed: number
  diskPercent: number
  loadAvg: [number, number, number]
}

export interface ContainerStats {
  containerId: string
  name: string
  image: string
  status: string
  cpuPercent: number
  memoryUsage: number
  memoryLimit: number
  memoryPercent: number
  networkRx: number
  networkTx: number
  pids: number
}

export interface GpuStats {
  available: boolean
  name?: string
  totalVramMb?: number
  usedVramMb?: number
  freeVramMb?: number
  utilizationPercent?: number
  temperatureC?: number
  powerDrawW?: number | null
}

export interface PortRow {
  hostPort: number
  apps: Array<{
    appName: string
    appId: string
    serviceName: string
    containerPort: number
    protocol: string
    composePath: string
  }>
  conflict: boolean
}

export interface TokenUsageEntry {
  timestamp: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costEstimate: number
}

export interface ModelAggregate {
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost: number
  count: number
}

export interface DayAggregate {
  date: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost: number
  count: number
}

export interface TokenUsageSummary {
  totalTokens: number
  totalCost: number
  entryCount: number
  byModel: ModelAggregate[]
  byDay: DayAggregate[]
  recentEntries: TokenUsageEntry[]
  lastModified: string | null
}

export interface ProjectAggregate {
  project: string
  sessions: number
  turns: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cost: number
  lastActive: string
}

export interface ActivityAggregate {
  activity: string
  turns: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cost: number
}

export interface TokenProjects {
  byProject: ProjectAggregate[]
  byActivity: ActivityAggregate[]
}

export const APPS_BASE_PATH =
  process.env.APPS_BASE_PATH ?? "/home/regan/apps"
export const CLAUDE_CONFIG_PATH =
  process.env.CLAUDE_CONFIG_PATH ?? `${process.env.HOME ?? "/home/regan"}/.claude`
export const CLAUDE_USAGE_FILE =
  process.env.CLAUDE_USAGE_FILE ?? `${process.env.HOME ?? "/home/regan"}/.claude_usage.jsonl`
