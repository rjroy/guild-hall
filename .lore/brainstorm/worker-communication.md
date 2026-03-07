---
title: Worker-to-worker communication
date: 2026-03-06
status: open
tags: [architecture, workers, communication, mailbox, sleep, async]
modules: [commission-orchestrator, sdk-runner, workspace, daemon, toolbox-resolver, lifecycle]
related:
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-system.md
---

# Brainstorm: Worker-to-Worker Communication

## Context

Two specs reference `[STUB: worker-communication]` as an exit point. The workers spec (line 178) explicitly defers this: "No worker-to-worker communication in this version. All coordination flows through the manager or shared artifacts/memory." The stub description in both specs says "Workers need to coordinate without going through the manager."

Today, workers can only coordinate through two channels: the Guild Master (which creates commissions and dispatches workers) and shared memory/artifacts (which workers can read and write). There is no mechanism for one worker to directly engage another.

## The Model: Mailbox + Sleeping Commissions

Two interlocking concepts that together give workers the ability to consult each other mid-commission.

### Sleeping Commissions

A worker in a commission can send a message to another worker and then put itself to sleep. Sleep means: the SDK session drains (no token cost), but the worktree stays open (branch, checkout, uncommitted work preserved). When a reply arrives, the commission wakes up with the reply injected into the resume prompt.

"Sleeping" is a proper state in the commission lifecycle, not a flag on `in_progress`. The behavioral difference is real (no active session, no token cost, worktree held open) and the UI should show it. The state machine gains transitions: `in_progress -> sleeping`, `sleeping -> in_progress` (on wake), `sleeping -> cancelled`, `sleeping -> abandoned`.

Commissions can sleep multiple times. Each sleep/wake cycle is a separate consultation. The session ID chain flows naturally: each `drainSdkSession()` returns a `sessionId` that gets saved to the commission state file, and each `prepareSdkSession({ resume: savedSessionId })` reconnects to the prior conversation.

### Mail

The receiving worker runs as a new context type called "mail." Not a commission, not a consultation, not a lightweight anything. It's its own type, named honestly because the activity IS different.

The mail reader runs in the sender's worktree with a fresh Claude session using its own posture and tools. It's intentionally less informed than the sender (sees the code, doesn't know the sender's reasoning). The entire point of engaging another agent is to get a different point of view. If the reader carried the sender's context, it wouldn't be worth doing.

**Mail is single-turn.** The reader reads the message, does the work, adds a reply, tells the daemon it's done. The daemon wakes the sleeping commission with the reply. If the commission worker wants another consultation, it sends another mail and sleeps again. The back-and-forth happens across multiple sleep/wake cycles, not within a single mail session.

### The Full Flow

1. Commission worker (Dalton) decides it needs a review. Calls a "send mail" tool with the target worker (Thorne) and a message.
2. Commission transitions from `in_progress` to `sleeping`. SDK session drains. Session ID saved. Worktree preserved.
3. Daemon activates Thorne as a mail reader in Dalton's worktree. Fresh session, Thorne's posture and tools, mail context type.
4. Thorne reads the message, does the work (reads files, possibly writes notes/fixes), adds a reply via a "reply" tool.
5. Thorne's session ends. Daemon receives the reply.
6. Daemon wakes Dalton's commission: transitions `sleeping -> in_progress`, resumes SDK session with reply in the prompt.
7. Dalton continues work. If it wants to consult Sable next (break-and-fix testing), it sends another mail and sleeps again.
8. Dalton finishes, submits result. Commission completes normally. Thorne and Sable's mail stays in the project lore as a record of their findings.

### What Mail Gives You

Same cost as the user spinning up another agent manually. The advantage is that the reader doesn't carry the calling agent's full context, which is useful for fresh-eyes review, expert consultation, and separation of concerns. The reader works in the same space (same worktree, same files) but with different expertise (different posture, different tools).

### How Mail Fits the Existing Architecture

The toolbox resolver dispatches on `contextType` ("commission" or "meeting") to select context-specific tools. "Mail" becomes a third context type, slotting into the same mechanism. Mail gets its own toolbox: a "reply" tool to send the answer back, plus whatever base tools the worker normally has. It does NOT get commission tools (report_progress, submit_result).

Worker activation (`prepareSdkSession()` in `sdk-runner.ts`) runs the same 5-step sequence regardless of context: find package, resolve tools, load memory, activate worker, build SDK options. Mail runs through the full pipeline, getting full worker activation. The difference is in context-specific tools and activation prompt content.

## Decisions Made

**Mail is a context type, not a variant of commission.** Naming it gives room to shift the design later without lying about what it is. The toolbox resolver, activation pipeline, and lifecycle can all evolve independently from commissions. (Decision: 2026-03-06)

**Sleeping is a proper commission state.** Not a flag. The behavioral difference is meaningful and the UI should reflect it. (Decision: 2026-03-06)

**Mail is single-turn. Commissions can sleep multiple times.** The reader does one thing and replies. If the commission needs more consultations, it sends more mail across separate sleep/wake cycles. (Decision: 2026-03-06)

**Guild Master doesn't see mail.** Workers address each other directly by name. The manager coordinates at the commission level; mail is below that. No brokering, no manager visibility requirement. (Decision: 2026-03-06)

**Mailbox storage is project lore (`.lore/`).** Mail is part of what happened, not daemon infrastructure. When Dalton asks Thorne to review and Sable to break-test, those findings are part of the project's record. They document how the work got done, not just that it got done. (Decision: 2026-03-06)

**No shared mechanism with AskUserQuestion.** Worker-to-worker communication and user questions are separate problems. What's shared is that both involve communication, but that's not enough to justify a shared abstraction. (Decision: 2026-03-06)

## Open Questions

### Sleep/Wake Resource Model

- Does a sleeping commission count against the commission cap? It holds a worktree and branch (disk, git namespace) but has no active session. This may mean separating "execution cap" (active SDK sessions) from "worktree cap" (held branches/disk).
- Timeout for sleeping commissions? A commission that never wakes is a leaked worktree. Some expiration or user-visible warning seems necessary.
- What happens if a sleeping commission is cancelled while its mail reader is still running? The reader's session needs to be aborted, and its partial work in the worktree may need cleanup.

### Wake-Up Prompt Content

The wake-up prompt needs to carry: (1) the reply from the mail reader, and (2) what changed in the worktree while sleeping (if the reader wrote files). The SDK `resume` parameter reconnects to the prior conversation, so the prompt is additive, not a fresh start.

Open: how much detail about worktree changes? A diff summary? A list of files touched? Just "Thorne reviewed your work and left notes in `.lore/mailbox/`"?

### Mail Storage Shape

Mail lives in `.lore/`, but the exact structure isn't decided. Candidates:

- `.lore/mailbox/<commission-id>/` with one file per message (request and reply as separate files)
- `.lore/commissions/<commission-artifact>/mailbox/` nested under the commission's own artifact directory
- `.lore/mail/` as a flat directory with filenames encoding sender, recipient, and timestamp

The structure should make it easy for the mail reader to find its message and for the waking commission to find the reply. It should also read naturally when browsing the project's lore after the commission completes.

### Mail Toolbox Design

The mail context toolbox needs at minimum a "reply" tool. Open questions:

- Does the reader get any other mail-specific tools, or just the reply tool plus its normal base tools?
- Can the reader see the commission artifact (to understand what the sender is working on), or is that information only in the mail message itself? Restricting it keeps the fresh perspective pure; allowing it gives more context.
- Should the reply tool enforce structure (e.g., findings, recommendations, changes made), or is it freeform?

### Fire-and-Forget Alternative

Sleep forces the caller to stop. If the caller has more work it can do while waiting, sleep is wasteful. "Send and continue, check for reply later" avoids forced stops but introduces polling complexity. Sleep is cleaner to reason about and matches the current model where a commission does one thing at a time. This is noted as a design trade-off, not an open question: sleep is the chosen model. If fire-and-forget becomes necessary later, it would be a separate feature.

## Next Steps

This brainstorm is close to spec-ready. The remaining open questions are implementation-level (storage shape, toolbox design, wake-up prompt content, resource caps) rather than architectural. When ready to move forward:

1. Spec the sleeping state transitions and their integration with the existing commission lifecycle.
2. Spec the mail context type, toolbox, and activation flow.
3. Spec the `.lore/` storage layout for mail artifacts.
4. Consider whether a proof-of-concept could test the mail reader alone (without sleep), to validate that workers produce useful answers when consulted this way.
