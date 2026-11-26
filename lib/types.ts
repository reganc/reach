export interface App {
  id: string
  name: string
  url: string
  description: string | null
  icon: string
  color: string
  createdAt: Date
  updatedAt: Date
  status?: LauncherStatus | null
}

/** A launcher card's dot: the bot's hub level, "down", or "dead" for a link that doesn't open. */
export type LauncherStatus = "info" | "warn" | "alert" | "down" | "dead"

export interface User {
  id: string
  name: string | null
  email: string
  role: "ADMIN" | "USER"
  createdAt: Date
}

export const APP_COLORS = [
  { label: "Violet", value: "#8b5cf6" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Indigo", value: "#6366f1" },
  { label: "Cyan", value: "#06b6d4" },
  { label: "Teal", value: "#14b8a6" },
  { label: "Green", value: "#22c55e" },
  { label: "Orange", value: "#f97316" },
  { label: "Pink", value: "#ec4899" },
  { label: "Red", value: "#ef4444" },
  { label: "Yellow", value: "#eab308" },
]
