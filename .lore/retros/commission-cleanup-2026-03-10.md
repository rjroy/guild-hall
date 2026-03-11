---
title: Commission batch cleanup (2026-03-08 to 2026-03-10)
date: 2026-03-10
status: complete
tags: [retro, commissions, cleanup]
---

## Context

90 commissions across 5 workers (Dalton: 39, Octavia: 31, Thorne: 9, Sable: 7, Verity: 4) spanning March 8-10, 2026. This was a dense feature push: two features shipped (model selection, portrait display-time resolution), five features fully spec'd and planned (scheduled commissions, local model support, Steward worker MVP, system model defaults, meeting rename, SDK tool availability enforcement), and the test suite grew from ~2000 to 2491 tests. Research completed on personal assistant landscape, agent memory systems, SDK sandbox capabilities, and graph layout algorithms.

## What Worked

**Sequential spec→plan→implement chains held.** Most chains produced clean handoffs. Octavia wrote spec and plan; Dalton implemented; Sable added tests; Thorne reviewed. Findings from Thorne fed back into corrective commissions the same session.

**Rapid-fire batch dispatches completed clean.** Four consecutive Local Model Support commissions dispatched 21 seconds apart (Mar 9, 18:33:31-18:33:52) all succeeded without race conditions or conflicts.

**Quality floors held.** Every implementation commission included tests. Final lint/typecheck/test pass confirmed across the full suite. Thorne's review role caught multiple defects before merge.

**Duplicate handling was graceful.** Three commissions were abandoned as duplicates (two plan duplicates, one invalid model ID). All were properly marked; no data loss.

## Loose Threads

### Critical - Bugs

**CSS gem colors are mathematically inverted** (from Octavia's commission-Octavia-20260309-153126)
All commission status gems show the wrong color. `--gem-active: hue-rotate(100deg)` produces 340° (red) instead of green; `--gem-blocked: hue-rotate(-140deg)` produces 100° (yellow-green) instead of red. Two statuses also missing mappings: `sleeping` and `abandoned`. Proposed fix: `hue-rotate(-120deg)` for active (green), `hue-rotate(120deg)` for blocked (red), `hue-rotate(-195deg)` for pending (amber). Requires visual verification against gem sprite after applying.

**Model name regex rejects hyphens** (from Octavia's commission-Octavia-20260309-194600)
`updateCommission` uses `/\w+/` for model name validation. Local model names like `mistral-local` contain hyphens that `\w` doesn't match, silently failing or corrupting model updates. Fix: update regex to accept hyphens in `daemon/` model validation code.

**Worker display title still hardcoded to name** (tracked in `.lore/issues/worker-display-title-hardcoded-to-name.md`)
`propose_followup` writes `workerDisplayTitle: "${deps.workerName}"` instead of actual display title. Dalton's portrait fix from Mar 8 didn't extend to `propose_followup`. Issue is tracked; no implementation commissioned yet.

### Critical - Security

**SDK tool availability enforcement not implemented** (from Octavia's commissions 174455/175908)
Workers without Bash in their `builtInTools` can still access Bash through user permission settings because the SDK runner sets `allowedTools` (permission layer) but never sets `tools` (availability layer). All non-Bash workers (Manager, Reviewer, Octavia, Verity) have unauthorized tool access. Spec complete (REQ-TAE-1-12), plan complete (5 steps), no implementation commissioned yet. No blocker dependencies.

### High - Ready for Implementation

**Scheduled commissions infrastructure** (Octavia commissions 102827/194249/194422)
Fully spec'd (REQ-SCOM-1-28), detailed 11-step plan complete. Only blocker is cron library selection, flagged as a deliberate research exit point. This is a prerequisite for the Steward worker's morning digest and general automation capabilities.

**Local model support** (Octavia commissions 151657/194600/005914)
Spec complete (REQ-LOCAL-1-30), 11-step plan complete, Thorne's validation feedback incorporated. Two validation gaps remain before implementation:
- Mid-session error message is not prefixed with model name/URL (hard to diagnose which model failed)
- Manager posture guidance omits note about local model configuration

Builds on model-selection infrastructure (already shipped).

**System model defaults configuration** (Octavia commissions 005353/011525)
Spec complete (10 reqs), plan complete (6 steps). Makes hardcoded models configurable (memory compaction, meeting notes, briefing, Guild Master). Depends on local model support foundation for `resolveModel` infrastructure.

**Steward Worker MVP** (Octavia commissions 010800/011935)
MVP spec complete (REQ-STW-1-20 per Thorne's validation), 7-step plan across 3 commissions. Deliberately deferred: scheduled commissions (not built), calendar toolbox, email send. MVP scope is manual-only tasks using existing mail reader toolbox (inbox triage, meeting prep, email research).

**Scheduled commissions test gaps** (from Thorne's commission-Thorne-20260309-183403)
Three coverage gaps with regression risk: no tests for the schedule-status route, `previous_run_outcome` field population, or `escalation_created` extra fields. These were deferred from the review round and not picked up in subsequent commissions.

### Medium - Design Ready

**Meeting rename capability** (Octavia commissions 005914/011717)
Spec complete (REQ-MREN-1-18), plan complete (7 steps). Small feature: updates the title field only, not filename or meeting-id. Commission when UI work is next.

**Status text visibility** (Octavia commission 011207)
Plan complete (11 steps, new StatusBadge component). GemIndicator alone doesn't distinguish statuses (green covers completed/approved/implemented/shipped). Affects 5 list components.

**Dashboard hydration mismatch** (Octavia commission 200037, tracked in `.lore/issues/hydration-error-dashboard.md`)
Plan complete with diagnosis steps and 4 fix strategies. Root cause likely `ManagerBriefing.formatRelativeTime()` using `Date.now()`. Same locale-sensitive formatting pattern found in CommissionList, CommissionScheduleInfo, CommissionTimeline.

**Sandbox execution feasibility** (Octavia commission 135434)
6-dimension brainstorm complete. Phase 1 (SDK sandbox for Bash workers) is low-effort with no breaking changes. Phase 4 (container isolation) is a heavy lift. 8 open questions remain. Agent SDK sandbox only covers Bash; Read/Write/Edit/Glob/Grep tools need separate `canUseTool` enforcement.

### Medium - Untracked Gaps

**Commission routes missing model in type annotation** (from Thorne's commission-Thorne-20260308-231935)
`resourceOverrides` type in commission routes is missing the `model` field. It works by accident because TypeScript isn't enforcing it, but this will silently break if the type is ever used for validation.

**Duplicate mailContext block in worker-activation.ts** (from Thorne reviews, pre-existing)
Mail reader instructions are duplicated in worker-activation.ts. No functional impact but creates drift risk when instructions need updating.

### Low - Deferred with Direction

**Fallback model strategy** (tracked in `.lore/issues/fallback-model-strategy.md`)
5 possible directions sketched without commitment. No handling for model unavailability, API capacity failures, or local server failures. User decision required on direction.

**Copy path button** (Octavia commission 151956)
Plan complete (4 trivial steps). Low-friction quick win when UI bandwidth allows.

**Old artifacts with workerPortraitUrl** (from Dalton's commissions)
Seven pre-existing artifacts still have stale `workerPortraitUrl` in frontmatter. Field is ignored at display time. Optional batch migration.

## Infrastructure Issues

**Committed Playwright log artifact** (from Thorne's commission-Thorne-20260308-184127)
`.playwright-mcp/console-2026-03-08T04-00-05-487Z.log` was committed to the repository. The `.playwright-mcp/` directory is not in `.gitignore`. These logs will grow unboundedly as MCP sessions accumulate.

**Pre-existing test instability** (from Thorne reviews)
Two pre-existing failures not introduced by these commissions: one timing-dependent race in the commission orchestrator (concurrent completion/cancellation), one unhandled rejection from the mail toolbox factory background connect. Neither caused commission failures but both represent latent risk.

## Lessons

**Reviews without test gap tracking slip.** Thorne's review of scheduled commissions found test gaps in the second pass that should have been tracked in the first. A review commission that surfaces gaps should always file them before closing, even if they're "low priority."

**Spec-then-plan chains need explicit implementation sequencing.** Five features are fully designed but unimplemented. The bottleneck isn't quality; it's that no one has commissioned the implementation. A weekly "dispatch ready features" step would prevent backlog from accumulating.

**Security-class findings should always trigger immediate implementation.** The SDK tool availability enforcement issue is a security defect with a complete spec and plan. It should not wait for backlog prioritization.
