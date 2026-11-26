"use client"

import { useState } from "react"
import { LayoutGrid } from "lucide-react"
import AppCard from "@/components/app-card"
import AppViewer from "@/components/app-viewer"
import type { App } from "@/lib/types"

interface AppGridProps {
  apps: App[]
  /** Entries added in reach that ~/apps/fleet.yaml doesn't list. */
  more?: App[]
}

const GRID = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"

export default function AppGrid({ apps, more = [] }: AppGridProps) {
  const [activeApp, setActiveApp] = useState<App | null>(null)

  if (apps.length === 0 && more.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-3">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
          <LayoutGrid className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="font-medium text-sm">No apps yet</p>
        <p className="text-sm text-muted-foreground">
          Apps are listed in ~/apps/fleet.yaml, or an admin can add one here.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="p-6 space-y-8">
        {apps.length > 0 && (
          <div className={GRID}>
            {apps.map((app) => (
              <AppCard key={app.id} app={app} onClick={setActiveApp} />
            ))}
          </div>
        )}
        {more.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-medium text-muted-foreground">
              More <span className="font-normal">· added here, not in fleet.yaml</span>
            </h2>
            <div className={GRID}>
              {more.map((app) => (
                <AppCard key={app.id} app={app} onClick={setActiveApp} />
              ))}
            </div>
          </section>
        )}
      </div>

      <AppViewer app={activeApp} onClose={() => setActiveApp(null)} />
    </>
  )
}
