"use client"

import { signOut } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Layers, LayoutGrid, Settings, LogOut, Activity } from "lucide-react"
import { cn } from "@/lib/utils"

interface NavProps {
  user: {
    name?: string | null
    email?: string | null
    role?: string
  }
}

export default function Nav({ user }: NavProps) {
  const pathname = usePathname()
  const isAdmin = user.role === "ADMIN"

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
        {isAdmin && (
          <>
            <NavItem
              href="/console"
              icon={<Activity className="w-4 h-4" />}
              label="Console"
              active={pathname.startsWith("/console")}
            />
            <NavItem
              href="/admin"
              icon={<Settings className="w-4 h-4" />}
              label="Manage"
              active={pathname.startsWith("/admin")}
            />
          </>
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
