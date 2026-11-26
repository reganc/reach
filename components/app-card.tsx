"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { App, LauncherStatus } from "@/lib/types"

const DOT: Record<LauncherStatus, { className: string; label: string }> = {
  info: { className: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]", label: "All good" },
  warn: { className: "bg-amber-400", label: "Needs a look" },
  alert: { className: "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]", label: "Needs attention" },
  down: { className: "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]", label: "Not responding" },
  dead: { className: "bg-zinc-500/70", label: "Doesn't open" },
}

interface AppCardProps {
  app: App
  onClick: (app: App) => void
}

export default function AppCard({ app, onClick }: AppCardProps) {
  const dot = app.status ? DOT[app.status] : null
  return (
    <motion.button
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      onClick={() => onClick(app)}
      className={cn(
        "group relative w-full text-left rounded-xl border border-border bg-card p-5 hover:border-border/80 hover:shadow-lg hover:shadow-black/20 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        app.status === "dead" && "opacity-55 hover:opacity-80",
      )}
      aria-label={dot ? `${app.name}: ${dot.label}` : app.name}
    >
      {/* Color accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl opacity-60 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: app.color }}
      />

      {/* Status from the bot's hub, or whether the link opens */}
      {dot && (
        <span className="absolute top-4 right-4 flex items-center gap-1.5" title={dot.label}>
          <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            {dot.label}
          </span>
          <span className={cn("w-2 h-2 rounded-full", dot.className)} />
        </span>
      )}

      {/* Icon */}
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl mb-4 border"
        style={{
          backgroundColor: `${app.color}15`,
          borderColor: `${app.color}30`,
        }}
      >
        {app.icon}
      </div>

      {/* Text */}
      <p className="font-semibold text-sm text-foreground mb-1 truncate">
        {app.name}
      </p>
      {app.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {app.description}
        </p>
      )}

      {/* Launch indicator */}
      <div
        className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium"
        style={{ color: app.color }}
      >
        Open →
      </div>
    </motion.button>
  )
}
