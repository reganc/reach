import { headers } from "next/headers"
import { prisma } from "@/lib/db"
import AppGrid from "@/components/app-grid"
import { resolveAppUrl, viewerOriginFrom } from "@/lib/apps/viewer-url"
import { loadFleet } from "@/lib/hub/fleet"
import { mergeLauncher, statusFor } from "@/lib/hub/launcher"
import { probeLinks } from "@/lib/hub/probe"
import { hubLevels } from "@/lib/hub/status"
import type { App } from "@/lib/types"

export default async function DashboardPage() {
  const [tiles, stored] = await Promise.all([
    loadFleet(),
    prisma.app.findMany({ orderBy: { createdAt: "asc" } }) as Promise<App[]>,
  ])
  const { fleet, more } = mergeLauncher(tiles, stored)
  const byId = new Map(tiles.map((t) => [`fleet:${t.id}`, t]))

  // Apps that report get the bot's level; everything else is just checked to open.
  const unchecked = [...fleet.filter((a) => !byId.get(a.id)?.reports), ...more].map((a) => a.url)
  const [levels, alive] = await Promise.all([hubLevels(), probeLinks(unchecked)])

  // Cards are stored as http://localhost:<port>, which points at the visitor's
  // own machine once reach is opened from anywhere but this box. See
  // lib/apps/viewer-url.ts.
  const origin = viewerOriginFrom(await headers())
  const view = (a: App): App => ({
    ...a,
    status: statusFor(byId.get(a.id), a.url, levels, alive),
    url: resolveAppUrl(a.url, origin),
  })
  const apps = fleet.map(view)
  const extra = more.map(view)
  const total = apps.length + extra.length

  return (
    <div className="h-full">
      <div className="flex items-center justify-between px-6 h-14 border-b border-border">
        <h1 className="text-sm font-medium">Apps</h1>
        <p className="text-xs text-muted-foreground">{total} app{total !== 1 ? "s" : ""}</p>
      </div>
      <AppGrid apps={apps} more={extra} />
    </div>
  )
}
