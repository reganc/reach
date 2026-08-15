import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { hasAllowedTailnetIdentity } from "@/lib/auth/tailnet"

/** First entry of a possibly comma-joined forwarded header. */
function firstHop(value: string | null): string | undefined {
  const first = value?.split(",")[0]?.trim()
  return first || undefined
}

/**
 * Build a redirect target against the origin the *client* used.
 *
 * Tailscale Serve rewrites `Host` to the backend it proxies to, so `nextUrl`
 * reads `localhost:3000` for every remote request. Redirecting to that sends a
 * remote browser to an address that only resolves on this box — the sign-in
 * bounce would dead-end before anyone could log in. Prefer the forwarded
 * origin, and fall back to `nextUrl` for direct loopback requests.
 */
function externalUrl(path: string, req: { nextUrl: URL; headers: Headers }): URL {
  const url = new URL(path, req.nextUrl)
  const host = firstHop(req.headers.get("x-forwarded-host"))
  if (host) {
    url.host = host
    const proto = firstHop(req.headers.get("x-forwarded-proto"))
    if (proto) url.protocol = proto
  }
  return url
}

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth
  const role = (req.auth?.user as { role?: string })?.role
  const isApi = nextUrl.pathname.startsWith("/api/")
  const isAdminPath =
    nextUrl.pathname.startsWith("/admin") ||
    nextUrl.pathname.startsWith("/console") ||
    nextUrl.pathname.startsWith("/insights") ||
    nextUrl.pathname.startsWith("/files") ||
    nextUrl.pathname.startsWith("/portfolio") ||
    nextUrl.pathname.startsWith("/api/console") ||
    nextUrl.pathname.startsWith("/api/files") ||
    nextUrl.pathname.startsWith("/api/projects") ||
    nextUrl.pathname.startsWith("/api/users")

  if (!isLoggedIn && nextUrl.pathname !== "/login") {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.redirect(externalUrl("/login", req))
  }

  if (isAdminPath && role !== "ADMIN") {
    if (isApi) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.redirect(externalUrl("/", req))
  }

  // Second factor for the admin surface: a leaked reach password alone must
  // not be enough to reach a shell from off-box. See lib/auth/tailnet.ts.
  if (isAdminPath && !hasAllowedTailnetIdentity(req.headers)) {
    if (isApi) {
      return NextResponse.json(
        { error: "Forbidden: admin access requires an approved tailnet identity" },
        { status: 403 }
      )
    }
    return NextResponse.redirect(externalUrl("/", req))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
}
