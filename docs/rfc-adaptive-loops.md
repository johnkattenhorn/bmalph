# RFC: Adaptive loop strategies and story-sizing feedback

**Status:** Proposed
**Target:** bmalph v3.1.0 (Idea 1) / BMAD upstream (Idea 2)
**Origin:** 2026-04-17, observed during productone v2 kickoff (Story 1.3 required 2 full loops — 80 min — because fresh-context reset per loop made Loop 2's uncommitted auth scaffold invisible to Loop 3, which restarted from scratch)

## Problem

`SESSION_CONTINUITY=false` (introduced as a v1-failure remediation) resets Claude's context between loops. For stories that fit in one loop, this is ideal — prevents context-rot drift. For stories that don't fit, it causes thrashing: each loop redoes the same exploration, burning tokens on repeated reads of the same architecture/epics docs before any new implementation.

Two complementary fixes worth exploring, at two different layers of the stack.

## Idea 1 — Adaptive in-loop escalation (bmalph feature)

### Behaviour

At the start of each loop:

1. Read `.ralph/@fix_plan.md`, identify the first `[ ]` story as `current_story_id`
2. Compare to the previous loop's `current_story_id` (stored in `.ralph/.story_attempts.json`)
3. If same story AND previous loop produced no commit:
   - Increment `attempts[current_story_id]`
   - Escalate strategy (see table below)
4. If different story, reset attempts counter

### Escalation ladder

| attempts | strategy | effect |
|---|---|---|
| 1 | baseline | `CLAUDE_TIMEOUT_MINUTES` as-configured, `SESSION_CONTINUITY=false` as-configured |
| 2 | extended_timeout | Timeout ×1.5 for this loop only (e.g. 40m → 60m) |
| 3 | session_continuity | `SESSION_CONTINUITY=true` for this loop only; preserves Claude's memory of Loop 2's uncommitted work |
| 4 | halt_with_surface | Stop Ralph. Emit diagnostic to `.ralph/status.json` and surface via `bmalph watch` / `bmalph status`. User must intervene |

### State file

`.ralph/.story_attempts.json`:
```json
{
  "current": {
    "story_id": "Story 1.3",
    "identifier_hash": "<sha256 of the story AC>",
    "attempts": 2,
    "last_strategy": "extended_timeout",
    "first_attempt_ts": "2026-04-17T07:58:53Z",
    "last_attempt_ts": "2026-04-17T08:39:24Z"
  },
  "history": [
    { "story_id": "Story 1.2", "attempts": 1, "committed": true },
    { "story_id": "Story 1.1", "attempts": 1, "committed": true }
  ]
}
```

### New `.ralphrc` options

```bash
# Opt in to adaptive loop escalation (default: false — preserves current behaviour)
ADAPTIVE_LOOP_ESCALATION=true

# Maximum attempts before halt (default: 3 — escalates through extended_timeout then session_continuity, then halts)
ADAPTIVE_MAX_ATTEMPTS=3

# Timeout multiplier at each escalation (default: 1.5)
ADAPTIVE_EXTENDED_TIMEOUT_MULT=1.5
```

### Why this is implementable in a weekend

- Pure bash + JSON state machine. No LLM needed.
- Observable via existing log channels.
- Opt-in (`ADAPTIVE_LOOP_ESCALATION=false` by default) preserves backwards compatibility.
- The `SESSION_CONTINUITY` and `CLAUDE_TIMEOUT_MINUTES` knobs already exist; this just flips them transiently.

### Risks

- `SESSION_CONTINUITY=true` mid-run means the NEXT loop after escalation carries context. If that loop commits, is the following loop back to fresh-context? Probably yes (reset attempts → baseline strategy). Needs careful ordering in the shell script.
- `halt_with_surface` needs a clear signalling mechanism so the user knows to intervene. Reuse the existing `EXIT_SIGNAL` / `RALPH_STATUS` block.

## Idea 2 — Story-sizing feedback in implementation-readiness (BMAD feature)

### Behaviour

During `bmad-check-implementation-readiness` (the current BMAD v6.3.0 skill), add a new check: for each story in `epics.md`, compute a complexity score. Flag stories that likely exceed a single Ralph loop and suggest a breakdown.

### Heuristics

| Signal | Weight |
|---|---|
| Cross-domain count (backend / frontend / tests / migrations / infrastructure / integrations) | 5 per domain |
| AC block count | 2 per Given/When/Then block |
| File-creation verbs in AC (`create`, `add`, `implement`, `scaffold`) | 1 per verb |
| Explicit dependency on another story (`After Story X…`) | 3 |
| New external integration (OAuth, CSV import, LiteLLM, etc.) | 5 |

Empirically-tuned threshold (from productone): **score > 25** = likely multi-loop.

### Suggested output (warning, not error)

```
⚠ Story 1.3 (Authentication with ASP.NET Core Identity)
  Complexity score: 34 (threshold 25 — likely multi-loop)
  Breakdown:
    - Backend (10) + Tests (5) + Migrations (5) = 20
    - 4 AC blocks × 2 = 8
    - Verbs: "implement cookie auth", "add login/logout/me endpoints" = 6
  
  Suggested split:
    - Story 1.3a: Auth scaffold + login endpoint (ASP.NET Core Identity setup, /api/auth/login, cookie issuance, happy-path test)
    - Story 1.3b: Logout + /me + error responses (logout endpoint, /api/auth/me, invalid-credential Problem Details response, auth middleware unit tests)
```

### Why this is harder

- Thresholds are project-sensitive. What's "too big" depends on `CLAUDE_TIMEOUT_MINUTES`, the complexity of the architecture, and how much context each loop has to read. A heuristic tuned on productone may over- or under-fire elsewhere.
- Split suggestions need an LLM call — can't be a pure lint pass.
- Belongs in BMAD upstream (`bmad-check-implementation-readiness`), not bmalph, so it's a political/coordination lift.
- Could be approximated by a bmalph-fork skill in the interim (`bmalph ready-check` or similar) that runs as a pre-`bmalph-implement` hook.

### Graceful interim

Rather than waiting for BMAD upstream, implement as:
- A bmalph CLI command: `bmalph size-check` that reads `@fix_plan.md` and reports scores
- Called automatically during `bmalph implement` with a warning (non-blocking)
- A sharp tool the user can run manually on any epic to get "is this chunked right?"

## Relationship between the two

**Idea 1 is a runtime safety net.** When a story turns out too big despite planning, Ralph degrades gracefully rather than thrashing.

**Idea 2 is a planning-time warning.** When a story is obviously too big on paper, flag it before Ralph wastes tokens.

Both should exist. Idea 1 is more urgent because it reacts to reality; Idea 2 is more valuable because it prevents the problem.

## Next steps

1. **Ship Idea 1 in bmalph v3.1.0** — 1-2 day implementation, behind an opt-in flag
2. **Prototype Idea 2 as a bmalph CLI command** — `bmalph size-check`, heuristic-only (no LLM), 2-3 days
3. **Evaluate after productone finishes** — do the heuristics hold? Are escalations actually helpful?
4. **If heuristics hold, propose Idea 2 upstream** — clean PR to BMAD against `bmad-check-implementation-readiness`

## Not pursuing

- Per-story configuration overrides in `@fix_plan.md` (e.g. `<!-- bmalph: timeout=60m -->`). Tempting but creates a DSL-within-markdown that's easy to abuse. Adaptive logic + story-size warning should cover most cases.
- Reinforcement learning / per-project tuning. Over-engineering. Heuristics + opt-in flags first.
