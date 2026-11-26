import { endpointOf, type FleetTile } from "./fleet"
import type { App, LauncherStatus } from "@/lib/types"

/**
 * What the launcher shows: fleet.yaml's apps first, then entries an admin added
 * in reach that fleet.yaml doesn't already cover (matched by host and port, so
 * a stored `localhost:8010/dashboard` and fleet's trading app are one card).
 */
export function mergeLauncher(tiles: FleetTile[], stored: App[]): { fleet: App[]; more: App[] } {
  const covered = new Set(tiles.map((t) => endpointOf(t.url)).filter(Boolean))
  const epoch = new Date(0)
  const fleet: App[] = tiles.map((t) => ({
    id: `fleet:${t.id}`,
    name: t.title,
    url: t.url,
    description: t.blurb,
    icon: t.icon,
    color: t.color,
    createdAt: epoch,
    updatedAt: epoch,
  }))
  const more = stored.filter((a) => !covered.has(endpointOf(a.url)))
  return { fleet, more }
}

/**
 * A card's dot. Apps that report get the bot's level; launcher-only links and
 * admin-added entries get "dead" when they don't open, else nothing.
 */
export function statusFor(
  tile: FleetTile | undefined,
  url: string,
  levels: Map<string, string>,
  alive: Map<string, boolean>,
): LauncherStatus | null {
  if (tile?.reports) {
    const level = levels.get(tile.id)
    return level === "info" || level === "warn" || level === "alert" || level === "down" ? level : null
  }
  return alive.get(url) === false ? "dead" : null
}
