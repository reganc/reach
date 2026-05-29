/**
 * Persistent terminal session registry.
 *
 * The core idea: a shell must outlive any single WebSocket. Browsers attach and
 * detach — navigating away from the console, a network blip, a React remount —
 * but the shell keeps running with its scrollback intact. This is what lets a
 * `npm run dev` or a build survive the user clicking out of the console.
 *
 * Two layers of durability:
 *
 *  1. In-process map (always): a PTY + rolling scrollback that survives detach.
 *     Reattaching within the same server process replays the buffer instantly.
 *     Covers navigation, reconnects and network blips.
 *
 *  2. tmux backing (when installed): each session is a tmux session on a
 *     dedicated socket, owned by a separate systemd unit (reach-tmux.service)
 *     that lives outside this process's cgroup. The PTY we spawn is just a tmux
 *     *client*; killing this process drops the client (PTY hangup) but the tmux
 *     *server* and its sessions keep running, so shells survive a deploy /
 *     `systemctl restart reach`. After a restart we rediscover and reattach.
 *
 * If tmux is not on PATH we transparently fall back to spawning bash directly —
 * layer 1 still applies, layer 2 (restart durability) does not.
 *
 * Lifecycle:
 *   attach (socket connects)  → create-or-reattach, replay scrollback
 *   detach (socket closes)    → keep shell alive, arm idle reaper
 *   reaper (idle TTL)         → release the local PTY client (tmux session lives on)
 *   kill   (tab closed)       → terminate the shell / tmux session for good
 */
import * as pty from "node-pty"
import os from "os"
import path from "path"
import { execFile, spawnSync } from "child_process"
import { createHash } from "crypto"
import type { IPty } from "node-pty"

const MAX_BUFFER = Number(process.env.TERMINAL_SCROLLBACK_BYTES ?? 256 * 1024)
const IDLE_TTL_MS = Number(process.env.TERMINAL_IDLE_TTL_MS ?? 6 * 60 * 60 * 1000)
const MAX_SESSIONS = Number(process.env.TERMINAL_MAX_SESSIONS ?? 24)

// Dedicated tmux socket, shared with reach-tmux.service. Both run as the same
// user, so the same path resolves to the same server.
const TMUX_SOCKET =
  process.env.REACH_TMUX_SOCKET || path.join(process.env.HOME ?? os.homedir(), ".reach-tmux.sock")
const TMUX_PREFIX = "reach-"

const clampCols = (c: number) => Math.max(2, Math.min(512, Math.floor(c) || 80))
const clampRows = (r: number) => Math.max(1, Math.min(256, Math.floor(r) || 24))

/** Detect tmux once at startup; allow an explicit opt-out for debugging. */
function detectTmux(): boolean {
  if (process.env.REACH_TERMINAL_TMUX === "0") return false
  try {
    return spawnSync("tmux", ["-V"], { timeout: 3000 }).status === 0
  } catch {
    return false
  }
}

const DURABLE = detectTmux()
if (DURABLE) {
  console.log("[terminal] tmux detected — sessions persist across server restarts")
} else {
  console.warn(
    "[terminal] tmux not found — sessions persist across navigation but NOT across server restarts. " +
      "Run scripts/setup-tmux.sh to enable restart-durable terminals.",
  )
}

/** Run a tmux control command on our dedicated socket; never throws. */
function tmux(args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile("tmux", ["-S", TMUX_SOCKET, ...args], { timeout: 5000 }, (err, stdout) => {
      const code = err ? (typeof err.code === "number" ? err.code : 1) : 0
      resolve({ code, stdout: stdout?.toString() ?? "" })
    })
  })
}

// Per-process, set the dedicated server's options exactly once. Auto-starts the
// server if it isn't already running (the common case in dev; in prod the
// systemd unit has already started it, so this just re-applies options).
let optionsPromise: Promise<void> | null = null
function ensureTmuxOptions(): Promise<void> {
  if (!DURABLE) return Promise.resolve()
  if (!optionsPromise) {
    optionsPromise = tmux([
      "set", "-g", "status", "off", ";",
      "set", "-g", "window-size", "latest", ";",
      "set", "-g", "aggressive-resize", "on", ";",
      "set", "-g", "history-limit", "50000", ";",
      "set", "-g", "escape-time", "10", ";",
      "set", "-g", "default-terminal", "screen-256color", ";",
      "set", "-s", "exit-empty", "off",
    ])
      .then(() => undefined)
      .catch(() => undefined)
  }
  return optionsPromise
}

const ownerTag = (ownerId: string) => createHash("sha1").update(ownerId).digest("hex").slice(0, 12)
// Owner is encoded into the tmux session name so sessions can be rediscovered
// and re-scoped to their owner after a restart wipes the in-process map.
const tmuxName = (ownerId: string, sessionId: string) =>
  `${TMUX_PREFIX}${ownerTag(ownerId)}-${sessionId}`

async function tmuxHasSession(name: string): Promise<boolean> {
  return (await tmux(["has-session", "-t", name])).code === 0
}

/** Minimal transport contract — lets the store stay agnostic of `ws`. */
export interface Transport {
  send: (data: string) => void
  close: () => void
}

interface TermSession {
  id: string
  ownerId: string
  pty: IPty
  /** Rolling scrollback, capped at MAX_BUFFER chars, replayed on reattach. */
  buffer: string
  /** The currently attached transport, or null while detached. */
  transport: Transport | null
  cols: number
  rows: number
  createdAt: number
  detachedAt: number | null
  reaper: ReturnType<typeof setTimeout> | null
  alive: boolean
}

// Survive tsx-watch reloads / repeated imports: keep one registry per process.
const g = globalThis as unknown as { __reachTermSessions?: Map<string, TermSession> }
const sessions: Map<string, TermSession> = g.__reachTermSessions ?? (g.__reachTermSessions = new Map())

function spawnShell(tmuxSessionName: string, cols: number, rows: number): IPty {
  const cwd = process.env.HOME ?? os.homedir()
  const env = process.env as Record<string, string>
  const c = clampCols(cols)
  const r = clampRows(rows)

  if (DURABLE) {
    // `new-session -A` attaches to the named session if it exists, else creates
    // it — idempotent reattach, which is exactly what we want after a restart.
    return pty.spawn("tmux", ["-S", TMUX_SOCKET, "new-session", "-A", "-s", tmuxSessionName], {
      name: "xterm-256color",
      cols: c,
      rows: r,
      cwd,
      env,
    })
  }

  const isWin = os.platform() === "win32"
  const shell = isWin ? "powershell.exe" : (process.env.SHELL ?? "bash")
  const args = isWin ? [] : ["-l"]
  return pty.spawn(shell, args, { name: "xterm-256color", cols: c, rows: r, cwd, env })
}

function clearReaper(s: TermSession) {
  if (s.reaper) {
    clearTimeout(s.reaper)
    s.reaper = null
  }
}

/**
 * Drop our local PTY client and forget the session in this process — WITHOUT
 * destroying the tmux session. In durable mode the shell keeps running and can
 * be rediscovered/reattached; in bash mode this is equivalent to ending it.
 */
function releaseClient(s: TermSession) {
  clearReaper(s)
  if (sessions.get(s.id) === s) sessions.delete(s.id)
  try {
    s.pty.kill()
  } catch {
    /* already gone */
  }
}

/** When at capacity, free the local client detached the longest (keeps tmux session). */
function reapOldestDetached() {
  let oldest: TermSession | null = null
  for (const s of sessions.values()) {
    if (s.transport === null) {
      if (!oldest || (s.detachedAt ?? 0) < (oldest.detachedAt ?? 0)) oldest = s
    }
  }
  if (oldest) releaseClient(oldest)
}

export interface AttachOptions {
  sessionId: string
  ownerId: string
  cols: number
  rows: number
  transport: Transport
}

/**
 * Attach a transport to an existing session (replaying scrollback) or create a
 * fresh shell when unknown. Returns whether prior output was restored — either
 * from the in-process buffer or from a surviving tmux session after a restart.
 */
export async function attachOrCreate(opts: AttachOptions): Promise<{ restored: boolean }> {
  const { sessionId, ownerId, cols, rows, transport } = opts
  let session = sessions.get(sessionId)

  // Owner mismatch → treat as unknown so we never hand one user another's shell.
  if (session && session.ownerId !== ownerId) session = undefined

  let restored = false

  if (session && session.alive) {
    restored = true
    // Supersede any previous viewer of this session.
    if (session.transport && session.transport !== transport) {
      try {
        session.transport.send(JSON.stringify({ type: "detached", reason: "superseded" }))
        session.transport.close()
      } catch {
        /* ignore */
      }
    }
    clearReaper(session)
    session.detachedAt = null
  } else {
    const stale = sessions.get(sessionId)
    if (stale) clearReaper(stale)

    if (sessions.size >= MAX_SESSIONS) reapOldestDetached()
    if (sessions.size >= MAX_SESSIONS) {
      throw new Error("Too many terminal sessions open")
    }

    const name = tmuxName(ownerId, sessionId)
    if (DURABLE) {
      await ensureTmuxOptions()
      // A surviving tmux session means we're reattaching after a restart/reap.
      restored = await tmuxHasSession(name)
    }

    const ptyProcess = spawnShell(name, cols, rows)
    const created: TermSession = {
      id: sessionId,
      ownerId,
      pty: ptyProcess,
      buffer: "",
      transport: null,
      cols: clampCols(cols),
      rows: clampRows(rows),
      createdAt: Date.now(),
      detachedAt: null,
      reaper: null,
      alive: true,
    }
    sessions.set(sessionId, created)

    ptyProcess.onData((data: string) => {
      created.buffer += data
      if (created.buffer.length > MAX_BUFFER) {
        created.buffer = created.buffer.slice(created.buffer.length - MAX_BUFFER)
      }
      created.transport?.send(JSON.stringify({ type: "output", data }))
    })

    // The PTY client exiting (shell exit, tmux session killed, or a manual tmux
    // detach) ends this attachment. We never kill the tmux session here — that
    // only happens via kill().
    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      created.alive = false
      clearReaper(created)
      try {
        created.transport?.send(JSON.stringify({ type: "exit", exitCode }))
        created.transport?.close()
      } catch {
        /* ignore */
      }
      if (sessions.get(created.id) === created) sessions.delete(created.id)
    })

    session = created
  }

  // Snapshot + attach in one synchronous step so no PTY output can interleave
  // between reading the buffer and registering the live transport (no dup/loss).
  const replay = session.buffer
  session.transport = transport
  session.cols = clampCols(cols)
  session.rows = clampRows(rows)
  try {
    session.pty.resize(session.cols, session.rows)
  } catch {
    /* ignore resize failures during teardown */
  }

  transport.send(JSON.stringify({ type: "attached", sessionId, restored }))
  if (replay) transport.send(JSON.stringify({ type: "output", data: replay }))

  return { restored }
}

/** Detach a transport without killing the shell; arm the idle reaper. */
export function detach(sessionId: string, transport: Transport) {
  const s = sessions.get(sessionId)
  if (!s) return
  // A newer transport may have already superseded this one — ignore stale close.
  if (s.transport !== transport) return

  s.transport = null
  s.detachedAt = Date.now()
  clearReaper(s)

  if (IDLE_TTL_MS > 0 && s.alive) {
    s.reaper = setTimeout(() => {
      if (s.transport === null) releaseClient(s)
    }, IDLE_TTL_MS)
    s.reaper.unref?.()
  }
}

export function write(sessionId: string, ownerId: string, data: string) {
  const s = sessions.get(sessionId)
  if (s && s.ownerId === ownerId && s.alive) s.pty.write(data)
}

export function resize(sessionId: string, ownerId: string, cols: number, rows: number) {
  const s = sessions.get(sessionId)
  if (!s || s.ownerId !== ownerId || !s.alive) return
  s.cols = clampCols(cols)
  s.rows = clampRows(rows)
  try {
    s.pty.resize(s.cols, s.rows)
  } catch {
    /* ignore */
  }
}

/**
 * Terminate a session for good: drop the local client and, in durable mode,
 * kill the underlying tmux session so it doesn't linger. Works even when the
 * session only exists in tmux (e.g. a rediscovered tab after a restart).
 */
export async function kill(sessionId: string, ownerId: string): Promise<boolean> {
  const s = sessions.get(sessionId)
  let existed = false

  if (s && s.ownerId === ownerId) {
    existed = true
    clearReaper(s)
    s.alive = false
    if (sessions.get(sessionId) === s) sessions.delete(sessionId)
    try {
      s.transport?.send(JSON.stringify({ type: "exit", exitCode: 0 }))
      s.transport?.close()
    } catch {
      /* ignore */
    }
    try {
      s.pty.kill()
    } catch {
      /* already dead */
    }
  }

  if (DURABLE) {
    const { code } = await tmux(["kill-session", "-t", tmuxName(ownerId, sessionId)])
    if (code === 0) existed = true
  }

  return existed
}

export interface SessionInfo {
  id: string
  alive: boolean
  attached: boolean
  createdAt: number
}

/**
 * List the caller's sessions — both live in-process clients and, in durable
 * mode, tmux sessions that survived a restart — so the client can rebuild its
 * tab strip and reattach.
 */
export async function listFor(ownerId: string): Promise<SessionInfo[]> {
  const result = new Map<string, SessionInfo>()

  for (const s of sessions.values()) {
    if (s.ownerId === ownerId) {
      result.set(s.id, {
        id: s.id,
        alive: s.alive,
        attached: s.transport !== null,
        createdAt: s.createdAt,
      })
    }
  }

  if (DURABLE) {
    const { code, stdout } = await tmux(["list-sessions", "-F", "#{session_name}"])
    if (code === 0) {
      const prefix = `${TMUX_PREFIX}${ownerTag(ownerId)}-`
      for (const line of stdout.split("\n")) {
        const name = line.trim()
        if (!name.startsWith(prefix)) continue
        const id = name.slice(prefix.length)
        if (id && !result.has(id)) {
          result.set(id, { id, alive: true, attached: false, createdAt: 0 })
        }
      }
    }
  }

  return [...result.values()]
}
