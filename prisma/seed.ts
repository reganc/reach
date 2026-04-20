import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { readFileSync } from "fs"
import { resolve } from "path"

// tsx doesn't load .env.local — parse it manually
try {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8")
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
    }
  }
} catch {
  // no .env.local, rely on existing env
}

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  const name = process.env.ADMIN_NAME ?? "Admin"

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env.local")
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`Admin user already exists: ${email}`)
    return
  }

  const hashed = await bcrypt.hash(password, 12)
  await prisma.user.create({
    data: { email, password: hashed, name, role: "ADMIN" },
  })

  console.log(`Admin user created: ${email}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
