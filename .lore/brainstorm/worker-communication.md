---
title: Worker-to-worker communication
date: 2026-03-06
status: open
tags: [architecture, workers, communication, mailbox, sleep, async]
modules: [commission-orchestrator, sdk-runner, workspace, daemon]
related:
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-system.md
  - .lore/issues/ask-user-question-async.md
---

# Brainstorm: Worker-to-Worker Communication

## Context

Two specs reference `[STUB: worker-communication]` as an exit point. The workers spec (line 178) explicitly defers this: "No worker-to-worker communication in this version. All coordination flows through the manager or shared artifacts/memory." The stub description in both specs says "Workers need to coordinate without going through the manager."

Today, workers can only coordinate through two channels: the Guild Master (which creates commissions and dispatches workers) and shared memory/artifacts (which workers can read and write). There is no mechanism for one worker to directly engage another.

## Ideas Explored

### Mailbox + Sleeping Commission Model

The strongest idea that emerged. Two interlocking concepts:

**Sleeping commissions.** A worker in a commission can send a message to another worker and then put itself to sleep. Sleep means: the SDK session drains (no token cost), but the worktree stays open (branch, checkout, uncommitted work preserved). When a reply arrives, the commission wakes up with the reply injected into the resume prompt. This separates the expensive parts: the worktree is the stateful thing worth preserving, the SDK session is expensive to run but cheap to restart.

**Mailbox reader.** The receiving worker doesn't get its own commission or worktree. It runs in the *sender's* worktree with a fresh Claude session using its own posture and tools. It's intentionally less informed than the sender (sees the code, doesn't know the sender's reasoning). This is essentially a single-turn consultation: session starts, reads the message, does its work, answers, session drains, response goes into the mailbox.

This model is asymmetric by design. The sender has full commission context. The reader gets a fresh perspective on the same workspace. That's a feature for review and consultation, potentially limiting for deep collaboration.

### What the mailbox reader gives you

Same cost as the user spinning up another agent manually. The advantage is that the reader doesn't carry the calling agent's full context, which is useful for fresh-eyes review, expert consultation, and separation of concerns. The reader works in the same space (same worktree, same files) but with different expertise (different posture, different tools).

## Open Questions

### Sleep/Wake Lifecycle

- Does a sleeping commission count against the commission cap? The worktree is the scarce resource (disk, branch namespace), not the session. Maybe a separate "sleep cap" or sleeping commissions count against a worktree cap but not an active cap.
- Can a commission sleep multiple times (back-and-forth conversation with another worker)?
- What's in the wake-up prompt? Just the reply, or also a summary of what changed in the worktree while sleeping?

### Mailbox Reader Mechanics

- The reader runs in the sender's worktree. What if it writes files, not just reads? When the sleeping commission wakes up, its worktree has changed underneath it. The resume prompt needs to account for that ("While you were sleeping, Thorne reviewed your work and left notes in X"). Feature or hazard?
- Is the reader a single-turn invocation (like a Task sub-agent) or could it be multi-turn? Single-turn is simpler and maps cleanly to "consult an expert."
- Does the reader get full worker activation (posture, memory injection, tool resolution) or a lighter-weight subset?

### Mailbox Storage

- Files in the worktree (`.lore/mailbox/`)? Travels with the worktree, visible to both parties, consistent with "everything is files." But branch-specific.
- Daemon state (`~/.guild-hall/state/mailbox/`)? Infrastructure the daemon manages. More flexible, not branch-specific. Adds a new state concern.

### Capacity and Resource Management

- How many sleeping commissions can exist simultaneously?
- Can a sleeping commission be cancelled? What happens to pending mailbox messages?
- Timeout for sleeping commissions? What if the reader never responds?

### Relationship to Existing Patterns

- **AskUserQuestion issue:** The same underlying pattern as "pause execution, wait for external input, resume with the answer." Worker-to-worker communication and user-question-in-meetings could share the same suspend/resume mechanism. The user's reply comes through the browser; the worker's reply comes through another SDK session.
- **Fire-and-forget vs. blocking sleep:** Sleep forces the caller to stop. What if the caller has more work it can do while waiting? "Send and continue, check for reply later" avoids forced stops but introduces polling complexity. Sleep is cleaner to reason about.
- **Guild Master's role:** Does the manager need to know about worker-to-worker communication? Should it broker connections, or do workers address each other directly by name?

## Next Steps

Parked for further thought. When revisited, consider:

1. Whether the sleep/wake mechanism could also solve the AskUserQuestion async issue (shared suspend/resume pattern).
2. What the commission lifecycle layer needs to support a "sleeping" state (new state in the transition graph? or just "in_progress" with a sleeping flag?).
3. Whether a proof-of-concept could be built with just the mailbox reader (no sleep), using shared memory as the mailbox, to test whether workers actually produce useful answers when consulted this way.
