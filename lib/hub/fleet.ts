import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import yaml from "js-yaml"

/**
 * The launcher's app list, read from ~/apps/fleet.yaml — the same list the grok
 * bot's hub uses (see ~/apps/HUB.md). Apps are added there, not in reach's
 * database, so the launcher and the bot never disagree about what exists.
 *
 * `apps` are the ones that report status; `links` are launcher-only. Private
 * apps (tax, money, health) are never put on the launcher: reach's login page
 * is on the public internet.
 */
export const FLEET_FILE = process.env.FLEET_FILE ?? path.join(os.homedir(), "apps", "fleet.yaml")

export type FleetTile = {
  id: string
  title: string
  url: string
  icon: string
  color: string
  blurb: string | null
  reports: boolean // listed under `apps`, so the bot has a status for it
}

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/
const COLOR = /^#[0-9a-fA-F]{6}$/
const DEFAULT_COLOR = "#8b5cf6"

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null

function webUrl(v: unknown): string | null {
  if (typeof v !== "string") return null
  try {
    const u = new URL(v)
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}

function initials(title: string): string {
  const words = title.split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words.map((w) => w[0]).join("") : title).slice(0, 2).toUpperCase()
}

function tile(entry: unknown, reports: boolean): FleetTile | null {
  if (!entry || typeof entry !== "object") return null
  const e = entry as Record<string, unknown>
  const id = typeof e.id === "string" && ID.test(e.id) ? e.id : null
  const url = webUrl(e.ui)
  if (!id || !url || e.privacy === "private") return null
  const title = text(e.title, 40) ?? id
  return {
    id,
    title,
    url,
    icon: text(e.icon, 4) ?? initials(title),
    color: typeof e.color === "string" && COLOR.test(e.color) ? e.color : DEFAULT_COLOR,
    blurb: text(e.blurb, 120),
    reports,
  }
}

/** Tiles from fleet.yaml's text. Entries without a valid id or ui, and private apps, are left out. */
export function parseFleet(source: string): FleetTile[] {
  let doc: unknown
  try {
    doc = yaml.load(source)
  } catch {
    return []
  }
  if (!doc || typeof doc !== "object") return []
  const d = doc as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? v : [])
  const tiles = [
    ...list(d.apps).map((e) => tile(e, true)),
    ...list(d.links).map((e) => tile(e, false)),
  ].filter((t): t is FleetTile => t !== null)
  const seen = new Set<string>()
  return tiles.filter((t) => !seen.has(t.id) && seen.add(t.id))
}

export async function loadFleet(file = FLEET_FILE): Promise<FleetTile[]> {
  try {
    return parseFleet(await fs.readFile(file, "utf8"))
  } catch {
    return []
  }
}

/** host:port of a URL, used to match launcher entries that point at the same app. */
export function endpointOf(url: string): string | null {
  try {
    const u = new URL(url)
    const host = ["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"].includes(u.hostname) ? "localhost" : u.hostname
    return `${host}:${u.port || (u.protocol === "https:" ? "443" : "80")}`
  } catch {
    return null
  }
}
