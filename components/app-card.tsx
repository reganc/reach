"use client"

import { motion } from "framer-motion"
import type { App } from "@/lib/types"

interface AppCardProps {
  app: App
  onClick: (app: App) => void
}

export default function AppCard({ app, onClick }: AppCardProps) {
  return (
    <motion.button
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      onClick={() => onClick(app)}
      className="group relative w-full text-left rounded-xl border border-border bg-card p-5 hover:border-border/80 hover:shadow-lg hover:shadow-black/20 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Color accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl opacity-60 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: app.color }}
      />

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
