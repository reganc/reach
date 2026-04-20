import { prisma } from "@/lib/db"
import AppGrid from "@/components/app-grid"
import type { App } from "@/lib/types"

export default async function DashboardPage() {
  const apps = await prisma.app.findMany({ orderBy: { createdAt: "asc" } })

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
