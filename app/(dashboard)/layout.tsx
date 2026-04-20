import { redirect } from "next/navigation"
import { auth } from "@/auth"
import Nav from "@/components/nav"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Nav user={session.user as { name?: string | null; email?: string | null; role?: string }} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
