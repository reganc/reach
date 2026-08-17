"use client"

import { signOut } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Layers, LayoutGrid, Settings, LogOut, Activity, FolderUp, Compass, BarChart3, ShieldOff } from "lucide-react"
import { cn } from "@/lib/utils"

interface NavProps {
  user: {
    name?: string | null
    email?: string | null
    role?: string
  }
  /**
   * Whether this request arrived somewhere the admin surface answers — i.e. over
   * the tailnet with an approved identity, or from this box. False on the LAN and
   * the public URL, where those routes are refused.
   */
  adminSurfaceReachable: boolean
}

export default function Nav({ user, adminSurfaceReachable }: NavProps) {
  const pathname = usePathname()
  const isAdmin = user.role === "ADMIN"
  const showAdmin = isAdmin && adminSurfaceReachable

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email?.[0].toUpperCase() ?? "U"

  return (
    <aside className="w-52 shrink-0 flex flex-col border-r border-border bg-card/50 h-screen sticky top-0">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border">
        <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Layers className="w-3.5 h-3.5 text-primary" />
        </div>
        <span className="font-semibold text-sm tracking-tight">Reach</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-2 space-y-0.5">
        <NavItem
          href="/"
          icon={<LayoutGrid className="w-4 h-4" />}
          label="Apps"
          active={pathname === "/"}
        />
        {showAdmin && (
          <>
            <NavItem
              href="/portfolio"
              icon={<Compass className="w-4 h-4" />}
              label="Portfolio"
              active={pathname.startsWith("/portfolio")}
            />
            <NavItem
              href="/insights"
              icon={<BarChart3 className="w-4 h-4" />}
              label="Insights"
              active={pathname.startsWith("/insights")}
            />
            <NavItem
              href="/console"
              icon={<Activity className="w-4 h-4" />}
              label="Console"
              active={pathname.startsWith("/console")}
            />
            <NavItem
              href="/files"
              icon={<FolderUp className="w-4 h-4" />}
              label="Files"
              active={pathname.startsWith("/files")}
            />
            <NavItem
              href="/admin"
              icon={<Settings className="w-4 h-4" />}
              label="Manage"
              active={pathname.startsWith("/admin")}
            />
          </>
        )}

        {isAdmin && !adminSurfaceReachable && (
          <div className="mt-3 mx-1 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <ShieldOff className="w-3.5 h-3.5 shrink-0" />
              Admin tools hidden
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70">
              Console, Files and Manage need a Tailscale connection. Open reach on
              the tailnet to use them.
            </p>
          </div>
        )}
      </nav>

      {/* User */}
      <div className="p-2 border-t border-border">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg mb-0.5">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">
              {user.name ?? user.email}
            </p>
            {user.name && (
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}

function NavItem({
  href,
  icon,
  label,
  active,
}: {
  href: string
  icon: React.ReactNode
  label: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-colors",
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-accent"
      )}
    >
      {icon}
      {label}
    </Link>
  )
}
