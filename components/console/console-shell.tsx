"use client"

import { useState, useCallback, useEffect } from "react"
import {
  LayoutDashboard,
  Boxes,
  Network,
  Cpu,
  Coins,
  Trash2,
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
import { CleanupTab } from "@/components/console/cleanup-tab"
import { TerminalTab } from "@/components/console/terminal-tab"

type TabId = "overview" | "apps" | "ports" | "resources" | "tokens" | "cleanup" | "terminal"

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: "apps", label: "Apps", icon: <Boxes className="w-4 h-4" /> },
  { id: "ports", label: "Ports", icon: <Network className="w-4 h-4" /> },
  { id: "resources", label: "Resources", icon: <Cpu className="w-4 h-4" /> },
  { id: "tokens", label: "Tokens", icon: <Coins className="w-4 h-4" /> },
  { id: "cleanup", label: "Cleanup", icon: <Trash2 className="w-4 h-4" /> },
  { id: "terminal", label: "Terminal", icon: <TerminalSquare className="w-4 h-4" /> },
]

interface TerminalSession {
  id: string
  label: string
}

interface ShellState {
  sessions: TerminalSession[]
  activeSessionId: string
}

const STORAGE_KEY = "reach.console.terminals.v1"

/** UUID with a fallback for non-secure contexts (plain-http LAN access). */
function genId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  } catch {
    /* fall through to the manual generator */
  }
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function freshState(): ShellState {
  const id = genId()
  return { sessions: [{ id, label: "bash" }], activeSessionId: id }
}

/**
 * Session ids are persisted so that navigating off /console and back reconnects
 * to the same live shells (the server keeps the PTYs running). sessionStorage
 * survives client-side route changes; the server-side idle reaper handles tabs
 * that are abandoned for good.
 */
function loadState(): ShellState {
  if (typeof window === "undefined") return freshState()
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ShellState>
      if (Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
        const sessions = parsed.sessions.filter(
          (s): s is TerminalSession => typeof s?.id === "string",
        )
        if (sessions.length > 0) {
          const active = sessions.some((s) => s.id === parsed.activeSessionId)
            ? (parsed.activeSessionId as string)
            : sessions[0].id
          return { sessions, activeSessionId: active }
        }
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return freshState()
}

export function ConsoleShell() {
  const [tab, setTab] = useState<TabId>("overview")
  const [visited, setVisited] = useState<Set<TabId>>(new Set(["overview"]))
  const [{ sessions, activeSessionId }, setState] = useState<ShellState>(loadState)

  // Persist the tab strip so it can be rebuilt after navigating away and back.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions, activeSessionId }))
    } catch {
      /* storage disabled or over quota — non-fatal */
    }
  }, [sessions, activeSessionId])

  // Discover live server-side sessions this client doesn't know about (e.g. a
  // shell left running before sessionStorage was cleared) and surface them as
  // tabs. Purely additive — never prunes freshly-created local sessions.
  useEffect(() => {
    let cancelled = false
    fetch("/api/terminal/sessions")
      .then((r) => (r.ok ? r.json() : { sessions: [] }))
      .then((data: { sessions?: { id: string; alive: boolean }[] }) => {
        if (cancelled) return
        const live = (data.sessions ?? []).filter((s) => s.alive).map((s) => s.id)
        setState((prev) => {
          const known = new Set(prev.sessions.map((s) => s.id))
          const discovered = live
            .filter((id) => !known.has(id))
            .map((id) => ({ id, label: "bash" }))
          if (discovered.length === 0) return prev
          return { ...prev, sessions: [...prev.sessions, ...discovered] }
        })
      })
      .catch(() => {
        /* no server session list available — keep local tabs as-is */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const addSession = useCallback(() => {
    setState((prev) => {
      const id = genId()
      return { sessions: [...prev.sessions, { id, label: "bash" }], activeSessionId: id }
    })
  }, [])

  const setActiveSessionId = useCallback((id: string) => {
    setState((prev) => (prev.activeSessionId === id ? prev : { ...prev, activeSessionId: id }))
  }, [])

  const closeSession = useCallback(
    (id: string) => {
      let didRemove = false
      setState((prev) => {
        if (prev.sessions.length <= 1) return prev // always keep one terminal
        const next = prev.sessions.filter((s) => s.id !== id)
        if (next.length === prev.sessions.length) return prev
        didRemove = true
        let active = prev.activeSessionId
        if (active === id) {
          const idx = prev.sessions.findIndex((s) => s.id === id)
          active = next[Math.min(idx, next.length - 1)].id
        }
        return { sessions: next, activeSessionId: active }
      })
      // Closing a tab is the only explicit kill — navigation merely detaches.
      // Guarded by didRemove so we never kill the shell we kept open.
      if (didRemove) {
        void fetch("/api/terminal/kill", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: id }),
        }).catch(() => {
          /* best-effort; the idle reaper will reclaim it otherwise */
        })
      }
    },
    [],
  )

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
        {tab === "cleanup" && <CleanupTab />}

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
                <TerminalTab active={session.id === activeSessionId} sessionId={session.id} />
              </div>
            ))}
          </div>}
        </div>
      </div>
    </>
  )
}
