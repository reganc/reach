/**
 * Runs once when the server starts. Keeps reach's status card for the grok
 * bot fresh (~/apps/.hub/reach.json): see lib/hub/schedule.ts.
 *
 * The import must sit inside the NEXT_RUNTIME check: Next also builds this
 * file for the edge runtime and only drops the Node-only code when the check
 * wraps it directly.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startHubCard } = await import("./lib/hub/schedule")
    startHubCard()
  }
}
