# REVIEW.md

A living, append-only record of this app's significant decisions — not a
changelog (that's git log) and not a checklist (that's
`~/.claude/rules/common/code-review.md`, run per-PR). This file exists so a
decision can be traced back to *why*, not just *what*, without spelunking
through commit history or a chat transcript that's since scrolled away.

## What earns an entry

- An LLM call site was added, removed, or its pattern changed (single-shot →
  reflection loop, sync → async, escalation tier changed).
- A boundary rule was added, tightened, or — rare, flag it loudly — relaxed.
- A finding from a review (security, architecture, agentic-pattern) that
  changed something, or that was considered and explicitly rejected.
- Anything a future engineer (or you, in six months) would otherwise have to
  reconstruct from git blame.

Routine bug fixes, refactors, and dependency bumps don't belong here — this
is for decisions, not activity.

## Format

Newest entry on top. Each entry:

```
## YYYY-MM-DD — [one-line summary]

**Context:** [what prompted this — a failure mode, a review finding, a new
requirement]

**Decision:** [what was decided]

**Why:** [the reasoning — especially why NOT the alternative, if one was
considered]

**Evidence:** [test names, file:line, benchmark numbers — whatever grounds
this beyond opinion]
```

---

## 2026-08-17 — Ingress class, not forwarded headers, decides admin access

**Context:** Reach was loopback-only, published to the tailnet through
Tailscale Serve on :8444. The requirement changed: it now has to be reachable
from the public internet *and* from other machines on the LAN. Both of those
mean binding a non-loopback interface, which quietly invalidated the existing
admin gate — `isDirectLoopback` in `lib/auth/tailnet.ts` inferred "this request
came from on-box" from `X-Forwarded-For` / `X-Forwarded-Host` being all
loopback, and any LAN client can simply send `X-Forwarded-For: 127.0.0.1`. On a
loopback-only bind that was sound (sending it required already having loopback
access); one bind-address change from being a full admin bypass.

**Decision:** Reach now opens two sockets and the socket *is* the trust
boundary. `127.0.0.1:$PORT` is trusted ingress (on-box + Tailscale Serve);
`$REACH_PUBLIC_HOST:$REACH_PUBLIC_PORT` is public ingress (LAN + Funnel).
`server.ts::stampIngress` writes `x-reach-ingress` from the listening socket,
unconditionally overwriting any client value, and strips `Tailscale-User-*` on
public ingress so the identity headers can't be forged either. `check()` in
`lib/auth/tailnet.ts` refuses non-trusted ingress *before* consulting the
allowlist, so an empty `REACH_TAILNET_ADMIN_LOGINS` can no longer hand a shell
to the internet. The public listener also refuses WebSocket upgrades outright
rather than relying on the auth check. Funnel points at the public port; Serve
:8444 still points at the trusted one.

**Why:** The alternative was to keep header inference and harden it (trust
`X-Forwarded-*` only from a configured proxy list). That reintroduces the same
class of bug — it depends on getting a trust-list right and on Tailscale's
header behavior staying put — whereas a listening socket cannot be influenced
by the far side at all. Cost is one extra `createServer` and an env var.

`isDirectLoopback` was kept, not deleted, as defence in depth: Funnel and Serve
both proxy from loopback, so if Funnel is ever misconfigured to target the
trusted port, the ingress stamp alone would read as on-box. Documented as a
config invariant in `scripts/reach.service` and CLAUDE.md.

**Boundary rule:** unchanged in substance and tightened in reach — the PTY,
file writes, and container start/stop remain human-triggered and now
additionally unreachable from any untrusted network, whatever the allowlist
says. Exposing `/login` to the internet is the one genuine loosening; it's
compensated in `lib/auth/login-throttle.ts` (progressive per-email delay, per-IP
ceiling) and a decoy-hash compare in `auth.ts` for absent accounts.
Deliberately *not* a lockout: a hard lock keyed on email would let any
internet stranger lock the admin out of their own portal.

**Evidence:** verified against the running service after `npm run deploy`.
Authenticated as ADMIN over the LAN (`http://10.0.0.49:3199`): `/` 200,
`/console` `/files` `/admin` `/insights` all 307 → `/`,
`/api/console/resources/summary` 403, `/api/terminal/sessions` 401 — and still
401 when replaying the request with forged `X-Reach-Ingress: trusted` +
`X-Forwarded-For: 127.0.0.1` + `Tailscale-User-Login: reganc@github`. Same
credentials over both trusted paths (`http://127.0.0.1:3000` and
`https://comet.taild00e4a.ts.net:8444`): all five probes 200. Throttle: 8
consecutive failures on one email measured 0.19s ×4 then 0.22 / 0.44 / 0.69 /
1.19s, and the ~0.19s floor on a nonexistent account confirms the decoy compare
runs.

**Known gap:** throttle state is per-process and resets on restart, and the
per-IP key comes from a client-settable header on public ingress. The per-email
delay needs no trusted input and is the load-bearing control; a shared store
isn't warranted for a single-process app.

**Follow-on fix — `middleware.ts::externalUrl` inherited a phantom port.**
Publishing over Funnel surfaced a latent bug: the function assigned
`url.host = <x-forwarded-host>`, and per the URL spec the `host` setter only
updates the port when the assigned value contains one. Every previously-used
origin carried an explicit port (`10.0.0.49:3199`, `…ts.net:8444`) so it worked;
Funnel on implicit 443 does not, and every redirect resolved to
`https://comet.taild00e4a.ts.net:3000/…` — a dead end for any browser arriving
at the public URL, including the unauthenticated bounce to `/login`. Fixed by
clearing `url.port` before assigning the host. Verified: `GET /` over the public
ingress IP now returns `307 → https://comet.taild00e4a.ts.net/login`.

**Full ingress matrix, verified against the deployed service** (admin
credentials, probing `/`, `/console`, `/files`, `/admin`,
`/api/console/resources/summary`, `/api/terminal/sessions`):

| Path | `/` | admin routes | console API | terminal API |
|---|---|---|---|---|
| internet `https://comet.taild00e4a.ts.net` (via public ingress IP 199.38.181.54, not MagicDNS) | 200 | 307 → `/` | 403 | 401 |
| LAN `http://10.0.0.49:3199` | 200 | 307 → `/` | 403 | 401 |
| tailnet `https://comet.taild00e4a.ts.net:8444` | 200 | 200 | 200 | 200 |
| on-box `http://127.0.0.1:3000` | 200 | 200 | 200 | 200 |

Also confirmed over the public path: valid TLS (`ssl_verify_result 0`),
`__Secure-authjs.session-token` cookie prefix, `/_next/static` chunks 200, and
`<title>Reach</title>` (i.e. reach, not the LLM gateway, owns 443 now).

---

## 2026-07-23 — Adopted the agentic-patterns standard; no call-site changes made

**Context:** Retrofitting the agentic-patterns CLAUDE.md/REVIEW.md standard
onto this app via `/new-agentic-app`.

**Decision:** Documented the one existing LLM call site
(`lib/insights/summaries.ts::summarizeApp`) in CLAUDE.md's new "LLM call
sites" section. No reflection/critique loop added.

**Why:** The call site produces a short, cached, admin-visible descriptive
summary of another app derived from its own docs — not a citation-based
claim system with facts to check. Per the decision framework, reflection
pays off most when there's a deterministic check to build it on; there isn't
one here beyond "did valid JSON come back." Content-hash caching already
bounds how often this runs and limits the blast radius of one bad summary.
The gap (no check that the summary doesn't overstate what the source docs
actually say) is flagged in CLAUDE.md, not fixed — low practical risk today
given the output is short and admin-reviewable.

**Evidence:** code review of `lib/insights/summaries.ts` and its call site
(`app/api/console/insights/summarize/route.ts`) during this session; no
test or runtime behavior changed, this pass is documentation only.
