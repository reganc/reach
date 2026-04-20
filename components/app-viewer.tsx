"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, ExternalLink, AlertTriangle, Loader2 } from "lucide-react"
import type { App } from "@/lib/types"

interface AppViewerProps {
  app: App | null
  onClose: () => void
}

export default function AppViewer({ app, onClose }: AppViewerProps) {
  const [loading, setLoading] = useState(true)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    if (app) {
      setLoading(true)
      setBlocked(false)
    }
  }, [app?.id])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return (
    <AnimatePresence>
      {app && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed inset-0 z-50 flex flex-col bg-background"
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 h-12 border-b border-border bg-card/80 backdrop-blur-sm shrink-0"
            style={{ borderTopColor: app.color }}
          >
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center text-sm border shrink-0"
              style={{
                backgroundColor: `${app.color}15`,
                borderColor: `${app.color}30`,
              }}
            >
              {app.icon}
            </div>

            <span className="text-sm font-medium flex-1 truncate">{app.name}</span>

            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              onClick={onClose}
              className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Close (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* iframe area */}
          <div className="flex-1 relative">
            {loading && !blocked && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background z-10">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading {app.name}…</p>
              </div>
            )}

            {blocked && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background z-10">
                <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-yellow-500" />
                </div>
                <div className="text-center max-w-sm">
                  <p className="font-medium mb-1">Can&apos;t embed this app</p>
                  <p className="text-sm text-muted-foreground">
                    {app.name} is blocking iframe embedding. Open it in a new
                    tab instead.
                  </p>
                </div>
                <a
                  href={app.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in new tab
                </a>
              </div>
            )}

            <iframe
              key={app.id}
              src={app.url}
              title={app.name}
              className="w-full h-full border-0"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false)
                setBlocked(true)
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
