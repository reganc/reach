import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"

async function requireAdmin() {
  const session = await auth()
  if (!session || (session.user as { role: string }).role !== "ADMIN") return null
  return session
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(users)
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const { name, email, password, role } = body

  if (!email?.trim() || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email: email.trim() } })
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 })
  }

  const hashed = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: {
      name: name?.trim() || null,
      email: email.trim(),
      password: hashed,
      role: role === "ADMIN" ? "ADMIN" : "USER",
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  })

  return NextResponse.json(user, { status: 201 })
}
