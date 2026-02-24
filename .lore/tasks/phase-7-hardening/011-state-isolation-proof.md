---
title: State Isolation Proof
date: 2026-02-23
status: complete
tags: [task]
source: .lore/plans/phase-7-hardening.md
related: [.lore/specs/guild-hall-meetings.md, .lore/specs/guild-hall-system.md]
sequence: 11
modules: [guild-hall-core]
---

# Task: State Isolation Proof

## What

Write integration tests proving the same worker can operate in a meeting and commission simultaneously with full isolation.

Create `tests/daemon/state-isolation.test.ts` with five test cases:

1. **Session isolation**: Create a meeting session and dispatch a commission for the same worker in the same project. Verify each has its own SDK session ID.

2. **Worktree isolation**: Verify the meeting worktree and commission worktree are different directories on different branches.

3. **Tool isolation**: Verify each context has its own toolbox instance. Meeting tools in meeting context, commission tools in commission context, no cross-contamination.

4. **Memory visibility**: Worker writes to worker-scope memory in the commission context. The meeting context reads the same scope on its next turn and sees the write. This proves cross-context memory visibility through shared scopes.

5. **Independent lifecycle**: Close the meeting while the commission is still running. Verify the commission continues unaffected. Then complete the commission. Verify both contexts clean up independently.

Use the DI factory pattern with mocked SDK sessions and temp directories. These tests verify the architectural boundary, not end-to-end runtime behavior.

## Validation

- All five test cases pass.
- Session IDs are distinct between meeting and commission for the same worker.
- Worktree paths and branch names are different between meeting and commission.
- Toolbox instances are separate (meeting toolbox has meeting tools, commission toolbox has commission tools).
- Memory write in commission context is readable from meeting context.
- Meeting close does not affect running commission. Commission completion does not affect (already closed) meeting.

## Why

From `.lore/specs/guild-hall-meetings.md`:
- REQ-MTG-30: "The same worker can be active in a meeting and executing a commission simultaneously. State isolation is the meeting system's responsibility: each context has its own SDK session, worktree, branch, and tool instances."

From `.lore/specs/guild-hall-system.md`:
- REQ-SYS-10: "The same worker definition can be active in multiple contexts simultaneously. State isolation between contexts is the responsibility of the meeting and commission systems."

## Files

- `tests/daemon/state-isolation.test.ts` (create)
