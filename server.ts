import { createServer } from "http"
import next from "next"
import { WebSocketServer, WebSocket } from "ws"
import * as pty from "node-pty"
import os from "os"
import { getToken } from "next-auth/jwt"
import type { IncomingMessage } from "http"

const dev = process.env.NODE_ENV !== "production"
const hostname = process.env.HOST ?? "0.0.0.0"
const port = parseInt(process.env.PORT ?? "3000", 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    await handle(req, res)
  })

  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", async (req: IncomingMessage, socket, head) => {
    const pathname = new URL(req.url ?? "", `http://localhost`).pathname

    if (pathname !== "/api/terminal/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n")
      socket.destroy()
      return
    }

    const secret = process.env.NEXTAUTH_SECRET
    if (!secret) {
      socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n")
      socket.destroy()
      return
    }

    const token = await getToken({ req: req as Parameters<typeof getToken>[0]["req"], secret })

    if (!token || token.role !== "ADMIN") {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws)
    })
  })

  wss.on("connection", (ws: WebSocket) => {
    const shell = os.platform() === "win32" ? "powershell.exe" : (process.env.SHELL ?? "bash")
    const cwd = process.env.HOME ?? os.homedir()

    const ptyProcess = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd,
      env: process.env as Record<string, string>,
    })

    ptyProcess.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "output", data }))
      }
    })

    ptyProcess.onExit(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "exit" }))
        ws.close()
      }
    })

    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === "input") {
          ptyProcess.write(msg.data)
        } else if (msg.type === "resize") {
          const cols = Math.max(2, Math.min(512, msg.cols))
          const rows = Math.max(1, Math.min(256, msg.rows))
          ptyProcess.resize(cols, rows)
        }
      } catch {
        // ignore malformed messages
      }
    })

    ws.on("close", () => {
      ptyProcess.kill()
    })
  })

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${port}`)
  })
})
