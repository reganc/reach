import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"

async function requireAdmin() {
  const session = await auth()
  if (!session || (session.user as { role: string }).role !== "ADMIN") {
    return null
  }
  return session
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const { name, url, description, icon, color } = body

  if (!name?.trim() || !url?.trim()) {
    return NextResponse.json({ error: "Name and URL are required" }, { status: 400 })
  }

  const app = await prisma.app.update({
    where: { id },
    data: {
      name: name.trim(),
      url: url.trim(),
      description: description?.trim() || null,
      icon: icon || "🚀",
      color: color || "#8b5cf6",
    },
  })

  return NextResponse.json(app)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  await prisma.app.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
