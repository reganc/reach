import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/console/auth-guard"
import { ALL_CATEGORIES, CATEGORIES } from "@/lib/console/cleanup/registry"
import type { CleanupSummary, CleanupSummaryRow } from "@/lib/console/cleanup/types"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  const rows: CleanupSummaryRow[] = []
  let total = 0
  const results = await Promise.allSettled(
    ALL_CATEGORIES.map(async (cat) => {
      const def = CATEGORIES[cat]
      const scan = await def.scan()
      return { cat, label: def.label, scan }
    }),
  )
  results.forEach((r, idx) => {
    const cat = ALL_CATEGORIES[idx]
    if (r.status === "fulfilled") {
      const { label, scan } = r.value
      rows.push({
        category: cat,
        label,
        count: scan.items.length,
        totalBytes: scan.totalBytes,
        reclaimableBytes: scan.reclaimableBytes,
        error: scan.warnings && scan.warnings.length > 0 ? scan.warnings[0] : undefined,
      })
      total += scan.reclaimableBytes
    } else {
      rows.push({
        category: cat,
        label: CATEGORIES[cat].label,
        count: 0,
        totalBytes: 0,
        reclaimableBytes: 0,
        error: String(r.reason).slice(0, 200),
      })
    }
  })
  const summary: CleanupSummary = {
    rows,
    totalReclaimableBytes: total,
    scannedAt: new Date().toISOString(),
  }
  return NextResponse.json(summary)
}
