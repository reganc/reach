import "server-only"
import { getDiscoveredApps } from "./apps"
import { PortRow } from "./types"

export async function getPortRows(): Promise<PortRow[]> {
  const apps = await getDiscoveredApps()
  const map = new Map<number, PortRow["apps"]>()
  for (const app of apps) {
    for (const p of app.ports) {
      const arr = map.get(p.hostPort) ?? []
      arr.push({
        appName: app.name,
        appId: app.id,
        serviceName: p.serviceName,
        containerPort: p.containerPort,
        protocol: p.protocol,
        composePath: app.composeFile,
      })
      map.set(p.hostPort, arr)
    }
  }
  const rows: PortRow[] = []
  for (const [hostPort, ownerApps] of map.entries()) {
    rows.push({ hostPort, apps: ownerApps, conflict: ownerApps.length > 1 })
  }
  rows.sort((a, b) => a.hostPort - b.hostPort)
  return rows
}
