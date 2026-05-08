import "server-only"
import { runCommand } from "../exec"
import type { CategoryScan, CleanupItem } from "./types"

interface SocketStat {
  port: number
  pid: number | null
  command: string | null
  proto: "tcp" | "tcp6"
}

// Listening ports tab is informational — listening is rarely "deletable" in
// the cleanup sense. We surface ports + owning process so the user can decide
// whether to stop a stale dev server they forgot about.

export async function scanListeningPorts(): Promise<CategoryScan> {
  const items: CleanupItem[] = []
  const sockets = await getListeningSockets()
  const dockerPorts = await getDockerExposedHostPorts()
  for (const s of sockets) {
    const ownedByDocker = dockerPorts.has(s.port)
    items.push({
      id: `${s.proto}:${s.port}:${s.pid ?? "?"}`,
      category: "listening-ports",
      label: `:${s.port}`,
      detail: ownedByDocker
        ? `${s.command ?? "?"} (docker-proxy)`
        : `${s.command ?? "?"} (PID ${s.pid ?? "?"})`,
      bytes: 0,
      inUseBy: ownedByDocker ? ["docker-proxy"] : s.command ? [s.command] : [],
      protected: ownedByDocker,
      meta: { protocol: s.proto, port: s.port },
    })
  }
  items.sort((a, b) => Number(a.meta?.port ?? 0) - Number(b.meta?.port ?? 0))
  return {
    category: "listening-ports",
    items,
    totalBytes: 0,
    reclaimableBytes: 0,
    scannedAt: new Date().toISOString(),
  }
}

async function getListeningSockets(): Promise<SocketStat[]> {
  const out: SocketStat[] = []
  const res = await runCommand("ss", ["-tlnpH"], { timeoutMs: 10_000 })
  if (res.code !== 0) return out
  for (const line of res.stdout.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // ss output: "LISTEN 0  4096  *:8030  *:*  users:((\"node\",pid=12345,fd=18))"
    const parts = trimmed.split(/\s+/)
    if (parts.length < 5) continue
    const localAddr = parts[3] ?? ""
    const portStr = localAddr.split(":").pop() ?? ""
    const port = Number(portStr)
    if (!Number.isFinite(port)) continue
    const userPart = trimmed.split("users:")[1]
    let pid: number | null = null
    let command: string | null = null
    if (userPart) {
      const m = userPart.match(/\("([^"]+)",pid=(\d+)/)
      if (m) {
        command = m[1]
        pid = Number(m[2])
      }
    }
    const proto: "tcp" | "tcp6" = localAddr.includes("[") ? "tcp6" : "tcp"
    out.push({ port, pid, command, proto })
  }
  return out
}

async function getDockerExposedHostPorts(): Promise<Set<number>> {
  const ports = new Set<number>()
  const res = await runCommand("docker", ["ps", "--format", "{{.Ports}}"], { timeoutMs: 10_000 })
  if (res.code !== 0) return ports
  for (const line of res.stdout.split("\n")) {
    // 0.0.0.0:8030->8030/tcp, :::8030->8030/tcp
    for (const m of line.matchAll(/:(\d+)->/g)) {
      const p = Number(m[1])
      if (Number.isFinite(p)) ports.add(p)
    }
  }
  return ports
}
