import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth
  const role = (req.auth?.user as { role?: string })?.role
  const isApi = nextUrl.pathname.startsWith("/api/")
  const isAdminPath =
    nextUrl.pathname.startsWith("/admin") ||
    nextUrl.pathname.startsWith("/console") ||
    nextUrl.pathname.startsWith("/api/console") ||
    nextUrl.pathname.startsWith("/api/users")

  if (!isLoggedIn && nextUrl.pathname !== "/login") {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.redirect(new URL("/login", nextUrl))
  }

  if (isAdminPath && role !== "ADMIN") {
    if (isApi) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.redirect(new URL("/", nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
}
