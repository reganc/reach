import { test } from "node:test"
import assert from "node:assert/strict"
import { isInCidrs, parseCidrs } from "../lib/auth/lan"
import { hasAllowedTailnetIdentity, INGRESS_HEADER } from "../lib/auth/tailnet"

test("isInCidrs matches LAN peers, including dual-stack form", () => {
  const lan = parseCidrs("10.0.0.0/24")
  assert.equal(isInCidrs("10.0.0.23", lan), true)
  assert.equal(isInCidrs("::ffff:10.0.0.23", lan), true)
  assert.equal(isInCidrs("10.0.1.23", lan), false)
  assert.equal(isInCidrs("127.0.0.1", lan), false)
  assert.equal(isInCidrs("100.112.51.29", lan), false)
  assert.equal(isInCidrs("::1", lan), false)
  assert.equal(isInCidrs(undefined, lan), false)
})

test("parseCidrs skips malformed entries and handles edge masks", () => {
  assert.equal(parseCidrs("").length, 0)
  assert.equal(parseCidrs("nope, 10.0.0.0/33, 300.0.0.0/8").length, 0)
  const multi = parseCidrs(" 10.0.0.0/24 , 192.168.1.5 ")
  assert.equal(isInCidrs("192.168.1.5", multi), true)
  assert.equal(isInCidrs("192.168.1.6", multi), false)
  assert.equal(isInCidrs("8.8.8.8", parseCidrs("0.0.0.0/0")), true)
})

const withIngress = (ingress: string, extra: Record<string, string> = {}) =>
  new Headers({ [INGRESS_HEADER]: ingress, ...extra })

test("admin gate: lan allowed, public refused, trusted keeps tailnet rules", () => {
  const previous = process.env.REACH_TAILNET_ADMIN_LOGINS
  process.env.REACH_TAILNET_ADMIN_LOGINS = "reganc@github"
  try {
    assert.equal(hasAllowedTailnetIdentity(withIngress("lan")), true)
    assert.equal(hasAllowedTailnetIdentity(withIngress("public")), false)
    assert.equal(
      hasAllowedTailnetIdentity(withIngress("public", { "tailscale-user-login": "reganc@github" })),
      false
    )
    assert.equal(hasAllowedTailnetIdentity(new Headers()), false)
    assert.equal(
      hasAllowedTailnetIdentity(withIngress("trusted", { "tailscale-user-login": "reganc@github" })),
      true
    )
    assert.equal(
      hasAllowedTailnetIdentity(withIngress("trusted", { "tailscale-user-login": "someone@else" })),
      false
    )
  } finally {
    if (previous === undefined) delete process.env.REACH_TAILNET_ADMIN_LOGINS
    else process.env.REACH_TAILNET_ADMIN_LOGINS = previous
  }
})
