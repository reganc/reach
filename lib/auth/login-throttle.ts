/**
 * Brute-force throttle for the credentials login.
 *
 * Reach's `/login` is reachable from the public internet via Tailscale Funnel,
 * so the sign-in form is now an internet-facing password oracle. bcrypt at cost
 * 12 is roughly 250ms of work per guess, which is real but not sufficient on its
 * own against a distributed attempt that simply runs in parallel.
 *
 * ## Why a progressive delay rather than a lockout
 *
 * A hard lockout keyed on email is itself an attack: anyone on the internet
 * could lock the admin out of their own portal by spamming failures against a
 * known address. So repeated failures buy an escalating *delay* instead, capped
 * at `MAX_DELAY_MS`. The legitimate user always gets in — they just wait a few
 * seconds after a run of typos — while an attacker's guess rate collapses.
 *
 * The per-IP ceiling is the one hard stop, and it exists to bound work rather
 * than to protect an account: an IP that has failed `IP_HARD_LIMIT` times in a
 * window is refused without touching bcrypt or the database at all.
 *
 * ## What this does not do
 *
 * State is in-process and resets when the service restarts, and the per-IP key
 * comes from `X-Forwarded-For`, which a public client can set freely. Neither is
 * a hole so much as a limit: the email delay is the load-bearing control and it
 * needs no trusted client input. Anything stronger belongs in a shared store,
 * which reach does not have a use for yet.
 */

const WINDOW_MS = 15 * 60 * 1000

/** Failures tolerated before an email's attempts start being slowed down. */
const FREE_ATTEMPTS = 4

/** Delay growth: 250ms, 500ms, 1s, 2s, 4s, then pinned at the cap. */
const BASE_DELAY_MS = 250
const MAX_DELAY_MS = 8_000

/** Hard refusal threshold for a single client address, per window. */
const IP_HARD_LIMIT = 100

/**
 * Cap on tracked keys. An internet-facing endpoint can be fed unlimited
 * distinct emails and forged addresses, so the table must not grow without
 * bound; when full, the entries closest to expiry are dropped first.
 */
const MAX_TRACKED_KEYS = 10_000

type Bucket = { failures: number; resetAt: number }

const buckets = new Map<string, Bucket>()

function prune(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
  if (buckets.size <= MAX_TRACKED_KEYS) return

  // Still over budget after dropping expired entries: shed the soonest-to-reset
  // (i.e. least recently active) keys until back under the cap.
  const byExpiry = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt)
  for (const [key] of byExpiry.slice(0, buckets.size - MAX_TRACKED_KEYS)) {
    buckets.delete(key)
  }
}

function read(key: string, now: number): Bucket | undefined {
  const bucket = buckets.get(key)
  if (!bucket) return undefined
  if (bucket.resetAt <= now) {
    buckets.delete(key)
    return undefined
  }
  return bucket
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export type LoginKeys = { email: string; ip: string | null }

const emailKey = (email: string) => `email:${email.trim().toLowerCase()}`
const ipKey = (ip: string) => `ip:${ip}`

/**
 * Apply the accumulated penalty for these keys before a password is checked.
 *
 * Returns `false` when the request should be refused outright without doing any
 * further work; otherwise it resolves once the caller has waited out its delay.
 */
export async function throttleLogin({ email, ip }: LoginKeys): Promise<boolean> {
  const now = Date.now()

  if (ip) {
    const perIp = read(ipKey(ip), now)
    if (perIp && perIp.failures >= IP_HARD_LIMIT) return false
  }

  const perEmail = read(emailKey(email), now)
  const over = (perEmail?.failures ?? 0) - FREE_ATTEMPTS
  if (over > 0) {
    await sleep(Math.min(BASE_DELAY_MS * 2 ** (over - 1), MAX_DELAY_MS))
  }
  return true
}

/** Record a failed attempt against both buckets. */
export function recordLoginFailure({ email, ip }: LoginKeys) {
  const now = Date.now()
  prune(now)

  for (const key of [emailKey(email), ...(ip ? [ipKey(ip)] : [])]) {
    const bucket = read(key, now)
    if (bucket) bucket.failures += 1
    else buckets.set(key, { failures: 1, resetAt: now + WINDOW_MS })
  }
}

/**
 * Clear the email's penalty after a successful sign-in.
 *
 * The IP bucket is deliberately left alone: a shared address that has been
 * failing heavily should keep its ceiling even if one account on it succeeds.
 */
export function recordLoginSuccess({ email }: Pick<LoginKeys, "email">) {
  buckets.delete(emailKey(email))
}

/**
 * Best-effort client address for the per-IP ceiling.
 *
 * Trustworthy on the trusted socket (Tailscale Serve sets it) and forgeable on
 * the public one, which is why nothing account-critical is keyed on it.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")
  const first = forwarded?.split(",")[0]?.trim()
  return first || null
}
