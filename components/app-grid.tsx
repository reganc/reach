"use client"

import { useState } from "react"
import { LayoutGrid } from "lucide-react"
import AppCard from "@/components/app-card"
import AppViewer from "@/components/app-viewer"
import type { App } from "@/lib/types"

interface AppGridProps {
  apps: App[]
}

export default function AppGrid({ apps }: AppGridProps) {
  const [activeApp, setActiveApp] = useState<App | null>(null)

  if (apps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-3">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
          <LayoutGrid className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="font-medium text-sm">No apps yet</p>
        <p className="text-sm text-muted-foreground">
          Ask an admin to add apps to this portal.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-6">
        {apps.map((app) => (
          <AppCard key={app.id} app={app} onClick={setActiveApp} />
        ))}
      </div>

      <AppViewer app={activeApp} onClose={() => setActiveApp(null)} />
    </>
  )
}
