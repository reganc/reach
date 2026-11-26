import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { buildCard, type CardInputs } from "../lib/hub/card"
import { endpointOf, parseFleet } from "../lib/hub/fleet"
import { mergeLauncher, statusFor } from "../lib/hub/launcher"
import type { App } from "../lib/types"

const FLEET = `
apps:
  - {id: tax-planner, title: Tax Planner, ui: "http://127.0.0.1:8475", privacy: private}
  - {id: trading, title: Signal Trading, ui: "http://localhost:8010/dashboard", icon: ST, color: "#22c55e", blurb: Signals, privacy: home}
  - {id: homelab, title: Homelab, privacy: home}
  - {id: sneaky, title: Sneaky, ui: "javascript:alert(1)", privacy: home}
  - {id: "Bad Id", title: Bad, ui: "http://localhost:1", privacy: home}
links:
  - {id: redline, title: REDLINE, ui: "http://localhost:8060/dashboard.html", color: "red"}
  - {id: trading, title: Duplicate, ui: "http://localhost:9999"}
`

test("fleet: private apps, apps without a ui and bad entries stay off the launcher", () => {
  const tiles = parseFleet(FLEET)
  assert.deepEqual(tiles.map((t) => t.id), ["trading", "redline"])
  assert.equal(tiles[0].reports, true)
  assert.equal(tiles[1].reports, false)
  assert.equal(tiles[1].icon, "RE") // made from the title
  assert.equal(tiles[1].color, "#8b5cf6") // invalid colour replaced
  assert.deepEqual(parseFleet("apps: ["), [])
  assert.deepEqual(parseFleet(""), [])
})

test("the real fleet file parses and puts no private app on the launcher", () => {
  const file = path.join(os.homedir(), "apps", "fleet.yaml")
  if (!fs.existsSync(file)) return
  const tiles = parseFleet(fs.readFileSync(file, "utf8"))
  assert.ok(tiles.length > 0)
  assert.ok(!tiles.some((t) => t.id === "tax-planner"))
})

const stored = (name: string, url: string): App => ({
  id: name, name, url, description: null, icon: "X", color: "#000000", createdAt: new Date(0), updatedAt: new Date(0),
})

test("launcher: stored entries for an app fleet.yaml lists are folded into it", () => {
  const tiles = parseFleet(FLEET)
  const { fleet, more } = mergeLauncher(tiles, [
    stored("Old trading", "http://127.0.0.1:8010/"),
    stored("Property Manager", "http://localhost:45793/"),
  ])
  assert.deepEqual(fleet.map((a) => a.id), ["fleet:trading", "fleet:redline"])
  assert.deepEqual(more.map((a) => a.name), ["Property Manager"])
  assert.equal(endpointOf("http://localhost/x"), "localhost:80")
  assert.equal(endpointOf("not a url"), null)
})

test("launcher dots: reporting apps use the bot's level, others whether they open", () => {
  const [trading, redline] = parseFleet(FLEET)
  const levels = new Map([["trading", "alert"]])
  const alive = new Map([[redline.url, false], ["http://localhost:1/", true]])
  assert.equal(statusFor(trading, trading.url, levels, alive), "alert")
  assert.equal(statusFor(trading, trading.url, new Map(), alive), null) // no key: no dot
  assert.equal(statusFor(redline, redline.url, levels, alive), "dead")
  assert.equal(statusFor(undefined, "http://localhost:1/", levels, alive), null)
})

const calm: CardInputs = {
  diskPercent: 41.2,
  memoryPercent: 55,
  gpu: { available: true, usedVramMb: 7600, totalVramMb: 12288, temperatureC: 52 },
  containers: [{ name: "ollama", status: "Up 3 hours (healthy)" }],
  deadLinks: [],
}

test("card: a calm host is one info line", () => {
  const card = buildCard(calm, new Date("2026-11-25T12:00:00Z"))
  assert.equal(card.status, "ok")
  assert.deepEqual(card.items, [{ title: "Host fine: disk 41%, memory 55%, GPU memory 62%", severity: "info" }])
  assert.equal(card.generated_at, "2026-11-25T12:00:00.000Z")
})

test("card: pressure, restarting and unhealthy containers, dead links; worst first", () => {
  const card = buildCard({
    diskPercent: 96,
    memoryPercent: 91,
    gpu: { available: true, usedVramMb: 12100, totalVramMb: 12288, temperatureC: 88 },
    containers: [
      { name: "b", status: "Restarting (1) 5 seconds ago" },
      { name: "a", status: "Up 2 minutes (unhealthy)" },
      { name: "c", status: "Up 2 hours" },
    ],
    deadLinks: ["Spec Studio", "Comet Wiki", "LLM Terminal", "IntelDash", "Holo Shell"],
  })
  assert.equal(card.status, "alert")
  assert.equal(card.items.length, 6)
  assert.deepEqual(card.items.slice(0, 2).map((i) => i.severity), ["alert", "alert"])
  assert.ok(card.items.some((i) => i.title === "Restarting over and over: b"))
  assert.ok(card.items.some((i) => i.title === "Unhealthy: a"))
  assert.ok(card.items[0].title.startsWith("Disk 96% full"))
  assert.ok(card.items.every((i) => !i.title.includes("$") && i.title.length <= 160))
})

test("card: dead links are listed sorted and shortened; docker failure is a warning", () => {
  const dead = buildCard({ ...calm, deadLinks: ["E", "D", "C", "B", "A"] })
  assert.deepEqual(dead.items, [{ title: "5 launcher links don't open: A, B, C, D and 1 more", severity: "info", link: "http://localhost:3000/admin" }])
  const noDocker = buildCard({ ...calm, containers: null })
  assert.equal(noDocker.status, "warn")
})
