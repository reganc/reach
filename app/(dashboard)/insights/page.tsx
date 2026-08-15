import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { InsightsShell } from "@/components/insights/insights-shell"

export default async function InsightsPage() {
  const session = await auth()
  if (!session) redirect("/login")
  if ((session.user as { role?: string }).role !== "ADMIN") redirect("/")

  return (
    <div className="mx-auto max-w-6xl p-6">
      <InsightsShell />
    </div>
  )
}
