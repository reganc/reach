import { createServer } from "http"
import next from "next"
import { WebSocketServer, WebSocket } from "ws"
import { getToken } from "next-auth/jwt"
import type { IncomingMessage, ServerResponse } from "http"
import * as store from "./lib/terminal/session-store"

const dev = process.env.NODE_ENV !== "production"
const hostname = process.env.HOST ?? "0.0.0.0"
const port = parseInt(process.env.PORT ?? "3000", 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

/** Resolve a stable owner id for ADMIN requests, or null if not authorized. */
async function authAdmin(req: IncomingMessage): Promise<string | null> {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) return null
  const token = await getToken({ req: req as Parameters<typeof getToken>[0]["req"], secret })
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
  const server = createServer(async (req, res) => {
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
  })

  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", async (req: IncomingMessage, socket, head) => {
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

    ws.on("message", (raw: Buffer) => {
      let msg: { type?: string; data?: string; cols?: number; rows?: number }
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (msg.type === "input" && typeof msg.data === "string") {
        store.write(sessionId, owner, msg.data)
      } else if (msg.type === "resize") {
        store.resize(sessionId, owner, Number(msg.cols), Number(msg.rows))
      }
    })

    // Socket closed → detach only. The PTY keeps running so the session
    // survives navigation; an idle reaper reclaims it later if abandoned.
    ws.on("close", () => {
      store.detach(sessionId, transport)
    })
  }

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${port}`)
  })
})
