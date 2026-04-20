import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"

async function requireAdmin() {
  const session = await auth()
  if (!session || (session.user as { role: string }).role !== "ADMIN") return null
  return session
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const { name, email, password, role } = body

  if (!email?.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 })
  }

  const existing = await prisma.user.findFirst({
    where: { email: email.trim(), NOT: { id } },
  })
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 })
  }

  const data: Record<string, unknown> = {
    name: name?.trim() || null,
    email: email.trim(),
    role: role === "ADMIN" ? "ADMIN" : "USER",
  }

  if (password) {
    data.password = await bcrypt.hash(password, 12)
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  })

  return NextResponse.json(user)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params

  if (session.user.id === id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 })
  }

  await prisma.user.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
