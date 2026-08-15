import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { FilesBrowser } from "@/components/files/files-browser"

export default async function FilesPage() {
  const session = await auth()
  if (!session) redirect("/login")
  if ((session.user as { role?: string }).role !== "ADMIN") redirect("/")

  return <FilesBrowser />
}
