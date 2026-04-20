"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { RotateCcw, Maximize2, Minimize2 } from "lucide-react"
import { cn } from "@/lib/utils"

type Status = "connecting" | "connected" | "disconnected" | "exited"

interface Props {
  active: boolean
}

export function TerminalTab({ active }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitRef = useRef<(() => void) | null>(null)
  const [status, setStatus] = useState<Status>("connecting")
  const [expanded, setExpanded] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  const connect = useCallback(() => {
    cleanupRef.current?.()
    setStatus("connecting")

    let mounted = true
    // Set preliminary cleanup immediately so StrictMode double-invocation cancels the in-flight init
    cleanupRef.current = () => { mounted = false }

    async function init() {
      // Dynamic imports — xterm is client-only
      const [
        { Terminal },
        { FitAddon },
        { WebLinksAddon },
      ] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
      ])
      if (!mounted || !containerRef.current) return

      const term = new Terminal({
        theme: {
          background: "#09090b",
          foreground: "#e4e4e7",
          cursor: "#a1a1aa",
          cursorAccent: "#09090b",
          selectionBackground: "#3f3f46",
          black: "#18181b",
          red: "#f87171",
          green: "#4ade80",
          yellow: "#facc15",
          blue: "#60a5fa",
          magenta: "#c084fc",
          cyan: "#22d3ee",
          white: "#e4e4e7",
          brightBlack: "#3f3f46",
          brightRed: "#fca5a5",
          brightGreen: "#86efac",
          brightYellow: "#fde047",
          brightBlue: "#93c5fd",
          brightMagenta: "#d8b4fe",
          brightCyan: "#67e8f9",
          brightWhite: "#f4f4f5",
        },
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, "Courier New", monospace',
        fontSize: 13,
        lineHeight: 1.5,
        cursorBlink: true,
        cursorStyle: "block",
        scrollback: 5000,
        allowTransparency: false,
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())
      term.open(containerRef.current)
      fitAddon.fit()

      fitRef.current = () => {
        try { fitAddon.fit() } catch { /* ignore during teardown */ }
      }

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
      const ws = new WebSocket(`${proto}//${window.location.host}/api/terminal/ws`)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mounted) { ws.close(); return }
        setStatus("connected")
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }))
        term.focus()
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === "output") term.write(msg.data)
          else if (msg.type === "exit") setStatus("exited")
        } catch { /* ignore */ }
      }

      ws.onclose = () => {
        if (mounted) setStatus((s) => s === "exited" ? "exited" : "disconnected")
      }

      ws.onerror = () => {
        if (mounted) setStatus("disconnected")
      }

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }))
        }
      })

      // Debounce resize to break the fitAddon.fit() → DOM change → ResizeObserver feedback loop
      let resizeTimer: ReturnType<typeof setTimeout> | null = null
      const ro = new ResizeObserver(() => {
        if (resizeTimer) clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => {
          resizeTimer = null
          try {
            fitAddon.fit()
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }))
            }
          } catch { /* ignore during teardown */ }
        }, 50)
      })
      ro.observe(containerRef.current!)

      cleanupRef.current = () => {
        mounted = false
        fitRef.current = null
        if (resizeTimer) clearTimeout(resizeTimer)
        ro.disconnect()
        ws.close()
        term.dispose()
        wsRef.current = null
      }
    }

    init()
  }, [])

  useEffect(() => {
    connect()
    return () => cleanupRef.current?.()
  }, [connect])

  // When this tab becomes visible again, re-fit so xterm fills the container correctly
  useEffect(() => {
    if (active && fitRef.current) {
      requestAnimationFrame(() => fitRef.current?.())
    }
  }, [active])

  const statusColor: Record<Status, string> = {
    connecting: "bg-yellow-500",
    connected: "bg-emerald-500",
    disconnected: "bg-red-500",
    exited: "bg-zinc-500",
  }

  const statusLabel: Record<Status, string> = {
    connecting: "Connecting…",
    connected: "Connected",
    disconnected: "Disconnected",
    exited: "Session ended",
  }

  return (
    <div
      className={cn(
        "rounded-b-xl rounded-tr-xl border border-border overflow-hidden flex flex-col bg-[#09090b]",
        expanded && "fixed inset-4 z-50 rounded-xl shadow-2xl",
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 bg-zinc-950 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className={cn("w-2.5 h-2.5 rounded-full", statusColor[status])} />
          <span className="text-xs text-zinc-400">{statusLabel[status]}</span>
        </div>

        <div className="flex-1 text-center text-xs text-zinc-600 font-mono">bash</div>

        <div className="flex items-center gap-1">
          {(status === "disconnected" || status === "exited") && (
            <button
              onClick={connect}
              title="Reconnect"
              className="flex items-center justify-center w-6 h-6 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Exit fullscreen" : "Fullscreen"}
            className="flex items-center justify-center w-6 h-6 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Terminal container */}
      <div
        ref={containerRef}
        className="flex-1 p-2"
        style={{ minHeight: expanded ? undefined : 480 }}
        onClick={() => {
          containerRef.current?.querySelector<HTMLElement>(".xterm-helper-textarea")?.focus()
        }}
      />
    </div>
  )
}
