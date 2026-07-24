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
