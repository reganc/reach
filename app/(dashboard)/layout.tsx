import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/auth"
import Nav from "@/components/nav"
import { hasAllowedTailnetIdentity } from "@/lib/auth/tailnet"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")

  // The same gate middleware.ts enforces. Asking it here too means an admin
  // arriving over the LAN or the public URL simply doesn't see Console/Files/
  // Manage, instead of seeing links that bounce them back to the launcher.
  const adminSurfaceReachable = hasAllowedTailnetIdentity(await headers())

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Nav
        user={session.user as { name?: string | null; email?: string | null; role?: string }}
        adminSurfaceReachable={adminSurfaceReachable}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
