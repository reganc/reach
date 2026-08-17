import { headers } from "next/headers"
import { prisma } from "@/lib/db"
import AppGrid from "@/components/app-grid"
import { resolveAppUrl, viewerOriginFrom } from "@/lib/apps/viewer-url"
import type { App } from "@/lib/types"

export default async function DashboardPage() {
  const stored = await prisma.app.findMany({ orderBy: { createdAt: "asc" } })

  // Cards are stored as http://localhost:<port>, which points at the visitor's
  // own machine once reach is opened from anywhere but this box. See
  // lib/apps/viewer-url.ts.
  const origin = viewerOriginFrom(await headers())
  const apps = stored.map((app) => ({ ...app, url: resolveAppUrl(app.url, origin) }))

  return (
    <div className="h-full">
      <div className="flex items-center justify-between px-6 h-14 border-b border-border">
        <h1 className="text-sm font-medium">Apps</h1>
        <p className="text-xs text-muted-foreground">{apps.length} app{apps.length !== 1 ? "s" : ""}</p>
      </div>
      <AppGrid apps={apps as App[]} />
    </div>
  )
}
