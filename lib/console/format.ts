export function formatBytes(bytes: number, places = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(places)} ${units[i]}`
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n))
}

export function formatCost(n: number): string {
  return `$${n.toFixed(2)}`
}

export function formatRelative(iso: string): string {
  if (!iso) return "—"
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return "—"
  const diff = Date.now() - then
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}
