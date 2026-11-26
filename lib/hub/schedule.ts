import { writeHubCard } from "./write"

/** Write the card now, then every 30 minutes (the bot calls one older than 36 hours out of date). */
const EVERY_MS = 30 * 60 * 1000

export function startHubCard() {
  if (process.env.REACH_HUB_CARD === "off") return
  const g = globalThis as typeof globalThis & { __reachHubTimer?: ReturnType<typeof setInterval> }
  if (g.__reachHubTimer) return
  void writeHubCard()
  g.__reachHubTimer = setInterval(() => void writeHubCard(), EVERY_MS)
  g.__reachHubTimer.unref?.()
}
