import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { ConsoleShell } from "@/components/console/console-shell"

export default async function ConsolePage() {
  const session = await auth()
  if (!session) redirect("/login")
  if ((session.user as { role?: string }).role !== "ADMIN") redirect("/")

  return <ConsoleShell />
}
