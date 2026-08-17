/**
 * Rewrite a `localhost` app URL to the host the visitor is actually using.
 *
 * App cards are stored as `http://localhost:<port>` because that is what they
 * are from this box's point of view. But the card's URL is loaded by the
 * *visitor's* browser, so `localhost` means the visitor's own machine — every
 * card on the launcher is dead the moment reach is opened from another
 * computer. Swapping in the host from the current request fixes that:
 * `http://localhost:8010` becomes `http://10.0.0.49:8010` for a LAN visitor,
 * which resolves because the apps themselves bind `0.0.0.0`.
 *
 * ## Why only http origins
 *
 * A page served over https may not embed http subresources — browsers block it
 * as mixed content — with one exception: `http://localhost` is treated as a
 * potentially-trustworthy origin and allowed. So on the https origins (Tailscale
 * Serve and Funnel) rewriting would swap a URL the browser permits but cannot
 * reach for one it refuses to load at all. Neither works, and the second is
 * worse to debug, so https origins are left exactly as they were. Making the
 * embedded apps work from off-box over https needs reach to proxy them under its
 * own origin — a real feature, not a URL rewrite.
 *
 * Applied only where apps are rendered for viewing
 * (`app/(dashboard)/page.tsx`). The admin CRUD path reads `/api/apps` and must
 * keep the stored value, or editing an app would save the rewritten host.
 */

/** Hosts that mean "the machine running the browser", so worth rewriting. */
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"])

/** Strip any `:port` (and IPv6 brackets) from a Host-style header value. */
function hostnameOf(hostHeader: string): string | null {
  const value = hostHeader.split(",")[0]?.trim()
  if (!value) return null

  if (value.startsWith("[")) {
    const close = value.indexOf("]")
    return close === -1 ? null : value.slice(1, close)
  }

  const colon = value.indexOf(":")
  // Bare IPv6 (many colons) has no port to strip.
  if (colon !== -1 && value.indexOf(":", colon + 1) === -1) return value.slice(0, colon)
  return value
}

/** The origin details this rewrite depends on, read from request headers. */
export type ViewerOrigin = { host: string | null; proto: string | null }

/**
 * Read the visitor's origin from request headers.
 *
 * Prefers the forwarded values: Tailscale Serve rewrites `Host` to the backend
 * it proxies to, so `Host` alone reads `localhost:3000` for every remote
 * request. Same reasoning as `externalUrl` in `middleware.ts`.
 */
export function viewerOriginFrom(headers: Headers): ViewerOrigin {
  return {
    host: headers.get("x-forwarded-host") ?? headers.get("host"),
    proto: headers.get("x-forwarded-proto"),
  }
}

export function resolveAppUrl(rawUrl: string, origin: ViewerOrigin): string {
  // Direct LAN requests carry no forwarded proto; only a proxy asserts https.
  if ((origin.proto ?? "http").split(",")[0]?.trim() !== "http") return rawUrl
  if (!origin.host) return rawUrl

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return rawUrl
  }

  if (!LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase())) return rawUrl

  const viewerHost = hostnameOf(origin.host)
  // Nothing to gain when the viewer is on this box already.
  if (!viewerHost || LOOPBACK_HOSTNAMES.has(viewerHost.toLowerCase())) return rawUrl

  parsed.hostname = viewerHost
  return parsed.toString()
}
