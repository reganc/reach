import { NextResponse } from "next/server"
import { auth } from "@/auth"

export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const role = (session.user as { role?: string } | undefined)?.role
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return null
}
