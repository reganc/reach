"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { RotateCcw, Maximize2, Minimize2, ClipboardPaste } from "lucide-react"
import { cn } from "@/lib/utils"

type Status = "connecting" | "connected" | "disconnected" | "exited"

/**
 * Copy to the system clipboard, falling back to execCommand for non-secure
 * contexts (this app is often reached over plain-http LAN, where
 * navigator.clipboard is unavailable).
 */
async function copyText(text: string): Promise<void> {
  if (!text) return
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    /* fall through to legacy path */
  }
  // The legacy path has to put a real, selected textarea in the document to
  // copy from, which moves focus off the terminal. That matters more than it
  // looks: tmux emits OSC 52 on every copy-mode selection, and this path runs
  // whenever the async clipboard is unavailable — including the common case of
  // an OSC 52 arriving with no user activation behind it. Leaving focus on a
  // removed textarea is what makes a subsequent Ctrl+V go nowhere, so restore
  // the previous element synchronously, before yielding.
  const previous = document.activeElement as HTMLElement | null
  const ta = document.createElement("textarea")
  ta.value = text
  ta.style.position = "fixed"
  ta.style.opacity = "0"
  document.body.appendChild(ta)
  ta.select()
  try {
    document.execCommand("copy")
  } catch {
    /* clipboard unavailable — nothing else we can do */
  }
  ta.remove()
  previous?.focus?.()
}

/**
 * Paste the system clipboard into the terminal.
 *
 * Routed through `term.paste()` rather than the socket directly so xterm still
 * wraps the text in ESC[200~/201~ when the application has bracketed paste on —
 * writing to the socket ourselves would strip that and make every line of a
 * multi-line paste execute on arrival.
 */
async function pasteFromClipboard(
  send: (text: string) => void,
  term: import("@xterm/xterm").Terminal,
): Promise<boolean> {
  try {
    if (!window.isSecureContext || !navigator.clipboard?.readText) return false
    const text = await navigator.clipboard.readText()
    if (text) send(text)
    return true
  } catch {
    // Chrome gates clipboard *reads* behind a permission prompt, so this is a
    // routine denial, not a bug. Ctrl+V still works without it: the browser
    // hands the data straight to xterm's textarea in the paste event.
    return false
  } finally {
    term.focus()
  }
}

interface Props {
  active: boolean
  /** Stable id of the server-side PTY session this terminal attaches to. */
  sessionId: string
}

export function TerminalTab({ active, sessionId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitRef = useRef<(() => void) | null>(null)
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null)
  /** Paste text into the live terminal, tagged so the server clears copy-mode. */
  const pasteRef = useRef<((text: string) => void) | null>(null)
  const [status, setStatus] = useState<Status>("connecting")
  const [restored, setRestored] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [pasteHint, setPasteHint] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const connect = useCallback(() => {
    cleanupRef.current?.()
    setStatus("connecting")
    setRestored(false)

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
      termRef.current = term

      // Ctrl+C copies when text is selected (VS Code behavior); with no
      // selection it falls through to the shell as SIGINT.
      term.attachCustomKeyEventHandler((e) => {
        if (e.type !== "keydown") return true
        if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C") && term.hasSelection()) {
          void copyText(term.getSelection()).finally(() => term.focus())
          return false
        }
        // Ctrl+Shift+V, the terminal convention. xterm has no binding of its
        // own for it, and tmux's mouse mode swallows the middle-click and
        // right-click paths, so without this the only way in is plain Ctrl+V.
        // preventDefault stops the browser also firing its own paste event,
        // which would deliver the clipboard twice.
        if (e.ctrlKey && e.shiftKey && (e.key === "v" || e.key === "V")) {
          e.preventDefault()
          void pasteFromClipboard((t) => pasteRef.current?.(t), term)
          return false
        }
        return true
      })

      // OSC 52: tmux emits copy-mode selections (mouse drag → release) as an
      // OSC 52 sequence; forward the payload to the system clipboard.
      term.parser.registerOscHandler(52, (data) => {
        const idx = data.indexOf(";")
        const b64 = idx === -1 ? data : data.slice(idx + 1)
        if (!b64 || b64 === "?") return true // clipboard reads are not supported
        try {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
          void copyText(new TextDecoder().decode(bytes)).finally(() => term.focus())
        } catch {
          /* malformed payload — ignore */
        }
        return true
      })

      fitRef.current = () => {
        try { fitAddon.fit() } catch { /* ignore during teardown */ }
      }

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
      const params = new URLSearchParams({
        sessionId,
        cols: String(term.cols),
        rows: String(term.rows),
      })
      const ws = new WebSocket(`${proto}//${window.location.host}/api/terminal/ws?${params}`)
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
          else if (msg.type === "attached") {
            setStatus("connected")
            setRestored(Boolean(msg.restored))
          }
          else if (msg.type === "exit") setStatus("exited")
          else if (msg.type === "error") setStatus("disconnected")
        } catch { /* ignore */ }
      }

      ws.onclose = () => {
        if (mounted) setStatus((s) => s === "exited" ? "exited" : "disconnected")
      }

      ws.onerror = () => {
        if (mounted) setStatus("disconnected")
      }

      // Pastes are tagged so the server can drop out of tmux copy-mode first;
      // a scroll of the wheel is enough to enter it, and there it would eat the
      // paste silently. term.paste() dispatches synchronously, so the flag only
      // has to survive that call. The capture-phase listener covers the native
      // Ctrl+V route, where xterm's own textarea handler is the event target.
      let pasting = false
      const sendPaste = (text: string) => {
        if (!text) return
        pasting = true
        try { term.paste(text) } finally { pasting = false }
      }
      pasteRef.current = sendPaste

      const onNativePaste = () => {
        pasting = true
        setTimeout(() => { pasting = false }, 0)
      }
      const container = containerRef.current!
      container.addEventListener("paste", onNativePaste, true)

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: pasting ? "paste" : "input", data }))
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

      // Middle-click paste. tmux's mouse mode consumes the middle click before
      // the browser's own paste behaviour would apply, and page JS cannot read
      // the X11 PRIMARY selection regardless — so this pastes the system
      // clipboard, which is the closest thing available to the Linux habit.
      const onAuxClick = (ev: MouseEvent) => {
        if (ev.button !== 1) return
        ev.preventDefault()
        void pasteFromClipboard(sendPaste, term)
      }
      container.addEventListener("auxclick", onAuxClick)

      // Right-click pastes, the way PuTTY and Windows Terminal do. tmux's own
      // pane menu is unbound server-side, and Chrome's menu offers no Paste
      // here because the click lands on xterm's canvas rather than an editable
      // field — so without this there is no working right-click path at all.
      const onContextMenu = (ev: MouseEvent) => {
        ev.preventDefault()
        void pasteFromClipboard(sendPaste, term)
      }
      container.addEventListener("contextmenu", onContextMenu)

      cleanupRef.current = () => {
        mounted = false
        fitRef.current = null
        container.removeEventListener("auxclick", onAuxClick)
        container.removeEventListener("contextmenu", onContextMenu)
        container.removeEventListener("paste", onNativePaste, true)
        if (termRef.current === term) termRef.current = null
        if (resizeTimer) clearTimeout(resizeTimer)
        ro.disconnect()
        ws.close()
        term.dispose()
        wsRef.current = null
      }
    }

    init()
  }, [sessionId])

  useEffect(() => {
    connect()
    return () => cleanupRef.current?.()
  }, [connect])

  // When this tab becomes visible again, re-fit and repaint. xterm renders
  // into a canvas that goes stale while the container is display:none — without
  // an explicit refresh the viewport shows blank/garbled rows until a keypress.
  useEffect(() => {
    if (!active) return
    const raf = requestAnimationFrame(() => {
      fitRef.current?.()
      const term = termRef.current
      if (term) {
        term.refresh(0, term.rows - 1)
        term.focus()
      }
    })
    return () => cancelAnimationFrame(raf)
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
          <span className="text-xs text-zinc-400">
            {statusLabel[status]}
            {status === "connected" && restored && (
              <span className="text-zinc-600"> · session restored</span>
            )}
          </span>
        </div>

        <div className="flex-1 text-center text-xs font-mono">
          {pasteHint
            ? <span className="text-amber-500/80">{pasteHint}</span>
            : <span className="text-zinc-600">bash</span>}
        </div>

        <div className="flex items-center gap-1">
          {status === "connected" && (
            <button
              onClick={async () => {
                const term = termRef.current
                if (!term) return
                const ok = await pasteFromClipboard((t) => pasteRef.current?.(t), term)
                setPasteHint(ok ? null : "Clipboard blocked — use Ctrl+V")
                if (!ok) setTimeout(() => setPasteHint(null), 4000)
              }}
              title="Paste clipboard (Ctrl+Shift+V, or right-click)"
              className="flex items-center justify-center w-6 h-6 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
            </button>
          )}
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
          // Focus via xterm's API (avoids scroll jumps from raw textarea.focus),
          // and never while a selection exists — stealing focus there would
          // clear the selection before the user can copy it.
          const term = termRef.current
          if (term && !term.hasSelection()) term.focus()
        }}
      />
    </div>
  )
}
