import { redirect } from "next/navigation"
import { Orbitron, Rajdhani } from "next/font/google"
import { auth } from "@/auth"
import { PortfolioShell } from "@/components/portfolio/portfolio-shell"

// Fonts for the holo design spec — loaded here so only /portfolio pays for them.
const orbitron = Orbitron({ subsets: ["latin"], weight: ["700", "900"], variable: "--font-orbitron" })
const rajdhani = Rajdhani({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-rajdhani" })

export default async function PortfolioPage() {
  const session = await auth()
  if (!session) redirect("/login")
  if ((session.user as { role?: string }).role !== "ADMIN") redirect("/")

  return (
    <div className={`${orbitron.variable} ${rajdhani.variable} holo h-full`}>
      <PortfolioShell />
    </div>
  )
}
