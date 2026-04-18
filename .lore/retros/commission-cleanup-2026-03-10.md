---
title: Commission batch cleanup (2026-03-08 to 2026-03-10)
date: 2026-03-10
status: complete
validated: 2026-04-18
tags: [retro, commissions, cleanup]
---

## Validation Note (2026-04-18)

Loose threads below have been re-checked against current code. Each item is tagged with its current status:
- **[RESOLVED]** — fix confirmed in code as of 2026-04-18
- **[ABANDONED]** — work was dropped or scope was killed (e.g. scheduled commissions)
- **[OPEN]** — still present; see linked issue or current location
- **[DIVERGED]** — outcome differs from how the retro framed it; explanation inline

Use the tags before treating any item here as actionable. The "Lessons" section at the bottom has been kept as historical observation.

## Context

90 commissions across 5 workers (Dalton: 39, Octavia: 31, Thorne: 9, Sable: 7, Verity: 4) spanning March 8-10, 2026. This was a dense feature push: two features shipped (model selection, portrait display-time resolution), five features fully spec'd and planned (scheduled commissions, local model support, Steward worker MVP, system model defaults, meeting rename, SDK tool availability enforcement), and the test suite grew from ~2000 to 2491 tests. Research completed on personal assistant landscape, agent memory systems, SDK sandbox capabilities, and graph layout algorithms.

## What Worked

**Sequential spec→plan→implement chains held.** Most chains produced clean handoffs. Octavia wrote spec and plan; Dalton implemented; Sable added tests; Thorne reviewed. Findings from Thorne fed back into corrective commissions the same session.

**Rapid-fire batch dispatches completed clean.** Four consecutive Local Model Support commissions dispatched 21 seconds apart (Mar 9, 18:33:31-18:33:52) all succeeded without race conditions or conflicts.

**Quality floors held.** Every implementation commission included tests. Final lint/typecheck/test pass confirmed across the full suite. Thorne's review role caught multiple defects before merge.

**Duplicate handling was graceful.** Three commissions were abandoned as duplicates (two plan duplicates, one invalid model ID). All were properly marked; no data loss.

## Loose Threads

### Critical - Bugs

**CSS gem colors are mathematically inverted** **[RESOLVED]** (from Octavia's commission-Octavia-20260309-153126)
All commission status gems showed the wrong color. Current values in `web/app/globals.css:70-72` are `--gem-active: hue-rotate(-100deg)`, `--gem-pending: hue-rotate(-140deg)`, `--gem-blocked: hue-rotate(120deg)`. The retro's proposed exact values were not used, but the inversion was addressed.

**Model name regex rejects hyphens** **[RESOLVED]** (from Octavia's commission-Octavia-20260309-194600)
The `/\w+/` model name regex is no longer present in `daemon/`. Validation was refactored during the model-selection work; hyphenated local model names now pass.

**Worker display title still hardcoded to name** **[OPEN]** (tracked in `.lore/issues/worker-display-title-hardcoded-to-name.md`)
The issue was prematurely marked resolved and archived in March. Verified 2026-04-18: bug is still live at `daemon/services/meeting/toolbox.ts:135` (`propose_followup`) and `daemon/services/manager/toolbox.ts:406` (`initiate_meeting`). The claimed "display-time resolution" fix never landed in `web/lib/resolve-attribution.ts`, which still reads `extras.workerDisplayTitle` directly. Issue re-opened with verified detail and two fix options.

### Critical - Security

**SDK tool availability enforcement not implemented** **[RESOLVED]** (from Octavia's commissions 174455/175908)
Spec at `.lore/specs/workers/tool-availability-enforcement.md` is now `status: implemented`. Workers without Bash in their `builtInTools` no longer have unauthorized tool access via permission settings.

### High - Ready for Implementation

**Scheduled commissions infrastructure** **[ABANDONED]** (Octavia commissions 102827/194249/194422)
Spec moved to `.lore/specs/_abandoned/guild-hall-scheduled-commissions.md`. The scheduler/trigger system was built and later removed in favor of the heartbeat implementation. Residue tracked in `.lore/issues/scheduler-removal-residue.md` (resolved 2026-04-12).

**Local model support** **[RESOLVED]** (Octavia commissions 151657/194600/005914)
Spec at `.lore/specs/infrastructure/local-model-support.md` is `status: implemented`.

**System model defaults configuration** **[RESOLVED]** (Octavia commissions 005353/011525)
Spec at `.lore/specs/infrastructure/system-model-defaults.md` is `status: implemented`.

**Steward Worker MVP** **[RESOLVED]** (Octavia commissions 010800/011935)
Spec at `.lore/specs/workers/guild-hall-steward-worker.md` is `status: implemented`. Scheduled-commission dependency obviated by the heartbeat redirection.

**Scheduled commissions test gaps** **[ABANDONED]** (from Thorne's commission-Thorne-20260309-183403)
Moot — scheduler removed.

### Medium - Design Ready

**Meeting rename capability** **[RESOLVED]** (Octavia commissions 005914/011717)
Implemented; `mcp__guild-hall-meeting__rename_meeting` is live in the meeting toolbox.

**Status text visibility** **[RESOLVED]** (Octavia commission 011207)
StatusBadge built at `web/components/ui/StatusBadge.tsx` and used in 9 components (ArtifactList, MeetingList, DependencyMap, RecentArtifacts, NeighborhoodGraph, CommissionFilterPanel, CommissionList, etc.).

**Dashboard hydration mismatch** **[DIVERGED]** (Octavia commission 200037)
Issue archived 2026-03-14 as `wontfix` — investigation found no deterministic mismatch source in any dashboard component. Mitigations applied: `suppressHydrationWarning` on the `ManagerBriefing` timestamp, `formatRelativeTime` made testable via DI with full unit coverage, defensive comment on `RecentArtifacts`. Suspected residual cause is Turbopack dev-mode CSS Module hash inconsistency. The retro framed this as "ready for fix"; reality was "couldn't reproduce, papered over." Archived at `.lore/_archive/issues/hydration-error-dashboard.md`.

**Sandbox execution feasibility** (Octavia commission 135434)
Status unchanged in this validation pass — brainstorm artifact remains; no spec or plan picked up. Not re-verified against current code.

### Medium - Untracked Gaps

**Commission routes missing model in type annotation** **[RESOLVED]** (from Thorne's commission-Thorne-20260308-231935)
`daemon/routes/commissions.ts:49,116` now declares `resourceOverrides?: { model?: string }` on both create and update bodies.

**Duplicate mailContext block in worker-activation.ts** (from Thorne reviews, pre-existing)
Not re-verified in this validation pass. Mail reader scope has shifted since 2026-03-10.

### Low - Deferred with Direction

**Fallback model strategy** (originally tracked in `.lore/issues/fallback-model-strategy.md`)
Issue file no longer present in `.lore/issues/` or `.lore/_archive/issues/` as of 2026-04-18. Status unknown — either resolved silently or dropped during a cleanup. Re-file if model unavailability handling is still missing in practice.

**Copy path button** (Octavia commission 151956)
Not re-verified. Check `web/components/` for a path-copy affordance before re-commissioning.

**Old artifacts with workerPortraitUrl** (from Dalton's commissions)
`workerPortraitUrl` still appears in 20 files (mostly tests, components, and brainstorm artifacts). Field is ignored at display time per `web/lib/resolve-attribution.ts` (resolves portrait from roster lookup, not frontmatter). Migration remains optional cosmetic cleanup.

## Infrastructure Issues

**Committed Playwright log artifact** **[RESOLVED]** (from Thorne's commission-Thorne-20260308-184127)
`.playwright-mcp/` is in `.gitignore`. Confirmed 2026-04-18.

**Pre-existing test instability** (from Thorne reviews)
Not re-verified. Test suite has grown from ~2,500 to ~3,673 since this retro; check current `bun test` output if pursuing.

## Lessons

**Reviews without test gap tracking slip.** Thorne's review of scheduled commissions found test gaps in the second pass that should have been tracked in the first. A review commission that surfaces gaps should always file them before closing, even if they're "low priority."

**Spec-then-plan chains need explicit implementation sequencing.** Five features are fully designed but unimplemented. The bottleneck isn't quality; it's that no one has commissioned the implementation. A weekly "dispatch ready features" step would prevent backlog from accumulating.

**Security-class findings should always trigger immediate implementation.** The SDK tool availability enforcement issue is a security defect with a complete spec and plan. It should not wait for backlog prioritization.
