"use client"

import { useState, useCallback } from "react"
import {
  LayoutDashboard,
  Boxes,
  Network,
  Cpu,
  Coins,
  TerminalSquare,
  Plus,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { OverviewTab } from "@/components/console/overview-tab"
import { AppsTab } from "@/components/console/apps-tab"
import { PortsTab } from "@/components/console/ports-tab"
import { ResourcesTab } from "@/components/console/resources-tab"
import { TokensTab } from "@/components/console/tokens-tab"
import { TerminalTab } from "@/components/console/terminal-tab"

type TabId = "overview" | "apps" | "ports" | "resources" | "tokens" | "terminal"

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: "apps", label: "Apps", icon: <Boxes className="w-4 h-4" /> },
  { id: "ports", label: "Ports", icon: <Network className="w-4 h-4" /> },
  { id: "resources", label: "Resources", icon: <Cpu className="w-4 h-4" /> },
  { id: "tokens", label: "Tokens", icon: <Coins className="w-4 h-4" /> },
  { id: "terminal", label: "Terminal", icon: <TerminalSquare className="w-4 h-4" /> },
]

interface TerminalSession {
  id: number
  label: string
}

let sessionCounter = 1

export function ConsoleShell() {
  const [tab, setTab] = useState<TabId>("overview")
  const [visited, setVisited] = useState<Set<TabId>>(new Set(["overview"]))
  const [sessions, setSessions] = useState<TerminalSession[]>([{ id: sessionCounter, label: "bash" }])
  const [activeSessionId, setActiveSessionId] = useState<number>(sessionCounter)

  const addSession = useCallback(() => {
    sessionCounter += 1
    const id = sessionCounter
    setSessions((prev) => [...prev, { id, label: "bash" }])
    setActiveSessionId(id)
  }, [])

  const closeSession = useCallback((id: number) => {
    setSessions((prev) => {
      if (prev.length === 1) return prev
      const next = prev.filter((s) => s.id !== id)
      setActiveSessionId((current) => {
        if (current !== id) return current
        const idx = prev.findIndex((s) => s.id === id)
        return next[Math.min(idx, next.length - 1)].id
      })
      return next
    })
  }, [])

  return (
    <>
      <div className="flex items-center justify-between px-6 h-14 border-b border-border">
        <h1 className="text-sm font-medium">Console</h1>
        <p className="text-xs text-muted-foreground">Docker Compose · Resources · Tokens</p>
      </div>

      <div className="border-b border-border px-6">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setVisited((v) => new Set([...v, t.id])) }}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("p-6", tab === "terminal" && "p-4")}>
        {tab === "overview" && <OverviewTab onJump={(t) => { setTab(t); setVisited((v) => new Set([...v, t])) }} />}
        {tab === "apps" && <AppsTab />}
        {tab === "ports" && <PortsTab />}
        {tab === "resources" && <ResourcesTab />}
        {tab === "tokens" && <TokensTab />}

        {/* Terminal stays mounted once visited to preserve WebSocket sessions */}
        <div className={tab === "terminal" ? "" : "hidden"}>
          {visited.has("terminal") && <div>
            {/* Session tab strip */}
            <div className="flex items-end gap-0 mb-0">
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId
                return (
                  <div
                    key={session.id}
                    className={cn(
                      "group flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg border border-b-0 text-xs font-mono cursor-pointer transition-colors select-none",
                      isActive
                        ? "bg-[#09090b] border-border text-zinc-300 z-10"
                        : "bg-zinc-900/50 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900",
                    )}
                    onClick={() => setActiveSessionId(session.id)}
                  >
                    <TerminalSquare className="w-3 h-3 shrink-0" />
                    <span>{session.label}</span>
                    {sessions.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); closeSession(session.id) }}
                        className="ml-0.5 flex items-center justify-center w-3.5 h-3.5 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-700 transition-all"
                        title="Close session"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                )
              })}
              <button
                onClick={addSession}
                title="New terminal"
                className="flex items-center justify-center w-7 h-7 mb-0.5 ml-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Terminal instances — keep all mounted to preserve sessions */}
            {sessions.map((session) => (
              <div key={session.id} className={session.id === activeSessionId ? "" : "hidden"}>
                <TerminalTab active={session.id === activeSessionId} />
              </div>
            ))}
          </div>}
        </div>
      </div>
    </>
  )
}
