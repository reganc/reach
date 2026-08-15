/**
 * Tailnet identity gate for admin routes.
 *
 * Reach's admin surface is not "a dashboard" — `/console` hands out a real PTY
 * running as the host user, `/files` writes to real directories, and
 * `/api/console/apps/*` starts and stops containers. A single bcrypt password
 * is a thin thing to put in front of that, so when reach is reachable off-box
 * we require a *second, independent* factor: the request must have arrived
 * over the tailnet as a known Tailscale user.
 *
 * Tailscale Serve injects `Tailscale-User-Login` (plus -Name / -ProfilePic)
 * describing the authenticated tailnet peer, and overwrites any value the
 * client tried to send, so the header cannot be spoofed from the far side.
 *
 * Configure with `REACH_TAILNET_ADMIN_LOGINS` (comma-separated, e.g.
 * `reganc@github`). Leaving it empty disables the check entirely.
 *
 * Two callers, two runtimes: `middleware.ts` (edge — `process.env` is inlined
 * at build time, so changes need `npm run deploy`, not just a restart) and
 * `server.ts` (Node — reads the live environment). The env lookup is
 * deliberately lazy rather than module-scope: server.ts imports this before
 * `next().prepare()` has loaded `.env.local`, so reading at import time would
 * see an empty value and silently disable the gate.
 */

/** A header lookup, so this works with both `Headers` and Node's header bag. */
type HeaderLookup = (name: string) => string | undefined

function allowedLogins(): readonly string[] {
  return (process.env.REACH_TAILNET_ADMIN_LOGINS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"])

/**
 * Normalise one `X-Forwarded-For` / `X-Forwarded-Host` entry to a bare host and
 * say whether it is loopback. Entries arrive in several shapes: `127.0.0.1`,
 * `::1`, `[::1]:3000`, `localhost:3000`.
 */
function isLoopbackHost(entry: string): boolean {
  let host = entry.trim().toLowerCase()
  if (!host) return false

  if (host.startsWith("[")) {
    // Bracketed IPv6, optionally with `:port` after the closing bracket.
    const close = host.indexOf("]")
    if (close === -1) return false
    host = host.slice(1, close)
  } else {
    // A bare IPv6 address is full of colons, so only strip a `:port` when
    // there is exactly one colon and what follows it is numeric.
    const colon = host.indexOf(":")
    if (colon !== -1 && host.indexOf(":", colon + 1) === -1) {
      const port = host.slice(colon + 1)
      if (port !== "" && /^\d+$/.test(port)) host = host.slice(0, colon)
    }
  }

  return LOOPBACK_HOSTS.has(host)
}

/**
 * Whether the request reached this process directly over loopback, rather than
 * through any proxy in front of it.
 *
 * This cannot be "are the `X-Forwarded-*` headers absent?" — Next.js fills in
 * `x-forwarded-for` itself from the socket's remote address when the client did
 * not send one (`next/dist/server/base-server.js`, `req.headers['x-forwarded-for']
 * ??= originalRequest?.socket?.remoteAddress`). So by the time middleware runs,
 * the header is *always* set and a presence check rejects everything, loopback
 * included. Inspect the value instead: a direct loopback request forwards only
 * loopback addresses, while a real proxy forwards the far-side client.
 */
function isDirectLoopback(get: HeaderLookup): boolean {
  const forwardedHost = get("x-forwarded-host")
  if (forwardedHost && !forwardedHost.split(",").every(isLoopbackHost)) return false

  const forwardedFor = get("x-forwarded-for")
  // Genuinely absent: the Node path runs before Next.js normalises headers.
  if (!forwardedFor) return true
  return forwardedFor.split(",").every(isLoopbackHost)
}

/**
 * Decide whether a request carries an acceptable tailnet identity.
 *
 * - No allowlist configured → gate is off, allow.
 * - Identity present → must be on the allowlist.
 * - Identity absent, request came through a proxy → reject. Fails closed if
 *   reach is ever fronted by something that isn't Tailscale Serve — including
 *   Tailscale Funnel, which carries no tailnet identity.
 * - Identity absent, direct loopback → allow. The unit binds 127.0.0.1, so
 *   reaching it that way already means shell access on the box; there is
 *   nothing left to protect at that point.
 */
function check(get: HeaderLookup): boolean {
  const allowed = allowedLogins()
  if (allowed.length === 0) return true

  const login = get("tailscale-user-login")?.trim().toLowerCase()
  if (login) return allowed.includes(login)

  return isDirectLoopback(get)
}

/** Web `Headers` (Next.js middleware / route handlers). */
export function hasAllowedTailnetIdentity(headers: Headers): boolean {
  return check((name) => headers.get(name) ?? undefined)
}

/** Node `IncomingMessage.headers` (custom server, WebSocket upgrades). */
export function hasAllowedTailnetIdentityNode(
  headers: Record<string, string | string[] | undefined>
): boolean {
  return check((name) => {
    const value = headers[name]
    return Array.isArray(value) ? value[0] : value
  })
}
