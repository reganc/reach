"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  RotateCcw,
  Maximize2,
  Minimize2,
  ClipboardPaste,
  Copy,
  Keyboard,
  Check,
  AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  clipboardActionFor,
  copyText,
  decodeOsc52,
  describeCopy,
  isMac,
  readClipboard,
} from "@/lib/terminal/clipboard"

type Status = "connecting" | "connected" | "disconnected" | "exited"

interface Notice {
  id: number
  text: string
  tone: "ok" | "warn"
}

const PASTE_KEY = isMac ? "⌘V" : "Ctrl+V"
const COPY_KEY = isMac ? "⌘C" : "Ctrl+Shift+C"

const SHORTCUTS: { label: string; keys: string[] }[] = [
  { label: "Copy", keys: ["Drag to select — copies on release", `${COPY_KEY} or right-click a selection`] },
  { label: "Paste", keys: [`${PASTE_KEY}${isMac ? "" : " or Ctrl+Shift+V"}`, "Right-click or middle-click"] },
  { label: "Word / line", keys: ["Double-click / triple-click copies it"] },
  { label: "Inside vim, htop…", keys: [`Hold ${isMac ? "⌥" : "Shift"} while dragging, then ${COPY_KEY}`] },
  { label: "Scrollback", keys: ["Mouse wheel · type or paste to jump back"] },
]

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
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [status, setStatus] = useState<Status>("connecting")
  const [restored, setRestored] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [hasSelection, setHasSelection] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const flash = useCallback((text: string, tone: Notice["tone"] = "ok") => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice({ id: Date.now(), text, tone })
    noticeTimer.current = setTimeout(() => setNotice(null), tone === "ok" ? 1800 : 4500)
  }, [])

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
  }, [])

  /** Copy xterm's own selection (Shift+drag), with feedback. */
  const copySelection = useCallback(async () => {
    const term = termRef.current
    if (!term) return
    const text = term.getSelection()
    if (!text) {
      flash("Nothing selected — drag across text to copy it", "warn")
    } else if (await copyText(text)) {
      flash(describeCopy(text))
    } else {
      flash("Browser blocked the clipboard", "warn")
    }
    term.focus()
  }, [flash])

  /** Explicit paste affordances — needs clipboard-read permission. */
  const pasteClipboard = useCallback(async () => {
    const term = termRef.current
    if (!term) return
    const text = await readClipboard()
    term.focus()
    if (text === null) {
      flash(`Clipboard access blocked — press ${PASTE_KEY} instead`, "warn")
    } else if (text) {
      pasteRef.current?.(text)
    }
  }, [flash])

  const connect = useCallback(() => {
    cleanupRef.current?.()
    setStatus("connecting")
    setRestored(false)
    setHasSelection(false)

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
        // ⌥+drag forces a local selection on macOS, matching Shift+drag elsewhere,
        // for when the program in the pane has captured the mouse.
        macOptionClickForcesSelection: true,
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.loadAddon(new WebLinksAddon())
      term.open(containerRef.current)
      fitAddon.fit()
      termRef.current = term

      term.onSelectionChange(() => setHasSelection(term.hasSelection()))

      term.attachCustomKeyEventHandler((e) => {
        if (e.type !== "keydown") return true
        const action = clipboardActionFor(e, term.hasSelection())
        if (action === "copy") {
          // Also swallows Ctrl+Shift+C with nothing selected, which xterm
          // would otherwise send to the shell as a surprise SIGINT.
          e.preventDefault()
          void copySelection()
          return false
        }
        if (action === "paste") {
          // Returning false without preventDefault hands the key back to the
          // browser, which fires a native paste event on xterm's textarea.
          // That path needs no clipboard permission, works on plain http, and
          // keeps xterm's bracketed-paste wrapping — so multi-line pastes land
          // in the edit buffer instead of executing line by line.
          return false
        }
        return true
      })

      // OSC 52: tmux emits copy-mode selections (drag → release, double/triple
      // click) as an OSC 52 sequence; forward the payload to the clipboard.
      // tmux clears its highlight the instant it copies, so the notice is the
      // only sign the copy happened at all.
      term.parser.registerOscHandler(52, (data) => {
        const text = decodeOsc52(data)
        if (text) {
          void copyText(text).then((ok) => {
            if (!mounted) return
            if (ok) flash(describeCopy(text))
            else flash(`Clipboard blocked — Shift+drag to select, then ${COPY_KEY}`, "warn")
            term.focus()
          })
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
        void pasteClipboard()
      }
      container.addEventListener("auxclick", onAuxClick)

      // Right-click copies a selection if there is one, otherwise pastes — the
      // Windows Terminal / PuTTY convention. tmux's own pane menu is unbound
      // server-side, and Chrome's menu offers no Paste over xterm's canvas.
      const onContextMenu = (ev: MouseEvent) => {
        ev.preventDefault()
        if (term.hasSelection()) {
          void copySelection().then(() => term.clearSelection())
        } else {
          void pasteClipboard()
        }
      }
      container.addEventListener("contextmenu", onContextMenu)

      cleanupRef.current = () => {
        mounted = false
        fitRef.current = null
        pasteRef.current = null
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
  }, [sessionId, flash, copySelection, pasteClipboard])

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

  // Esc leaves fullscreen — but only when the terminal isn't the one that
  // needs Esc (vim, readline), i.e. when focus is on the toolbar.
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (containerRef.current?.contains(document.activeElement)) return
      setExpanded(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [expanded])

  const statusColor: Record<Status, string> = {
    connecting: "bg-yellow-500 animate-pulse",
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

  const toolButton =
    "flex items-center justify-center w-7 h-7 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"

  return (
    <div
      className={cn(
        "relative rounded-b-xl rounded-tr-xl border border-border overflow-hidden flex flex-col bg-[#09090b]",
        expanded
          ? "fixed inset-4 z-50 rounded-xl shadow-2xl"
          : "h-[calc(100dvh-10.5rem)] min-h-[360px]",
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-zinc-800 bg-zinc-950 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={cn("w-2 h-2 rounded-full shrink-0", statusColor[status])} />
          <span className="text-xs text-zinc-400 truncate">
            {statusLabel[status]}
            {status === "connected" && restored && (
              <span className="text-zinc-600"> · session restored</span>
            )}
          </span>
        </div>

        <div className="flex-1 flex justify-center min-w-0" aria-live="polite">
          <AnimatePresence mode="wait">
            {notice && (
              <motion.span
                key={notice.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs truncate",
                  notice.tone === "ok"
                    ? "text-emerald-300 bg-emerald-500/10"
                    : "text-amber-300 bg-amber-500/10",
                )}
              >
                {notice.tone === "ok"
                  ? <Check className="w-3 h-3 shrink-0" />
                  : <AlertCircle className="w-3 h-3 shrink-0" />}
                <span className="truncate">{notice.text}</span>
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-0.5">
          {status === "connected" && (
            <>
              <button
                type="button"
                onClick={() => void copySelection()}
                disabled={!hasSelection}
                title={`Copy selection (${COPY_KEY})`}
                aria-label="Copy selection"
                className={cn(toolButton, "disabled:opacity-30 disabled:pointer-events-none")}
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void pasteClipboard()}
                title={`Paste (${PASTE_KEY}, or right-click)`}
                aria-label="Paste clipboard"
                className={toolButton}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {(status === "disconnected" || status === "exited") && (
            <button
              type="button"
              onClick={connect}
              title="Reconnect"
              aria-label="Reconnect"
              className={toolButton}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            title="Copy & paste shortcuts"
            aria-label="Copy and paste shortcuts"
            aria-expanded={showHelp}
            className={cn(toolButton, showHelp && "text-zinc-100 bg-zinc-800")}
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Exit fullscreen" : "Fullscreen"}
            aria-label={expanded ? "Exit fullscreen" : "Fullscreen"}
            className={toolButton}
          >
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showHelp && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-3 top-11 z-20 w-80 rounded-lg border border-zinc-800 bg-zinc-950/95 backdrop-blur p-3 shadow-2xl"
          >
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-2">
              Clipboard
            </p>
            <dl className="space-y-2">
              {SHORTCUTS.map((s) => (
                <div key={s.label} className="grid grid-cols-[5.5rem_1fr] gap-2 text-xs">
                  <dt className="text-zinc-500">{s.label}</dt>
                  <dd className="space-y-0.5 text-zinc-300">
                    {s.keys.map((k) => <div key={k}>{k}</div>)}
                  </dd>
                </div>
              ))}
            </dl>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Terminal container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 p-2"
        onClick={() => {
          setShowHelp(false)
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
