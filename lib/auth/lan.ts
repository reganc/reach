/**
 * LAN classification for the public socket.
 *
 * The public listener (`REACH_PUBLIC_PORT`) serves two very different
 * audiences: Tailscale Funnel, which proxies the whole internet in from
 * loopback, and devices on the home LAN, which connect directly. Telling them
 * apart by the TCP peer address is sound where a header would not be — a
 * forged source address can't complete a handshake, and Funnel always arrives
 * from 127.0.0.1, never from a LAN range.
 *
 * Configure with `REACH_LAN_CIDRS` (comma-separated IPv4 CIDRs, e.g.
 * `10.0.0.0/24`). Empty means no peer is treated as LAN. Read lazily for the
 * same reason as `REACH_TAILNET_ADMIN_LOGINS`: `.env.local` is only loaded once
 * `next().prepare()` has run.
 */

function parseIpv4(address: string): number | null {
  const parts = address.split(".")
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

interface Cidr {
  readonly base: number
  readonly mask: number
}

function parseCidr(entry: string): Cidr | null {
  const [address, bitsRaw = "32"] = entry.trim().split("/")
  const base = parseIpv4(address)
  if (base === null || !/^\d{1,2}$/.test(bitsRaw)) return null
  const bits = Number(bitsRaw)
  if (bits > 32) return null
  // `>>> 0` keeps the arithmetic unsigned; a /0 mask is all zeroes.
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return { base: (base & mask) >>> 0, mask }
}

export function parseCidrs(raw: string | undefined): readonly Cidr[] {
  return (raw ?? "")
    .split(",")
    .map(parseCidr)
    .filter((cidr): cidr is Cidr => cidr !== null)
}

/** Whether a socket's `remoteAddress` falls inside any of the given ranges. */
export function isInCidrs(remoteAddress: string | undefined, cidrs: readonly Cidr[]): boolean {
  if (!remoteAddress || cidrs.length === 0) return false
  // Dual-stack sockets report IPv4 peers as `::ffff:10.0.0.5`.
  const v4 = remoteAddress.toLowerCase().startsWith("::ffff:")
    ? remoteAddress.slice(7)
    : remoteAddress
  const ip = parseIpv4(v4)
  if (ip === null) return false
  return cidrs.some(({ base, mask }) => ((ip & mask) >>> 0) === base)
}

export function isLanPeer(remoteAddress: string | undefined): boolean {
  return isInCidrs(remoteAddress, parseCidrs(process.env.REACH_LAN_CIDRS))
}
