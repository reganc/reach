import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const apps = await prisma.app.findMany({ orderBy: { createdAt: "asc" } })
  return NextResponse.json(apps)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const { name, url, description, icon, color } = body

  if (!name?.trim() || !url?.trim()) {
    return NextResponse.json({ error: "Name and URL are required" }, { status: 400 })
  }

  const app = await prisma.app.create({
    data: {
      name: name.trim(),
      url: url.trim(),
      description: description?.trim() || null,
      icon: icon || "🚀",
      color: color || "#8b5cf6",
    },
  })

  return NextResponse.json(app, { status: 201 })
}
