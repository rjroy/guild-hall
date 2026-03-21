---
title: "Commission maxTurns recovery"
date: 2026-03-16
status: resolved
tags: [commissions, max-turns, recovery, lifecycle, ux]
modules: [commission-orchestrator, commission-lifecycle, sdk-runner]
related:
  - .lore/issues/commission-maxturns-no-recovery.md
  - .lore/diagrams/commission-lifecycle.md
  - .lore/specs/commissions/guild-hall-commissions.md
---

# Brainstorm: Commission maxTurns Recovery

## Context

When a commission hits `maxTurns`, the session ends and the user gets a generic failure: "Session completed without submitting result." The actual reason (`outcome.reason = "maxTurns"`) is computed by `drainSdkSession` but ignored by `handleSessionCompletion`. The worktree is deleted. Partial work survives on the activity branch, but the user can't see it, can't resume it, and can't tell what happened.

This matters because maxTurns is fundamentally different from other failure modes. An SDK crash or a workspace prep error means something broke. maxTurns means the work was proceeding but time ran out. The user invested tokens and got progress, but the system treats it identically to "the agent got confused and gave up."

The issue doc at `.lore/issues/commission-maxturns-no-recovery.md` lays out five dimensions to consider: preserving work, recovery/resumption, diagnosis, lifecycle states, and behavioral nuance. This brainstorm works through each.

## Ideas Explored

### 1. Surface the reason: "maxTurns" in the failure message

The lowest-hanging fruit. `handleSessionCompletion` (orchestrator.ts:531-542) currently builds the failure reason from `outcome.error` or a generic string. It never checks `outcome.reason`. A single conditional could produce a distinct message: "Turn limit reached (N/N turns used)" instead of "Session completed without submitting result."

What this buys: the user immediately understands what happened. The timeline entry becomes diagnostic. The artifact shows "failed: turn limit reached" rather than a cryptic non-result.

What this doesn't buy: any recovery. But it's a prerequisite for everything else, because the user can't make a good decision about recovery if they don't know the cause.

What if the failure message also included `current_progress`? The agent updates progress throughout execution. If the last progress update said "Completed 7 of 12 migrations," the failure message could quote it: "Turn limit reached after 7 of 12 migrations." That's enough for the user to decide whether redispatch is worth it or whether they should increase `maxTurns` and try again.

**Effort: trivial.** A conditional branch in `handleSessionCompletion` plus passing `outcome` through to `failAndCleanup`. Could ship as a standalone fix.

### 2. Distinguish "made progress" from "stuck in a loop"

The issue doc asks whether it's acceptable to treat these the same. It isn't, from a UX perspective. A user who sees "turn limit reached" will think "should I give it more turns?" If the agent was stuck in a loop, more turns just burns more money.

What if we could detect loops? Some heuristics:

- **Repeated tool calls on the same file.** If the last N tool calls are all edits to the same file, the agent is probably fighting itself.
- **Repeated errors.** If the same error appears in the last N turn events, the agent is stuck.
- **No git diff delta.** If the diff between the last two auto-commits is empty or near-identical, no forward progress is happening.

These are all imperfect. An agent doing a careful, incremental refactor of a single file might look like a "loop" by the first heuristic. Error repetition is more reliable but requires the orchestrator to inspect tool event content, which it currently doesn't.

What if we don't try to detect loops automatically, but instead surface enough information for the user to tell? If the failure message includes:
- Total turns used
- Last progress update
- Whether any commits were made
- A link to the preserved branch

...the user can probably distinguish "was making progress" from "was spinning." This is cheaper to build and more robust than heuristic detection.

**Counterpoint:** The Guild Master, who dispatches commissions, could be the one to assess this. When a commission fails with "maxTurns," the Guild Master already sees it. What if the Guild Master's coordination posture included guidance for triaging maxTurns failures? "Check the last progress update. If progress was advancing, suggest redispatch with higher maxTurns. If progress stalled, suggest a different approach." That's a posture change, not a code change.

### 3. New lifecycle state: "halted"

The issue asks whether `failed` is the right terminal state for maxTurns. Two arguments:

**For a new state:** "Failed" implies something went wrong. "Halted" implies a resource constraint. Semantically distinct. A halted commission could have different UI treatment (amber instead of red, a "continue" button instead of "retry"). The state machine already has 9 states; a 10th isn't unreasonable if it carries real meaning.

**Against a new state:** Every new state adds transitions, tests, UI handling, recovery paths, and documentation. The existing `failed → pending` via redispatch already works. Adding "halted" means deciding: can a halted commission be cancelled? Abandoned? Redispatched? The answers are the same as for failed, which suggests it's the same state with a different reason, not a fundamentally different state.

What if "halted" were a sub-status rather than a new state? The artifact already has `activity_timeline` entries with event names. A failure due to maxTurns could be recorded as `event: "status_failed"` with `reason: "turn_limit_reached"` and an additional field like `sub_status: "halted"`. The UI reads `sub_status` for display; the lifecycle state machine stays unchanged. This gets the semantic distinction without the state machine complexity.

What if we use the existing `resource_overrides` pattern? The artifact frontmatter already has `resource_overrides.maxTurns`. A failure reason that references the configured limit ("Turn limit reached: 50/50") connects the failure to the configuration, suggesting the fix (increase maxTurns) without requiring new lifecycle states.

**Leaning toward:** No new state. Use failure reason + sub-status metadata on the timeline entry. The state machine is clean; let's not pollute it for a display concern.

### 4. Preserve the worktree (don't delete it)

Currently `preserveAndCleanup` commits partial work to the activity branch, then deletes the worktree. The branch survives, but the worktree doesn't. For maxTurns specifically, what if we kept the worktree?

**For keeping the worktree:** The user could inspect the work directory directly. Tools like "open in editor" become trivial. Resumption (if we build it) doesn't need to recreate the worktree.

**Against keeping the worktree:** Worktrees consume disk space and clutter the filesystem. If a user dispatches 10 commissions and 3 hit maxTurns, they now have 3 orphaned worktrees. The daemon restart recovery logic would need to distinguish "intentionally preserved" worktrees from "crashed and left behind" worktrees. Today, the recovery logic (orchestrator.ts:926-1195) treats any orphaned worktree as a crash artifact. That assumption would break.

What if worktree preservation were time-limited? Keep it for 24 hours, then auto-clean. This requires a cleanup scheduler, which is new infrastructure.

What if we don't keep the worktree but make the branch discoverable? The branch name follows a predictable pattern (`commission-{id}` or `commission-{id}-attempt-{n}`). The UI could show a "View preserved branch" link that tells the user: "Run `git checkout commission-{id}` in your project to inspect partial work." Or the daemon could serve the branch diff via API.

**Leaning toward:** Don't keep the worktree. The branch is enough. But make it discoverable in the UI and provide a diff endpoint.

### 5. Branch diff endpoint

What if the daemon had a `GET /commission/:id/diff` endpoint that returns the diff between the activity branch and its merge base? This gives the user (and the UI) a way to see what work was done without checking out the branch manually.

The implementation would be: find the activity branch name from the artifact (or compute it from the commission ID + attempt number), run `git diff <merge-base>...<branch>` against the project repo, return the output.

This is useful beyond maxTurns. Any failed commission with a preserved branch could benefit from "see what was done before it failed." The maxTurns case just makes it most urgent.

**Concern:** The project repo is the user's repository. Running git commands against it from the daemon requires the same `cleanGitEnv()` discipline documented in the lessons learned. And the branch might have been manually deleted or rebased. The endpoint needs to handle "branch not found" gracefully.

### 6. Resumption via redispatch with context

The existing redispatch flow (orchestrator.ts:2065-2110) creates a fresh branch and a fresh session. The agent starts from scratch with only the original prompt. What if a maxTurns redispatch could carry forward context?

**Option A: Merge the preserved branch into the new worktree.** The redispatch creates a new activity branch, but instead of branching from claude, it branches from the preserved branch (or merges it in). The agent starts with all the prior work already in the worktree. The prompt includes: "This commission was previously attempted and hit the turn limit. The prior work is already in your worktree. Review what was done and continue from where it left off."

This is technically feasible. The workspace layer already knows how to create branches. Branching from the preserved branch instead of from claude is a parameter change in `workspace.prepare()`. The risk: if the prior work was half-broken (merge conflict in progress, syntax errors from an interrupted edit), the new session inherits that mess.

**Option B: Include the previous session's progress summary in the prompt.** Don't carry the code, carry the context. The prompt includes: "Previous attempt reached turn limit after making this progress: [last current_progress value]. The original prompt was: [prompt]. Continue the work." The agent reads the codebase (which doesn't include prior work, since the branch wasn't merged) and decides how to proceed.

This loses the prior code changes but preserves the agent's understanding of what was done and what remains. It's safer because the agent starts from a clean state and doesn't inherit half-finished work.

**Option C: Both.** Merge the branch (Option A) and include the progress context (Option B). The agent gets the code and the context. This is the highest-fidelity resumption but also the highest risk if the prior work was messy.

What if the choice were left to the user? "This commission hit the turn limit. You can: (1) Redispatch fresh (new branch, original prompt), (2) Continue from prior work (merge prior branch, context-enriched prompt)." This puts the user in control and avoids the system making a wrong assumption about whether the prior work was worth preserving.

**What if resumption were a new `continue` action rather than overloading `redispatch`?** Redispatch means "try again." Continue means "pick up where you left off." Different intent, different implementation, different UX. The lifecycle transition would be the same (`failed → pending → dispatched → in_progress`), but the workspace preparation and prompt construction would differ.

### 7. Configurable maxTurns per commission (already exists)

The artifact schema already has `resource_overrides.maxTurns`. If the user sees "turn limit reached at 50 turns," they can redispatch with a higher limit. The question is: does the UI make this obvious?

What if the failure UI for maxTurns commissions included a "Retry with more turns" button that pre-fills a higher maxTurns (e.g., 2x the original)? That's a UX affordance, not a system change. The redispatch endpoint already supports resource overrides.

Actually, checking the redispatch implementation: it doesn't currently support changing resource_overrides on redispatch. It re-reads the existing artifact and dispatches with whatever was there. What if redispatch accepted optional override parameters? `POST /commission/run/redispatch { commissionId, resource_overrides: { maxTurns: 100 } }`. The orchestrator updates the artifact frontmatter before dispatching.

### 8. Auto-continue for maxTurns (daemon-level)

What if the daemon could automatically continue a commission that hit maxTurns? When `handleSessionCompletion` sees `outcome.reason === "maxTurns"` and `resultSubmitted === false`, instead of failing, it creates a new session on the same worktree with an enriched prompt.

This is essentially auto-redispatch. The commission stays `in_progress`, the worktree stays alive, and a new SDK session picks up. The turn counter resets for the new session, but the total turns across sessions could be tracked and capped (to prevent infinite auto-continues).

**For:** The user dispatched work and wanted it done. Automatically continuing is the most user-friendly behavior. The user doesn't even notice that maxTurns was hit.

**Against:** Money. Each continuation burns more tokens. Without user approval, this could get expensive. And if the agent is stuck in a loop, auto-continue throws more money at the problem. The user should decide.

What if auto-continue were opt-in via a commission-level flag? `resource_overrides.autoRetry: true` or `resource_overrides.maxRetries: 2`. The user explicitly authorizes continuation. Default is no auto-continue; the commission fails and the user decides.

**What if the sleeping state is the precedent here?** When a commission sleeps (waiting for mail), the session ends, the state file preserves the worktree info, and a new session starts when the mail reply arrives. The commission stays alive across session boundaries. maxTurns could use the same mechanism: the commission "sleeps" at maxTurns, and "wakes" for a continuation session.

This is interesting but would require the sleeping state to support a new trigger (maxTurns, not just mail). The sleeping infrastructure (state files, recovery logic) was designed for mail. Reusing it for maxTurns would either generalize the infrastructure or create a parallel path that looks like sleeping but isn't.

### 9. The sleeping analogy, deeper

The sleep/wake mechanism (mail/orchestrator.ts:81-117) preserves:
- The worktree directory
- The branch name
- The session ID
- The sleep reason

When woken, the commission transitions `sleeping → in_progress` and a new SDK session starts in the same worktree.

What if maxTurns triggered the same flow? Instead of failing, the commission sleeps with reason "turn_limit_reached." The worktree and branch survive. Then:

- **Manual wake:** The user reviews the situation and clicks "Continue." The commission wakes, a new session starts in the existing worktree with an enriched prompt.
- **Auto wake with approval:** The UI shows "This commission hit its turn limit. Continue?" with a button. Clicking it wakes the commission.
- **Auto wake (opt-in):** If `autoRetry` is configured, the commission auto-wakes after a brief pause.

The sleep infrastructure already handles: state file persistence, daemon restart recovery, worktree preservation, and session handoff. The missing piece is a wake trigger that isn't "mail reply received."

**What if sleeping is too overloaded?** The sleeping state currently means "waiting for another worker to respond." Using it for "hit turn limit, waiting for user decision" mixes two very different semantics. A UI showing "sleeping" for a maxTurns commission would be confusing.

Alternative: a new `halted` state (see idea 3) that uses the same infrastructure as sleeping but with different semantics. `halted` means "ran out of resources, can be continued." The implementation reuses the state file pattern, worktree preservation, and session handoff from sleeping, but the lifecycle state and UI treatment are distinct.

This circles back to the "new state vs. sub-status" question. If we reuse sleeping infrastructure, maybe a new state is justified after all, because the behavior (preserve worktree, await user decision, resume with new session) really is different from failed (branch preserved, worktree deleted, user can redispatch to a fresh branch).

### 10. What the user actually needs

Stepping back from mechanism to think about the user's experience:

1. **Awareness.** "Your commission hit the turn limit after making progress." This is the failure message fix (idea 1). Non-negotiable.

2. **Visibility.** "Here's what was accomplished." This is the diff endpoint (idea 5) or at minimum quoting `current_progress` in the failure. Important.

3. **Agency.** "You can continue from here, retry fresh, or abandon." This is the recovery UX (ideas 6, 7). Important but can be incremental.

4. **Prevention.** "Consider setting a higher turn limit for complex work." This is documentation and UI hints. Low effort, meaningful impact.

The minimum viable fix is (1) + (2). The user knows what happened, can see what was done, and can manually redispatch with a higher limit using existing mechanisms. Everything beyond that is improvement on a solid foundation.

## Open Questions

1. **Should the preserved branch name be stored in the artifact?** Currently it follows a naming convention (`commission-{id}` or `commission-{id}-attempt-{n}`), but if the convention changes or the user wants to find it months later, an explicit `preserved_branch` field in the artifact would be more robust.

2. **What's the right default maxTurns?** If it's too low, commissions hit the limit routinely and the problem is chronic. If it's too high, it's never hit and we're solving a rare case. Understanding the current default and how often maxTurns is actually reached would inform priority.

3. **Can the SDK resume a session?** The Claude Agent SDK may support session resumption natively (passing a previous session ID to continue from). If so, true resumption (not just a new session with context) might be possible. Worth checking the SDK docs.

4. **How does the Guild Master factor in?** The Guild Master sees commission failures and can make coordination decisions. If a maxTurns failure included rich diagnostic info (turns used, progress made, loop detection hints), the Guild Master could autonomously decide whether to redispatch, adjust turns, or report to the user. This is a posture enhancement, not a system change.

5. **Should maxTurns failures count toward dispatch attempt tracking?** Currently redispatch increments an attempt counter. If maxTurns is "ran out of time" rather than "something went wrong," should the attempt counter distinguish the two? A commission that failed 3 times from bugs is different from one that needed 3 continuations to finish complex work.

## Next Steps

The incremental path, from simplest to most ambitious:

1. **Ship the failure message fix.** Pass `outcome.reason` through `handleSessionCompletion`, produce a distinct failure message for maxTurns. Include turn count and last `current_progress`. This is a single-PR fix that immediately improves the UX.

2. **Add preserved branch info to the artifact.** Store `preserved_branch` in the artifact or timeline when `preserveAndCleanup` runs. Makes the branch discoverable.

3. **Add a diff endpoint.** `GET /commission/:id/diff` returns the preserved branch diff. The UI can show "what was done" for any failed commission.

4. **Enriched redispatch for maxTurns.** When redispatching a maxTurns-failed commission, option to carry forward context (previous progress summary in prompt) or code (merge prior branch). This could be a new `continue` action distinct from `redispatch`.

5. **Halted state with sleeping infrastructure.** If demand warrants it, add a `halted` state that preserves the worktree and allows in-place continuation. This is the most complex option but provides the smoothest UX for long-running commissions.

Each step builds on the previous one. Step 1 can ship alone and the rest can follow based on how often maxTurns actually occurs in practice.
