import { createServer } from "http"
import next from "next"
import { WebSocketServer, WebSocket } from "ws"
import { getToken } from "next-auth/jwt"
import type { IncomingMessage, ServerResponse } from "http"
import * as store from "./lib/terminal/session-store"
import { isMouseReport, isWheelUp } from "./lib/terminal/mouse"
import {
  hasAllowedTailnetIdentityNode,
  INGRESS_HEADER,
  TAILSCALE_IDENTITY_HEADERS,
  type Ingress,
} from "./lib/auth/tailnet"

const dev = process.env.NODE_ENV !== "production"
const hostname = process.env.HOST ?? "0.0.0.0"
const port = parseInt(process.env.PORT ?? "3000", 10)

/**
 * Optional second listener for untrusted networks — the LAN, plus Tailscale
 * Funnel's proxy target for the public internet. Off unless configured, so a
 * bare `tsx server.ts` never exposes a shell endpoint by accident.
 *
 * Everything served here is identical except that the admin surface is refused:
 * see `lib/auth/tailnet.ts` for why the listening socket, rather than a
 * forwarded header, is what decides that.
 */
const publicPort = parseInt(process.env.REACH_PUBLIC_PORT ?? "0", 10)
const publicHostname = process.env.REACH_PUBLIC_HOST ?? "0.0.0.0"

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

/**
 * Label a request with the socket it arrived on, and scrub anything the client
 * sent that only a trusted proxy is allowed to assert.
 *
 * Both halves matter. The stamp is overwritten unconditionally so a client
 * cannot claim trusted ingress; the identity headers are dropped on public
 * ingress so a LAN client cannot forge `Tailscale-User-Login: reganc@github`
 * and satisfy the admin allowlist. On the trusted socket those headers are left
 * alone — they can only have come from Tailscale Serve or from something that
 * already has loopback access to this box.
 */
function stampIngress(req: IncomingMessage, ingress: Ingress) {
  req.headers[INGRESS_HEADER] = ingress
  if (ingress !== "trusted") {
    for (const header of TAILSCALE_IDENTITY_HEADERS) delete req.headers[header]
  }
}

/** Resolve a stable owner id for ADMIN requests, or null if not authorized. */
async function authAdmin(req: IncomingMessage): Promise<string | null> {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) return null
  // The terminal endpoints are served here, ahead of Next.js, so the tailnet
  // gate in middleware.ts never sees them — and a PTY is exactly what that
  // gate exists to protect. Enforce it at this choke point instead, which
  // covers the session list, kill, and the WebSocket upgrade alike. The same
  // call also rejects public ingress outright (LAN / Funnel), because
  // `stampIngress` has already labelled the request by listening socket.
  if (!hasAllowedTailnetIdentityNode(req.headers)) return null
  // Auth.js prefixes the session cookie with `__Secure-` whenever the sign-in
  // happened over https — which is every remote session, since the only remote
  // ingress is Tailscale Serve on https. `getToken` looks for the unprefixed
  // name unless told otherwise, so without this it finds no token over the
  // tailnet and every terminal request 401s while loopback keeps working.
  // Key off the cookie the client actually presents rather than a forwarded
  // proto header, so this holds regardless of what fronts the process.
  const secureCookie = (req.headers.cookie ?? "").includes("__Secure-authjs.session-token")
  const token = await getToken({
    req: req as Parameters<typeof getToken>[0]["req"],
    secret,
    secureCookie,
  })
  if (!token || token.role !== "ADMIN") return null
  // token.id is set in the jwt callback; fall back to email/sub for stability.
  return (token.id as string) ?? (token.email as string) ?? (token.sub as string) ?? "admin"
}

function endJson(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body)
  res.writeHead(status, { "content-type": "application/json" })
  res.end(data)
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let body = ""
    let tooBig = false
    req.on("data", (chunk) => {
      body += chunk
      if (body.length > 64 * 1024) {
        tooBig = true
        req.destroy()
      }
    })
    req.on("end", () => {
      if (tooBig) return resolve(null)
      try {
        resolve(JSON.parse(body || "{}"))
      } catch {
        resolve(null)
      }
    })
    req.on("error", () => resolve(null))
  })
}

const SESSION_ID_RE = /^[A-Za-z0-9-]{1,64}$/
const sanitizeId = (raw: string | null): string | null =>
  raw && SESSION_ID_RE.test(raw) ? raw : null

app.prepare().then(() => {
  const requestHandler = (ingress: Ingress) => async (
    req: IncomingMessage,
    res: ServerResponse,
  ) => {
    stampIngress(req, ingress)
    const url = new URL(req.url ?? "", "http://localhost")

    // List the caller's live terminal sessions (used to prune stale tabs).
    if (url.pathname === "/api/terminal/sessions" && req.method === "GET") {
      const owner = await authAdmin(req)
      if (!owner) return endJson(res, 401, { error: "unauthorized" })
      return endJson(res, 200, { sessions: await store.listFor(owner) })
    }

    // Explicitly terminate a session (closing a tab — never on navigation).
    if (url.pathname === "/api/terminal/kill" && req.method === "POST") {
      const owner = await authAdmin(req)
      if (!owner) return endJson(res, 401, { error: "unauthorized" })
      const body = await readJson(req)
      const sessionId = typeof body?.sessionId === "string" ? sanitizeId(body.sessionId) : null
      const ok = sessionId ? await store.kill(sessionId, owner) : false
      return endJson(res, ok ? 200 : 404, { ok })
    }

    await handle(req, res)
  }

  const server = createServer(requestHandler("trusted"))

  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", async (req: IncomingMessage, socket, head) => {
    stampIngress(req, "trusted")
    const url = new URL(req.url ?? "", "http://localhost")

    if (url.pathname !== "/api/terminal/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n")
      socket.destroy()
      return
    }

    const owner = await authAdmin(req)
    if (!owner) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
      socket.destroy()
      return
    }

    const sessionId = sanitizeId(url.searchParams.get("sessionId"))
    if (!sessionId) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n")
      socket.destroy()
      return
    }

    const cols = parseInt(url.searchParams.get("cols") ?? "80", 10)
    const rows = parseInt(url.searchParams.get("rows") ?? "24", 10)

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, owner, sessionId, cols, rows).catch(() => {
        try {
          ws.close()
        } catch {
          /* ignore */
        }
      })
    })
  })

  async function handleConnection(
    ws: WebSocket,
    owner: string,
    sessionId: string,
    cols: number,
    rows: number,
  ) {
    const transport: store.Transport = {
      send: (data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data)
      },
      close: () => {
        try {
          ws.close()
        } catch {
          /* ignore */
        }
      },
    }

    try {
      await store.attachOrCreate({ sessionId, ownerId: owner, cols, rows, transport })
    } catch (err) {
      transport.send(JSON.stringify({ type: "error", message: (err as Error).message }))
      ws.close()
      return
    }

    // The socket may have closed while we were awaiting attach — detach so the
    // freshly-created session doesn't linger attached to a dead transport.
    if (ws.readyState !== WebSocket.OPEN) {
      store.detach(sessionId, transport)
      return
    }

    // Messages are handled on a promise chain so ordering survives the one
    // async case (paste, which has to leave copy-mode before it writes).
    // Without it a keystroke sent right behind a paste could overtake it.
    let queue: Promise<void> = Promise.resolve()
    // Set once a wheel-up report reaches tmux: from then until the next real
    // keystroke the pane may be scrolled back in copy-mode, which eats typing.
    let maybeInCopyMode = false

    ws.on("message", (raw: Buffer) => {
      let msg: { type?: string; data?: string; cols?: number; rows?: number }
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      queue = queue.then(async () => {
        if (msg.type === "input" && typeof msg.data === "string") {
          if (isWheelUp(msg.data)) {
            maybeInCopyMode = true
          } else if (maybeInCopyMode && !isMouseReport(msg.data)) {
            // Typing after scrolling back should reach the shell, the way it
            // does in every other terminal, rather than vanish into copy-mode
            // commands. Only paid once per scroll, not per keystroke.
            maybeInCopyMode = false
            await store.exitCopyMode(sessionId, owner)
          }
          store.write(sessionId, owner, msg.data)
        } else if (msg.type === "paste" && typeof msg.data === "string") {
          maybeInCopyMode = false
          // A paste has to land as shell input even if a stray scroll left the
          // pane in copy-mode, where tmux would otherwise eat it silently.
          await store.exitCopyMode(sessionId, owner)
          store.write(sessionId, owner, msg.data)
        } else if (msg.type === "resize") {
          store.resize(sessionId, owner, Number(msg.cols), Number(msg.rows))
        }
      }).catch(() => { /* one bad message must not wedge the queue */ })
    })

    // Socket closed → detach only. The PTY keeps running so the session
    // survives navigation; an idle reaper reclaims it later if abandoned.
    ws.on("close", () => {
      store.detach(sessionId, transport)
    })
  }

  server.listen(port, hostname, () => {
    console.log(
      `> Ready on http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${port} (trusted ingress: on-box + Tailscale Serve)`,
    )
  })

  if (publicPort) {
    const publicServer = createServer(requestHandler("public"))

    // No terminal WebSocket here at any price. The HTTP endpoints already
    // refuse public ingress via `authAdmin`, but a PTY upgrade path is worth
    // refusing structurally rather than on a check that a later edit could
    // loosen — there is no reason for this socket to speak the protocol at all.
    publicServer.on("upgrade", (_req, socket) => {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n")
      socket.destroy()
    })

    publicServer.listen(publicPort, publicHostname, () => {
      console.log(
        `> Ready on http://${publicHostname}:${publicPort} (public ingress: LAN + Funnel, admin surface refused)`,
      )
    })
  }
})
