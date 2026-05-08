import "server-only"
import fs from "node:fs/promises"
import path from "node:path"
import type { CleanupCategory } from "./types"

const AUDIT_DIR = process.env.REACH_AUDIT_DIR ?? `${process.env.HOME ?? "/home/regan"}/.reach`
const AUDIT_FILE = path.join(AUDIT_DIR, "cleanup-audit.jsonl")

export interface AuditEntry {
  ts: string
  user: string
  category: CleanupCategory
  itemCount: number
  bytesFreed: number
  ids: string[]
  errors: string[]
}

export async function appendAudit(entry: AuditEntry): Promise<void> {
  try {
    await fs.mkdir(AUDIT_DIR, { recursive: true })
    await fs.appendFile(AUDIT_FILE, JSON.stringify(entry) + "\n", "utf8")
  } catch {
    // best-effort
  }
}

export async function readRecentAudit(limit = 50): Promise<AuditEntry[]> {
  try {
    const content = await fs.readFile(AUDIT_FILE, "utf8")
    const lines = content.split("\n").filter(Boolean)
    const entries: AuditEntry[] = []
    for (const line of lines.slice(-limit).reverse()) {
      try {
        entries.push(JSON.parse(line))
      } catch {
        // skip malformed
      }
    }
    return entries
  } catch {
    return []
  }
}
